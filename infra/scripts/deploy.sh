#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"

load_env
require_env PORTAL_HOST_URL

echo "[+] Démarrage des services de contrôle..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

echo "[+] Vérification santé Postgres"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps postgres

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
