#!/usr/bin/env bash

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${COMMON_DIR}/../.." && pwd)"
DEFAULT_ENV_FILE="${ROOT_DIR}/.env"
SYSTEM_ENV_FILE="/etc/quant-core/quant-core.env"
ENV_FILE="${ENV_FILE:-}"

require_cmd() {
  local missing=()
  local cmd
  for cmd in "$@"; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      missing+=("${cmd}")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    echo "[!] Commandes manquantes: ${missing[*]}" >&2
    exit 2
  fi
}

require_docker_compose() {
  require_cmd docker
  if ! docker compose version >/dev/null 2>&1; then
    echo "[!] Docker Compose (plugin) indisponible. Installez docker-compose-plugin." >&2
    exit 2
  fi
}

resolve_env_file() {
  local explicit="$1"
  if [[ -n "${explicit}" ]]; then
    echo "${explicit}"
    return
  fi

  if [[ -n "${ENV_FILE}" ]]; then
    echo "${ENV_FILE}"
    return
  fi

  if [[ -f "${SYSTEM_ENV_FILE}" ]]; then
    echo "${SYSTEM_ENV_FILE}"
  else
    echo "${DEFAULT_ENV_FILE}"
  fi
}

parse_env_file() {
  local file="$1"
  local line key raw value
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    if [[ -z "${line}" || "${line:0:1}" == "#" ]]; then
      continue
    fi

    if [[ ! "${line}" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      echo "[!] Ligne invalide dans ${file}: ${line}" >&2
      return 1
    fi

    key="${BASH_REMATCH[1]}"
    raw="${BASH_REMATCH[2]}"
    raw="${raw#"${raw%%[![:space:]]*}"}"
    value="${raw}"

    if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value//\\\\/\\}"
      value="${value//\\\"/\"}"
    elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi

    printf -v "${key}" '%s' "${value}"
    export "${key}"
  done < "${file}"
}

load_env() {
  local explicit_file=""
  if [[ "${1:-}" == "--file" ]]; then
    if [[ -z "${2:-}" ]]; then
      echo "[!] --file nécessite un chemin" >&2
      exit 2
    fi
    explicit_file="${2:-}"
    shift 2
  fi

  ENV_FILE="$(resolve_env_file "${explicit_file}")"

  if [[ ! -f "${ENV_FILE}" ]]; then
    cat >&2 <<EOF
[!] Fichier d'environnement introuvable.
Cherché:
 - ${SYSTEM_ENV_FILE}
 - ${DEFAULT_ENV_FILE}

Créez ${DEFAULT_ENV_FILE} (dev) ou installez ${SYSTEM_ENV_FILE} via infra/scripts/install-env-prod.sh.
EOF
    exit 2
  fi

  parse_env_file "${ENV_FILE}"
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
