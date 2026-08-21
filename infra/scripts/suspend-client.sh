#!/usr/bin/env bash
set -euo pipefail

# Arrête le bot d'un client sans supprimer les données.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 <client_id>"
  echo
  echo "Arrête le bot d'un client sans supprimer les données."
  exit 0
fi

if [[ $# -lt 1 ]]; then
  echo "[!] Usage: $0 <client_id>" >&2
  exit 2
fi

load_env
require_env CLIENTS_DIR
require_docker_compose

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR}"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"

if [[ ! -d "${CLIENT_DIR}" ]]; then
  echo "Client ${CLIENT_ID} introuvable" >&2
  exit 1
fi

docker compose -f "${CLIENT_DIR}/docker-compose.yml" --env-file "${CLIENT_DIR}/.env" down

echo "Client ${CLIENT_ID} suspendu"
