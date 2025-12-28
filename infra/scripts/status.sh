#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"

load_env

echo "[+] Services de contrôle"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo
if command -v docker >/dev/null; then
  echo "[+] Réseaux clients (fta-client-*)"
  docker network ls --format '{{.Name}}' | grep '^fta-client-' || echo "Aucun réseau client encore créé"
fi
