#!/usr/bin/env bash
set -euo pipefail

# Supprime entièrement l'environnement d'un client (conteneurs, réseau, données locales).

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id>" >&2
  exit 1
fi

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR:-./clients}"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"
NETWORK="fta-client-${CLIENT_ID}"

if [[ -d "${CLIENT_DIR}" ]]; then
  docker compose -f "${CLIENT_DIR}/docker-compose.yml" --env-file "${CLIENT_DIR}/.env" down -v || true
  rm -rf "${CLIENT_DIR}"
  echo "Répertoire ${CLIENT_DIR} supprimé"
else
  echo "Aucun répertoire pour ${CLIENT_ID}" >&2
fi

if docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  docker network rm "${NETWORK}" >/dev/null
  echo "Réseau ${NETWORK} supprimé"
fi

echo "Client ${CLIENT_ID} détruit"
