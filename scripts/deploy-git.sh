#!/usr/bin/env bash
# Деплой без rsync: git pull на сервере → тот же пайплайн, что в deploy-remote.sh.
# Безопаснее для секретов: .env только на сервере, с Mac не тянется исходник целиком.
# Переменные: SERVER, REMOTE, DOMAIN, BRANCH (default main).
#
# Первый раз, если каталог без .git (например, только rsync):
#   ssh root@SERVER "mv /var/www/platform /var/www/platform.bak && sudo -u appuser git clone 'https://github.com/ORG/platform.git' /var/www/platform && cp /var/www/platform.bak/.env /var/www/platform/.env && chown appuser:appuser /var/www/platform/.env && rm -rf /var/www/platform.bak"
# (или deploy-key + git@github.com:ORG/platform.git)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVER="${SERVER:-root@5.129.207.217}"
REMOTE="${REMOTE:-/var/www/platform}"
DOMAIN="${DOMAIN:-thebesteducation.ru}"
BRANCH="${BRANCH:-main}"

echo "→ $SERVER:$REMOTE (git origin/$BRANCH)"

if ! ssh "$SERVER" "test -d $(printf %q "$REMOTE")/.git"; then
  echo "Нет $(printf %q "$REMOTE")/.git — сначала один раз клонируй репо в $REMOTE (см. комментарий в scripts/deploy-git.sh), перенеси .env."
  exit 1
fi

ssh "$SERVER" "$(printf "export DOMAIN=%q; sudo -u appuser git -C %q pull --ff-only origin %q && bash %q/scripts/deploy-remote.sh" "$DOMAIN" "$REMOTE" "$BRANCH" "$REMOTE")"

echo "Готово: https://$DOMAIN"
