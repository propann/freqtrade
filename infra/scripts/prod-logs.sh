#!/usr/bin/env bash
# Usage: prod-logs.sh [portal|nginx|postgres] [--tail 200] [--no-follow]
# Examples:
#   sudo bash infra/scripts/prod-logs.sh
#   sudo bash infra/scripts/prod-logs.sh nginx --tail 50
#   sudo bash infra/scripts/prod-logs.sh postgres --no-follow
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
SERVICE="portal"
TAIL_LINES=200
FOLLOW="-f"

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --tail <n>     Nombre de lignes (défaut: 200)"
  echo "  --no-follow    Ne pas suivre en continu"
  echo "  -h, --help     Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    portal|nginx|postgres)
      SERVICE="$1"
      shift
      ;;
    --tail)
      TAIL_LINES="${2:-}"
      shift 2
      ;;
    --no-follow)
      FOLLOW=""
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[!] Option ou service invalide: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! [[ "${TAIL_LINES}" =~ ^[0-9]+$ ]]; then
  echo "[!] --tail doit être numérique" >&2
  exit 1
fi

load_env
require_docker_compose

echo "[+] Logs ${SERVICE} (tail=${TAIL_LINES})"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs ${FOLLOW} --tail "${TAIL_LINES}" "${SERVICE}"
