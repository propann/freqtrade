#!/usr/bin/env bash
set -euo pipefail

PORTAL_HOST_URL=${PORTAL_HOST_URL:-"http://localhost:8088"}
ADMIN_EMAIL=${ADMIN_EMAIL:-"admin@example.com"}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-""}

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  echo "ADMIN_PASSWORD must be set to run smoke tests." >&2
  exit 1
fi

health_url="${PORTAL_HOST_URL%/}/health"

curl --fail --silent "${health_url}" >/dev/null

login_payload=$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
login_response=$(curl --fail --silent -X POST "${PORTAL_HOST_URL%/}/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "${login_payload}")

token=$(python - <<PY
import json, sys
print(json.loads(sys.stdin.read()).get('token', ''))
PY
<<<"${login_response}")

if [[ -z "${token}" ]]; then
  echo "Failed to get auth token" >&2
  exit 1
fi

session_payload='{"name":"azoth"}'
create_response=$(curl --fail --silent -X POST "${PORTAL_HOST_URL%/}/api/v1/sessions" \
  -H "Authorization: Bearer ${token}" \
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
  -H "Authorization: Bearer ${token}" >/dev/null

curl --fail --silent -X POST "${PORTAL_HOST_URL%/}/api/v1/sessions/${session_id}/stop" \
  -H "Authorization: Bearer ${token}" >/dev/null

curl --fail --silent "${PORTAL_HOST_URL%/}/api/v1/sessions/${session_id}/logs?tail=5" \
  -H "Authorization: Bearer ${token}" >/dev/null

echo "Smoke tests completed successfully."
