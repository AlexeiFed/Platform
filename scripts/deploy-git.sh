#!/usr/bin/env bash
# Основной деплой: git на сервере (без rsync исходников с Mac).
# Резерв: ./scripts/deploy.sh (rsync + тот же deploy-remote.sh).
#
# Переменные (Mac → ssh на SERVER):
#   SERVER          root@host
#   REMOTE          каталог на сервере (default /var/www/platform)
#   DOMAIN
#   BRANCH          default main
#   GIT_REPO        SSH origin (default git@github.com:AlexeiFed/Platform.git)
#   GIT_CLONE_HTTPS первый clone без ключа (default https://github.com/AlexeiFed/Platform.git)
#   SERVER_GIT_KEY  приватный ключ на сервере (default /var/www/.ssh/platform_github)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVER="${SERVER:-root@5.129.207.217}"
REMOTE="${REMOTE:-/var/www/platform}"
DOMAIN="${DOMAIN:-thebesteducation.ru}"
BRANCH="${BRANCH:-main}"
GIT_REPO="${GIT_REPO:-git@github.com:AlexeiFed/Platform.git}"
GIT_CLONE_HTTPS="${GIT_CLONE_HTTPS:-https://github.com/AlexeiFed/Platform.git}"
SERVER_GIT_KEY="${SERVER_GIT_KEY:-/var/www/.ssh/platform_github}"

echo "→ $SERVER:$REMOTE (git, branch $BRANCH)"

REMOTE_EXPORTS="$(printf 'export DOMAIN=%q REMOTE=%q BRANCH=%q GIT_REPO=%q GIT_CLONE_HTTPS=%q SERVER_GIT_KEY=%q;' \
  "$DOMAIN" "$REMOTE" "$BRANCH" "$GIT_REPO" "$GIT_CLONE_HTTPS" "$SERVER_GIT_KEY")"

ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=8 "$SERVER" "${REMOTE_EXPORTS} bash -s" <<'REMOTE'
set -euo pipefail

key_dir="$(dirname "$SERVER_GIT_KEY")"
mkdir -p "$key_dir"
chown appuser:appuser "$key_dir"
chmod 700 "$key_dir"

if [[ ! -f "$SERVER_GIT_KEY" ]]; then
  echo "→ нет $SERVER_GIT_KEY — создаю deploy key (ed25519)…"
  sudo -u appuser ssh-keygen -t ed25519 -f "$SERVER_GIT_KEY" -N "" -C "platform-deploy-$(hostname -s)"
  chmod 600 "$SERVER_GIT_KEY"
  chmod 644 "${SERVER_GIT_KEY}.pub"
  echo ""
  echo "=== GitHub → AlexeiFed/Platform → Settings → Deploy keys → Add (read-only OK) ==="
  cat "${SERVER_GIT_KEY}.pub"
  echo "================================================================"
  echo "После сохранения ключа снова: ./scripts/deploy-git.sh"
  exit 2
fi

chmod 600 "$SERVER_GIT_KEY" 2>/dev/null || true
chown appuser:appuser "$SERVER_GIT_KEY" 2>/dev/null || true

export GIT_SSH_COMMAND="ssh -i ${SERVER_GIT_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -F /dev/null"

ssh_origin_ok() {
  sudo -u appuser env GIT_SSH_COMMAND="$GIT_SSH_COMMAND" git ls-remote "$GIT_REPO" HEAD &>/dev/null
}

try_ssh_origin() {
  if ssh_origin_ok; then
    sudo -u appuser git -C "$REMOTE" remote set-url origin "$GIT_REPO"
    sudo -u appuser git -C "$REMOTE" config core.sshCommand "$GIT_SSH_COMMAND"
    return 0
  fi
  sudo -u appuser git -C "$REMOTE" remote set-url origin "$GIT_CLONE_HTTPS"
  sudo -u appuser git -C "$REMOTE" config --unset core.sshCommand 2>/dev/null || true
  return 1
}

# Git ≥2.35: при владельце репозитория ≠ appuser (часто после rsync под root) git отказывается работать.
ensure_git_safe_directory() {
  [[ -d "${REMOTE}/.git" ]] || return 0
  if ! sudo -u appuser git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "$REMOTE"; then
    sudo -u appuser git config --global --add safe.directory "$REMOTE"
  fi
}

if [[ ! -d "$REMOTE/.git" ]]; then
  echo "→ нет $REMOTE/.git — bootstrap (бэкап, clone по HTTPS)…"
  ts="$(date +%s)"
  if [[ -d "$REMOTE" ]]; then
    mv "$REMOTE" "${REMOTE}.rsync-backup.${ts}"
  fi
  mkdir -p "$REMOTE"
  chown appuser:appuser "$REMOTE"
  sudo -u appuser git clone --branch "$BRANCH" --depth 1 "$GIT_CLONE_HTTPS" "$REMOTE"
  if [[ -f "${REMOTE}.rsync-backup.${ts}/.env" ]]; then
    cp "${REMOTE}.rsync-backup.${ts}/.env" "$REMOTE/.env"
    chown appuser:appuser "$REMOTE/.env"
    chmod 600 "$REMOTE/.env"
  fi
  try_ssh_origin || echo "→ Deploy key ещё не на GitHub — origin остаётся HTTPS."
fi

ensure_git_safe_directory

# Иначе git pull не может перезаписать файлы, созданные root / другим пользователем.
chown -R appuser:appuser "$REMOTE" 2>/dev/null || true

if [[ "$(sudo -u appuser git -C "$REMOTE" remote get-url origin 2>/dev/null || true)" == "$GIT_CLONE_HTTPS" ]]; then
  try_ssh_origin || true
fi

sudo -u appuser git -C "$REMOTE" fetch origin "$BRANCH"
sudo -u appuser git -C "$REMOTE" checkout "$BRANCH"
sudo -u appuser git -C "$REMOTE" pull --ff-only origin "$BRANCH"

export DOMAIN
bash "$REMOTE/scripts/deploy-remote.sh"
REMOTE

echo "Готово: https://$DOMAIN"
