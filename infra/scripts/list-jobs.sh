#!/usr/bin/env bash
set -euo pipefail

# Liste les jobs terminés pour un client donné.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id>" >&2
  exit 1
fi

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR:-./clients}"
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
