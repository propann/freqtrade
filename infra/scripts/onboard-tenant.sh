#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" || -z "${2:-}" ]]; then
  echo "Usage: CLIENTS_DIR=$(pwd)/clients $0 <tenant_id> <email>" >&2
  exit 1
fi

CLIENTS_DIR=${CLIENTS_DIR:-"$(pwd)/clients"}
TENANT_ID="$1"
EMAIL="$2"
API_URL=${API_URL:-"http://127.0.0.1:9000"}

mkdir -p "$CLIENTS_DIR/$TENANT_ID"/data "$CLIENTS_DIR/$TENANT_ID"/configs

cat <<EOF
[onboard-tenant]
tenant=$TENANT_ID
email=$EMAIL
api=$API_URL
client_dir=$CLIENTS_DIR/$TENANT_ID
EOF

curl -sS -X POST "$API_URL/tenants" \
  -H 'Content-Type: application/json' \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"email\":\"$EMAIL\",\"subscription_status\":\"active\"}" || true
