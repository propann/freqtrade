#!/usr/bin/env bash

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${COMMON_DIR}/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

load_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[!] Fichier .env introuvable. Copiez .env.example vers .env." >&2
    exit 2
  fi

  set -o allexport
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +o allexport
}

require_env() {
  local missing=()
  local var
  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("${var}")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    echo "[!] Variables manquantes dans ${ENV_FILE}: ${missing[*]}" >&2
    exit 2
  fi
}
