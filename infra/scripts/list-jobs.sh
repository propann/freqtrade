#!/usr/bin/env bash
set -euo pipefail

# Liste les jobs terminés pour un client donné.

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
RESULTS_DIR="${ROOT_DIR}/${CLIENT_ID}/data/results"

if [[ ! -d "${ROOT_DIR}/${CLIENT_ID}" ]]; then
  echo "Client ${CLIENT_ID} introuvable" >&2
  exit 1
fi

if [[ ! -d "${RESULTS_DIR}" ]]; then
  echo "Aucun résultat disponible pour ${CLIENT_ID}" >&2
  exit 0
fi

find "${RESULTS_DIR}" -maxdepth 1 -mindepth 1 -type d -printf "%f\n" | sort
