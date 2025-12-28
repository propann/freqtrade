#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0"
  echo
  echo "Test d'accès aux endpoints admin avec PORTAL_ADMIN_TOKEN."
  exit 0
fi

load_env
require_env PORTAL_HOST_URL PORTAL_ADMIN_TOKEN
require_cmd curl

API_URL="${PORTAL_HOST_URL%/}/api"
tmp_body="$(mktemp)"

status_code=$(
  curl -sS -o "${tmp_body}" -w "%{http_code}" \
    -H "X-Admin-Token: ${PORTAL_ADMIN_TOKEN}" \
    -H "Authorization: Bearer ${PORTAL_ADMIN_TOKEN}" \
    "${API_URL}/clients"
)

if [[ "${status_code}" != 2* ]]; then
  echo "[!] Admin API test failed (HTTP ${status_code}). Response:" >&2
  cat "${tmp_body}" >&2
  rm -f "${tmp_body}"
  exit 1
fi

echo "[ok] Admin API reachable (HTTP ${status_code}). Response:"
cat "${tmp_body}"
rm -f "${tmp_body}"
