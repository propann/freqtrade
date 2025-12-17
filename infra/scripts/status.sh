#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"

echo "[+] Services de contrôle"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo
if command -v docker >/dev/null; then
  echo "[+] Réseaux clients (fta-client-*)"
  docker network ls --format '{{.Name}}' | grep '^fta-client-' || echo "Aucun réseau client encore créé"
fi
