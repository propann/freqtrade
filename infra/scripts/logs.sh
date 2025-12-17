#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
SERVICE="${1:-portal}"

echo "[+] Affichage des logs pour ${SERVICE} (ne contient pas de secrets)."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs -f "${SERVICE}"
