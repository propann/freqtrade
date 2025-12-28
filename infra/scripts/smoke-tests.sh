#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

load_env
require_env PORTAL_HOST_URL ADMIN_EMAIL ADMIN_PASSWORD ORCHESTRATOR_URL

health_url="${PORTAL_HOST_URL%/}/health"
orchestrator_health="${ORCHESTRATOR_URL%/}/health"

curl --fail --silent "${health_url}" >/dev/null
curl --fail --silent "${orchestrator_health}" >/dev/null

cookie_jar="$(mktemp)"
trap 'rm -f "${cookie_jar}"' EXIT

login_payload=$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
login_response=$(curl --fail --silent -c "${cookie_jar}" -X POST "${PORTAL_HOST_URL%/}/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "${login_payload}")

user_email=$(python - <<PY
import json, sys
print(json.loads(sys.stdin.read()).get('user', {}).get('email', ''))
PY
<<<"${login_response}")

if [[ -z "${user_email}" ]]; then
  echo "Failed to authenticate admin user" >&2
  exit 1
fi

session_payload='{"name":"azoth"}'
create_response=$(curl --fail --silent -b "${cookie_jar}" -X POST "${PORTAL_HOST_URL%/}/api/v1/sessions" \
  -H 'Content-Type: application/json' \
  -d "${session_payload}")

session_id=$(python - <<PY
import json, sys
print(json.loads(sys.stdin.read()).get('session', {}).get('id', ''))
PY
<<<"${create_response}")

if [[ -z "${session_id}" ]]; then
  echo "Failed to create session" >&2
  exit 1
fi

curl --fail --silent -X POST "${PORTAL_HOST_URL%/}/api/v1/sessions/${session_id}/start" \
  -b "${cookie_jar}" >/dev/null

curl --fail --silent -X POST "${PORTAL_HOST_URL%/}/api/v1/sessions/${session_id}/stop" \
  -b "${cookie_jar}" >/dev/null

curl --fail --silent "${PORTAL_HOST_URL%/}/api/v1/sessions/${session_id}/logs?tail=5" \
  -b "${cookie_jar}" >/dev/null

curl --fail --silent "${PORTAL_HOST_URL%/}/api/v1/audit?session_id=${session_id}&limit=5" \
  -b "${cookie_jar}" >/dev/null

echo "Smoke tests completed successfully."
