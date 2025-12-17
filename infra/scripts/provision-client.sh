#!/usr/bin/env bash
set -euo pipefail

# Provisionne un environnement isolé pour un client.
# - Crée un réseau dédié fta-client-<id>
# - Génère les fichiers de config depuis templates
# - Prépare les volumes de données

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id>" >&2
  exit 1
fi

CLIENT_ID="$1"
ROOT_DIR="${CLIENTS_DIR:-./clients}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="${SCRIPT_DIR}/../../clients/templates"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"
NETWORK="fta-client-${CLIENT_ID}"

mkdir -p "${CLIENT_DIR}/data"

# Copie les templates
cp "${TEMPLATE_DIR}/docker-compose.client.yml" "${CLIENT_DIR}/docker-compose.yml"
cp "${TEMPLATE_DIR}/client.env.example" "${CLIENT_DIR}/.env"
cp "${TEMPLATE_DIR}/config.json.template" "${CLIENT_DIR}/config.json"

# Substitue le CLIENT_ID dans les fichiers
sed -i "s/CLIENT_ID_PLACEHOLDER/${CLIENT_ID}/g" "${CLIENT_DIR}/docker-compose.yml"
sed -i "s/CLIENT_ID_PLACEHOLDER/${CLIENT_ID}/g" "${CLIENT_DIR}/config.json"

# Crée le réseau dédié si absent
if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  docker network create "${NETWORK}" >/dev/null
  echo "Réseau ${NETWORK} créé"
else
  echo "Réseau ${NETWORK} déjà présent"
fi

echo "Client ${CLIENT_ID} provisionné dans ${CLIENT_DIR}"
