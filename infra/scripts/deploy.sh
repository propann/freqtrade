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

PORTAL_HOST_URL="${PORTAL_HOST_URL:-http://localhost:${PORTAL_HTTP_PORT:-8088}}"
PORTAL_HEALTH="${PORTAL_HOST_URL%/}/health"

if command -v curl >/dev/null 2>&1; then
  echo "[+] Vérification du portail sur ${PORTAL_HEALTH}"
  healthy=false
  for _ in {1..10}; do
    if curl --fail --silent --max-time 3 "${PORTAL_HEALTH}" >/dev/null; then
      healthy=true
      echo "[+] Portail OK (healthcheck réussi)"
      break
    fi
    sleep 3
  done
  if [[ "${healthy}" != true ]]; then
    echo "[!] Portail non joignable après déploiement" >&2
    exit 1
  fi
else
  echo "[!] curl indisponible : vérifiez manuellement ${PORTAL_HEALTH}" >&2
fi

echo "[+] Portail disponible sur ${PORTAL_HOST_URL}."
