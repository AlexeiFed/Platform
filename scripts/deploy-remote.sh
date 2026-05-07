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

echo "→ pnpm install (offline cache если есть)"
# migrate deploy. P3005: БД уже с данными, но нет записей в _prisma_migrations (раньше был db push).
# Тогда один раз: SQL миграции → resolve --applied → снова migrate deploy.
sudo -u appuser bash -lc "
  set -euo pipefail
  cd '$ROOT'
  # Увеличиваем heap Node — next build + tsc падают по OOM на слабом VPS.
  export NODE_OPTIONS='--max-old-space-size=4096'
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
