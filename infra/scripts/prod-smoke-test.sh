#!/usr/bin/env bash
# Usage: prod-smoke-test.sh [--public-url https://app.example.com/health]
# Examples:
#   sudo bash infra/scripts/prod-smoke-test.sh
#   sudo bash infra/scripts/prod-smoke-test.sh --public-url https://app.quant-core.app/health
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

PUBLIC_HEALTH_URL=""

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --public-url <url>  URL publique pour /health"
  echo "  -h, --help          Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-url)
      PUBLIC_HEALTH_URL="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[!] Option inconnue: $1" >&2
      usage
      exit 1
      ;;
  esac
done

health_check() {
  local url="$1"
  local label="$2"
  if curl -fsS --max-time 5 "${url}" >/dev/null; then
    echo "[ok] ${label} UP (${url})"
  else
    echo "[!] ${label} KO (${url})" >&2
    exit 1
  fi
}

load_env
require_env PORTAL_HOST_URL PORTAL_ADMIN_TOKEN
require_cmd curl mktemp

health_check "${PORTAL_HOST_URL%/}/health" "Portail (local)"
if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  health_check "${PUBLIC_HEALTH_URL}" "Portail (public)"
fi

API_URL="${PORTAL_HOST_URL%/}/api"
tmp_body="$(mktemp)"
trap 'rm -f "${tmp_body}"' EXIT

status_code=$(
  curl -sS -o "${tmp_body}" -w "%{http_code}" \
    -H "X-Admin-Token: ${PORTAL_ADMIN_TOKEN}" \
    -H "Authorization: Bearer ${PORTAL_ADMIN_TOKEN}" \
    "${API_URL}/clients"
)

if [[ "${status_code}" != 2* ]]; then
  echo "[!] Admin API KO (HTTP ${status_code})" >&2
  cat "${tmp_body}" >&2
  exit 1
fi

echo "[ok] Admin API (clients) OK (HTTP ${status_code})"
cat "${tmp_body}"
