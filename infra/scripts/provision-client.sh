#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id>" >&2
  exit 1
fi

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR:-$(pwd)/clients}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="${SCRIPT_DIR}/../../clients/templates"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"
NETWORK="fta-client-${CLIENT_ID}"

mkdir -p "${CLIENT_DIR}/data/results"

cp "${TEMPLATE_DIR}/docker-compose.job.yml" "${CLIENT_DIR}/docker-compose.job.yml"
cp "${TEMPLATE_DIR}/client.env.example" "${CLIENT_DIR}/.env"
cp "${TEMPLATE_DIR}/config.json.template" "${CLIENT_DIR}/data/config.json"

sed -i "s/CLIENT_ID_PLACEHOLDER/${CLIENT_ID}/g" "${CLIENT_DIR}/docker-compose.job.yml"
sed -i "s/CLIENT_ID_PLACEHOLDER/${CLIENT_ID}/g" "${CLIENT_DIR}/data/config.json"

if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  docker network create "${NETWORK}" >/dev/null
  echo "Réseau ${NETWORK} créé"
else
  echo "Réseau ${NETWORK} déjà présent"
fi

echo "Client ${CLIENT_ID} provisionné dans ${CLIENT_DIR}. Mettre à jour .env si besoin (quotas/plan)."
