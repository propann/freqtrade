#!/usr/bin/env bash
# Usage: prod-rotate-secrets.sh [--no-restart]
# Examples:
#   sudo bash infra/scripts/prod-rotate-secrets.sh
#   sudo bash infra/scripts/prod-rotate-secrets.sh --no-restart
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

RESTART=true

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --no-restart  Ne pas relancer la stack (à faire manuellement ensuite)"
  echo "  -h, --help    Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-restart)
      RESTART=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[!] Option inconnue: $1" >&2
      usage
      exit 1
      ;;
  esac
done

generate_secret() {
  openssl rand -hex 48
}

update_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    echo "${key}=${value}" >> "${file}"
  fi
}

load_env
ENV_PATH="$(resolve_env_file)"
require_cmd openssl

if [[ ! -w "${ENV_PATH}" ]]; then
  echo "[!] ${ENV_PATH} n'est pas modifiable (chmod 600, root:root)." >&2
  exit 1
fi

umask 077
new_jwt="$(generate_secret)"
new_admin_token="$(generate_secret)"

update_env_var "PORTAL_JWT_SECRET" "${new_jwt}" "${ENV_PATH}"
update_env_var "PORTAL_ADMIN_TOKEN" "${new_admin_token}" "${ENV_PATH}"

echo "[ok] Secrets régénérés dans ${ENV_PATH}"
echo "PORTAL_JWT_SECRET=${new_jwt}"
echo "PORTAL_ADMIN_TOKEN=${new_admin_token}"
echo "Note: les sessions devront se reconnecter (JWT) et les scripts admin doivent utiliser le nouveau token."

if "${RESTART}"; then
  echo "[+] Restart de la stack pour appliquer les secrets"
  bash "${SCRIPT_DIR}/prod-restart.sh" --no-build
else
  echo "[=] Redémarrage non lancé (--no-restart). Exécutez prod-restart.sh pour appliquer."
fi
