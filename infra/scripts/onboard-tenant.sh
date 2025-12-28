#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 <tenant_id> <email>"
  exit 0
fi

if [[ -z "${1:-}" || -z "${2:-}" ]]; then
  echo "[!] Usage: $0 <tenant_id> <email>" >&2
  exit 2
fi

load_env
require_env CLIENTS_DIR PORTAL_INTERNAL_URL PORTAL_HOST_URL

TENANT_ID="$1"
EMAIL="$2"
API_URL=${API_URL:-"${PORTAL_INTERNAL_URL%/}/api"}

mkdir -p "$CLIENTS_DIR/$TENANT_ID"/data "$CLIENTS_DIR/$TENANT_ID"/configs

cat <<EOF
[onboard-tenant]
tenant=$TENANT_ID
email=$EMAIL
api=$API_URL
portal_host=$PORTAL_HOST_URL
client_dir=$CLIENTS_DIR/$TENANT_ID
EOF

curl -sS -X POST "$API_URL/tenants" \
  -H 'Content-Type: application/json' \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"email\":\"$EMAIL\",\"subscription_status\":\"active\"}" || true
