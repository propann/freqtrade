#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

# shellcheck disable=SC2034
REQUIRED_VARS=(
  PORTAL_INTERNAL_PORT
  PORTAL_HTTP_PORT
  PORTAL_JWT_SECRET
  PORTAL_ADMIN_TOKEN
  ADMIN_EMAIL
  ADMIN_PASSWORD_HASH
  ADMIN_TENANT_ID
  PORTAL_JWT_TTL
  PORTAL_HOST_URL
  PORTAL_INTERNAL_URL
  POSTGRES_HOST
  POSTGRES_PORT
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  DOCKER_NETWORK
  CLIENTS_DIR
  TEMPLATES_DIR
  DEFAULT_CPU
  DEFAULT_MEM_LIMIT
  DEFAULT_PIDS_LIMIT
  DOCKER_COMPOSE_BIN
  ORCHESTRATOR_DRY_RUN
  ORCHESTRATOR_URL
  PAYPAL_CLIENT_ID
  PAYPAL_CLIENT_SECRET
  PAYPAL_WEBHOOK_ID
)

ALLOW_EMPTY=(
  PAYPAL_CLIENT_ID
  PAYPAL_CLIENT_SECRET
  PAYPAL_WEBHOOK_ID
)

usage() {
  echo "Usage: $0"
  echo
  echo "Vérifie la présence des variables requises et les répertoires clients/logs."
}

is_allow_empty() {
  local needle="$1"
  local item
  for item in "${ALLOW_EMPTY[@]}"; do
    if [[ "${item}" == "${needle}" ]]; then
      return 0
    fi
  done
  return 1
}

check_required_vars() {
  local missing=()
  local var
  for var in "${REQUIRED_VARS[@]}"; do
    if [[ ! -v "${var}" ]]; then
      missing+=("${var} (unset)")
      continue
    fi
    if [[ -z "${!var}" ]] && ! is_allow_empty "${var}"; then
      missing+=("${var} (empty)")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    echo "Missing required environment variables in ${ENV_FILE}:"
    local item
    for item in "${missing[@]}"; do
      echo " - ${item}"
    done
    return 1
  fi

  echo "All required environment variables are set."
}

check_directories() {
  local issues=()
  local path
  for path in "${ROOT_DIR}/clients" "${ROOT_DIR}/logs"; do
    if [[ ! -d "${path}" ]]; then
      issues+=("${path} (absent)")
      continue
    fi
    if [[ ! -w "${path}" || ! -x "${path}" ]]; then
      issues+=("${path} (not writable by current user)")
    fi
  done

  if (( ${#issues[@]} > 0 )); then
    echo "Directory checks failed:"
    local item
    for item in "${issues[@]}"; do
      echo " - ${item}"
    done
    echo "Ensure the directories exist and are writable (chown to uid 1000 if needed)."
    return 1
  fi

  echo "clients/logs directories are present and writable."
}

main() {
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
  fi

  load_env
  check_required_vars
  check_directories
}

main "$@"
