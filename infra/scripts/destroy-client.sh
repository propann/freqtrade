#!/usr/bin/env bash
set -euo pipefail

# Supprime entièrement l'environnement d'un client (conteneurs, réseau, données locales).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 <client_id>"
  exit 0
fi

if [[ $# -lt 1 ]]; then
  echo "[!] Usage: $0 <client_id>" >&2
  exit 2
fi

load_env
require_env CLIENTS_DIR

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR}"
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
