#!/usr/bin/env bash
set -euo pipefail

# Affiche l'état des conteneurs du client.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id>" >&2
  exit 1
fi

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR:-./clients}"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"

if [[ ! -d "${CLIENT_DIR}" ]]; then
  echo "Client ${CLIENT_ID} introuvable" >&2
  exit 1
fi

docker compose -f "${CLIENT_DIR}/docker-compose.yml" --env-file "${CLIENT_DIR}/.env" ps
