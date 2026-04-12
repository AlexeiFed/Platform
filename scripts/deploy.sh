#!/usr/bin/env bash
# Деплой на прод: rsync исходников → scripts/deploy-remote.sh на сервере.
# Альтернатива без rsync: ./scripts/deploy-git.sh (нужен .git на сервере).
# Переменные: SERVER, REMOTE, DOMAIN.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVER="${SERVER:-root@5.129.207.217}"
REMOTE="${REMOTE:-/var/www/platform}"
DOMAIN="${DOMAIN:-thebesteducation.ru}"

echo "→ $SERVER:$REMOTE (rsync + remote build)"

ssh "$SERVER" "mkdir -p '$REMOTE'"

echo "→ rsync…"
rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  ./ "${SERVER}:${REMOTE}/"

# После rsync владелец файлов — UID с отправителя (-a), не appuser → без этого pnpm/build от appuser падают.
echo "→ chown appuser…"
ssh "$SERVER" "chown -R appuser:appuser '$REMOTE'"

echo "→ сборка и systemd на сервере…"
ssh "$SERVER" "$(printf "export DOMAIN=%q; bash %q/scripts/deploy-remote.sh" "$DOMAIN" "$REMOTE")"

echo "Готово: https://$DOMAIN"
