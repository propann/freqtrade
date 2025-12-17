#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id>" >&2
  exit 1
fi

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR:-$(pwd)/clients}"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"
NETWORK="fta-client-${CLIENT_ID}"

"$(dirname "$0")/suspend-client.sh" "${CLIENT_ID}" || true

if docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  docker network rm "${NETWORK}" >/dev/null
  echo "Réseau ${NETWORK} supprimé"
fi

if [[ -d "${CLIENT_DIR}" ]]; then
  rm -rf "${CLIENT_DIR}"
  echo "Répertoire ${CLIENT_DIR} supprimé"
fi
