#!/usr/bin/env bash
# Usage: prod-status.sh [--public-url https://app.example.com/health]
# Examples:
#   sudo bash infra/scripts/prod-status.sh
#   sudo bash infra/scripts/prod-status.sh --public-url https://app.quant-core.app/health
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
PUBLIC_HEALTH_URL=""

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --public-url <url>  URL de healthcheck publique (https://.../health)"
  echo "  -h, --help          Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-url)
      PUBLIC_HEALTH_URL="${2:-}"
      shift 2
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

health_check() {
  local url="$1"
  local label="$2"
  if curl -fsS --max-time 5 "${url}" >/dev/null; then
    echo "[ok] ${label} UP (${url})"
  else
    echo "[!] ${label} KO (${url})" >&2
  fi
}

load_env
require_env PORTAL_HOST_URL POSTGRES_DB POSTGRES_USER
require_docker_compose
require_cmd curl df free uptime

echo "[+] Services docker compose"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo
health_check "${PORTAL_HOST_URL%/}/health" "Portail (local)"
if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  health_check "${PUBLIC_HEALTH_URL}" "Portail (public)"
fi

echo
echo "[+] Ressources hôte"
df -h /
free -h
uptime
