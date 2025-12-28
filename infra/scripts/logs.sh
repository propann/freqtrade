#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
SERVICE="${1:-portal}"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 [service]"
  echo
  echo "Suit les logs d'un service docker compose."
  exit 0
fi

load_env
require_docker_compose

echo "[+] Affichage des logs pour ${SERVICE} (ne contient pas de secrets)."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs -f "${SERVICE}"
