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
SITE_AVAIL="/etc/nginx/sites-available/thebesteducation.ru"
SITE_EN="/etc/nginx/sites-enabled/thebesteducation.ru"
UNIT_DST="/etc/systemd/system/platform-thebesteducation.service"

if [[ ! -L "$SITE_EN" ]] || [[ ! -f "$SITE_AVAIL" ]]; then
  cp -f "$NGX_SRC" "$SITE_AVAIL"
  ln -sf "$SITE_AVAIL" "$SITE_EN"
  nginx -t
  systemctl reload nginx
fi

if [[ ! -f "$UNIT_DST" ]]; then
  cp -f "$UNIT_SRC" "$UNIT_DST"
  systemctl daemon-reload
  systemctl enable platform-thebesteducation.service
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if ! command -v pnpm >/dev/null 2>&1; then
  ( cd /root && corepack enable && corepack prepare pnpm@9.15.0 --activate )
fi

echo "→ pnpm install (offline cache если есть)"
sudo -u appuser bash -lc "
  set -euo pipefail
  cd '$ROOT'
  pnpm install --frozen-lockfile --prefer-offline
  pnpm exec prisma generate
  pnpm exec prisma db push
  pnpm build
  test -f .next/standalone/server.js
  mkdir -p .next/standalone/.next
  cp -r public .next/standalone/
  cp -r .next/static .next/standalone/.next/
"

systemctl restart platform-thebesteducation.service
sleep 1
systemctl is-active platform-thebesteducation.service

if ! certbot certificates 2>/dev/null | grep -q "Certificate Name: $DOMAIN"; then
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --redirect || true
  nginx -t && systemctl reload nginx
fi

echo "→ сервис обновлён: https://$DOMAIN"
