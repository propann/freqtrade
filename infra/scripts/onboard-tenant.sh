#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 <tenant_id> <email>"
  echo
  echo "Prépare le dossier client et enregistre le tenant via l'API."
  exit 0
fi

if [[ -z "${1:-}" || -z "${2:-}" ]]; then
  echo "[!] Usage: $0 <tenant_id> <email>" >&2
  exit 2
fi

load_env
require_env CLIENTS_DIR PORTAL_INTERNAL_URL PORTAL_HOST_URL PORTAL_ADMIN_TOKEN
require_cmd curl

TENANT_ID="$1"
EMAIL="$2"
API_URL="${PORTAL_INTERNAL_URL%/}/api"

mkdir -p "$CLIENTS_DIR/$TENANT_ID"/data "$CLIENTS_DIR/$TENANT_ID"/configs

cat <<EOF
[onboard-tenant]
tenant=$TENANT_ID
email=$EMAIL
api=$API_URL
portal_host=$PORTAL_HOST_URL
client_dir=$CLIENTS_DIR/$TENANT_ID
EOF

payload=$(printf '{"id":"%s","email":"%s","subscription_status":"active"}' "$TENANT_ID" "$EMAIL")
tmp_body="$(mktemp)"
status_code=$(
  curl -sS -o "${tmp_body}" -w "%{http_code}" -X POST "$API_URL/tenants" \
    -H 'Content-Type: application/json' \
    -H "X-Admin-Token: ${PORTAL_ADMIN_TOKEN}" \
    -H "Authorization: Bearer ${PORTAL_ADMIN_TOKEN}" \
    -d "${payload}"
)

if [[ "${status_code}" != 2* ]]; then
  echo "[!] Onboarding failed (HTTP ${status_code}). Response:" >&2
  cat "${tmp_body}" >&2
  rm -f "${tmp_body}"
  exit 1
fi

cat "${tmp_body}"
rm -f "${tmp_body}"
