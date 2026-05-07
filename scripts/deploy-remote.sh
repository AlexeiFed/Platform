#!/usr/bin/env bash
# Запускать на сервере от root (через ssh): env DOMAIN=… ./scripts/deploy-remote.sh
# Корень репозитория вычисляется по расположению скрипта.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${DOMAIN:-thebesteducation.ru}"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  DB_USER="platform_thebestedu"
  DB_NAME="platform_thebestedu"
  if [[ "$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")" == "1" ]]; then
    echo "Есть роль PostgreSQL $DB_USER, но нет $ROOT/.env — восстанови .env вручную."
    exit 1
  fi
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  AUTH_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
  cat > "$ROOT/.env" <<EOF
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public"
AUTH_SECRET="${AUTH_SECRET}"
AUTH_URL="https://${DOMAIN}"
S3_ACCESS_KEY_ID="CHANGEME"
S3_SECRET_ACCESS_KEY="CHANGEME"
S3_BUCKET="CHANGEME"
S3_REGION="ru-central1"
S3_ENDPOINT="https://storage.yandexcloud.net"
NEXT_PUBLIC_S3_BUCKET=""
NEXT_PUBLIC_S3_ENDPOINT="https://storage.yandexcloud.net"
EOF
  chown appuser:appuser "$ROOT/.env"
  chmod 600 "$ROOT/.env"
  echo "Созданы БД $DB_NAME и $ROOT/.env — замени S3_* и NEXT_PUBLIC_S3_* на реальные значения с Yandex Cloud."
fi

NGX_SRC="$ROOT/deploy/nginx-thebesteducation.ru.conf"
UNIT_SRC="$ROOT/deploy/platform-thebesteducation.service"
LIVE_UNIT_SRC="$ROOT/deploy/platform-thebesteducation-live.service"
SITE_AVAIL="/etc/nginx/sites-available/thebesteducation.ru"
SITE_EN="/etc/nginx/sites-enabled/thebesteducation.ru"
UNIT_DST="/etc/systemd/system/platform-thebesteducation.service"
LIVE_UNIT_DST="/etc/systemd/system/platform-thebesteducation-live.service"

cp -f "$NGX_SRC" "$SITE_AVAIL"
ln -sf "$SITE_AVAIL" "$SITE_EN"
nginx -t
systemctl reload nginx

if [[ ! -f "$UNIT_DST" ]]; then
  cp -f "$UNIT_SRC" "$UNIT_DST"
  systemctl daemon-reload
  systemctl enable platform-thebesteducation.service
fi

if [[ ! -f "$LIVE_UNIT_DST" ]]; then
  cp -f "$LIVE_UNIT_SRC" "$LIVE_UNIT_DST"
  systemctl daemon-reload
  systemctl enable platform-thebesteducation-live.service
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if ! command -v pnpm >/dev/null 2>&1; then
  ( cd /root && corepack enable && corepack prepare pnpm@9.15.0 --activate )
fi

# mediasoup: при ошибке распаковки prebuild (TAR_ENTRY_ERROR) идёт локальная сборка и нужен pip (invoke).
if command -v apt-get >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
  if ! python3 -m pip --version >/dev/null 2>&1; then
    echo "→ apt: python3-pip (fallback-сборка mediasoup worker)"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq python3-pip
  fi
fi

echo "→ pnpm install (offline cache если есть; при неизменном lock можно пропустить)"
# migrate deploy. P3005: БД уже с данными, но нет записей в _prisma_migrations (раньше был db push).
# Тогда один раз: SQL миграции → resolve --applied → снова migrate deploy.
sudo -u appuser bash -lc "
  set -euo pipefail
  cd '$ROOT'
  # Увеличиваем heap Node — next build + tsc падают по OOM на слабом VPS.
  export NODE_OPTIONS='--max-old-space-size=4096'

  LOCK_SHA=\$(sha256sum pnpm-lock.yaml | awk '{print \$1}')
  STAMP_FILE=\"\$PWD/.deploy-deps.stamp\"
  mediasoup_worker_ok() {
    find \"\$PWD/node_modules/.pnpm\" -path '*/node_modules/mediasoup/worker/out/Release/mediasoup-worker' -type f -executable 2>/dev/null | grep -q .
  }
  SKIP_DEPS=0
  if [[ -f \"\$STAMP_FILE\" ]] && [[ \"\$(cat \"\$STAMP_FILE\")\" == \"\$LOCK_SHA\" ]] && mediasoup_worker_ok; then
    SKIP_DEPS=1
  fi

  if [[ \"\$SKIP_DEPS\" -eq 1 ]]; then
    echo \"→ lockfile и mediasoup worker без изменений — пропуск pnpm install и rebuild mediasoup\"
  else
    # Важно: mediasoup postinstall качает prebuilt worker с GitHub и часто подвисает/таймаутится.
    # Поэтому ставим зависимости без скриптов, а mediasoup собираем отдельно с ретраями.
    pnpm install --frozen-lockfile --prefer-offline --ignore-scripts --config.network-timeout=600000

    for i in 1 2 3 4 5; do
      echo \"→ mediasoup postinstall (attempt \$i/5)\"
      if pnpm rebuild mediasoup --config.network-timeout=600000; then
        break
      fi
      if [ \"\$i\" -eq 5 ]; then
        echo \"✖ mediasoup postinstall failed after retries\"
        exit 1
      fi
      sleep 5
    done
    printf '%s\n' \"\$LOCK_SHA\" > \"\$STAMP_FILE\"
  fi
  pnpm exec prisma generate
  set +e
  migrate_out=\$(pnpm exec prisma migrate deploy 2>&1)
  migrate_ec=\$?
  set -e
  printf '%s\n' \"\$migrate_out\"
  if [ \"\$migrate_ec\" -eq 0 ]; then
    :
  elif printf '%s' \"\$migrate_out\" | grep -qF 'P3005'; then
    echo \"→ Prisma P3005: baseline миграции тарифов…\"
    pnpm exec prisma db execute \\
      --file \"\$PWD/prisma/migrations/20260413140000_add_product_tariffs_criteria/migration.sql\" \\
      --schema \"\$PWD/prisma/schema.prisma\" \\
      || echo \"⚠ db execute завершился с ошибкой (возможно SQL уже применяли вручную)\"
    pnpm exec prisma migrate resolve --applied 20260413140000_add_product_tariffs_criteria
    pnpm exec prisma migrate deploy
  else
    exit \"\$migrate_ec\"
  fi
  set -euo pipefail
  # Важно: чистим артефакты сборки, иначе Next может пытаться загрузить несуществующие чанки.
  rm -rf .next
  pnpm build
  test -f .next/standalone/server.js
  mkdir -p .next/standalone/.next
  cp -r public .next/standalone/
  cp -r .next/static .next/standalone/.next/
"

systemctl restart platform-thebesteducation.service
sleep 1
systemctl is-active platform-thebesteducation.service

systemctl restart platform-thebesteducation-live.service
sleep 1
systemctl is-active platform-thebesteducation-live.service

echo "→ проверка/обновление TLS сертификата"
if ! certbot --nginx \
  --cert-name "$DOMAIN" \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --expand \
  --keep-until-expiring \
  --non-interactive \
  --agree-tos \
  --redirect; then
  echo "⚠ certbot не смог обновить сертификат. Проверь DNS A/AAAA и certbot logs."
fi

nginx -t && systemctl reload nginx

echo "→ сервис обновлён: https://$DOMAIN"
