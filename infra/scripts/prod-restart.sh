#!/usr/bin/env bash
# Usage: prod-restart.sh [--no-build]
# Examples:
#   sudo bash infra/scripts/prod-restart.sh
#   sudo bash infra/scripts/prod-restart.sh --no-build
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
BUILD=true
HEALTH_TIMEOUT=120

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --no-build   Redémarre sans rebuild des images"
  echo "  -h, --help   Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      BUILD=false
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

wait_for_health() {
  local url="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT))

  echo "[+] Healthcheck ${url}"
  while (( SECONDS <= deadline )); do
    if curl -fsS --max-time 5 "${url}" >/dev/null; then
      echo "[ok] Portail UP"
      return 0
    fi
    sleep 3
  done

  echo "[!] Portail KO après ${HEALTH_TIMEOUT}s (${url})" >&2
  return 1
}

load_env
require_env PORTAL_HOST_URL
require_docker_compose
require_cmd curl

echo "[+] Arrêt propre des services"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" down

echo "[+] Relance docker compose"
if "${BUILD}"; then
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build
else
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d
fi

wait_for_health "${PORTAL_HOST_URL%/}/health"
