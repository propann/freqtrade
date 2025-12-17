#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[+] Fichier .env absent. Copie de .env.example ..."
  cp "${ROOT_DIR}/.env.example" "${ENV_FILE}"
fi

set -o allexport
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +o allexport

echo "[+] Démarrage des services de contrôle..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

echo "[+] Vérification santé Postgres"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps postgres

echo "[+] Portail disponible sur 127.0.0.1:${PORTAL_HTTP_PORT:-8088} (via Nginx)."
