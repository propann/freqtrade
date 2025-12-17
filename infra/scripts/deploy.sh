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

PORTAL_PORT="${PORTAL_HTTP_PORT:-8088}"
echo "[+] Attente de la santé du portail sur 127.0.0.1:${PORTAL_PORT}/health ..."
for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:${PORTAL_PORT}/health" >/dev/null 2>&1; then
    echo "[+] Portail opérationnel sur 127.0.0.1:${PORTAL_PORT} (via Nginx)."
    exit 0
  fi
  sleep 2
done

echo "[!] Le portail ne répond pas encore sur /health. Vérifiez les logs docker compose." >&2
exit 1
