#!/usr/bin/env bash
# Usage: install-env-prod.sh [--force] [--from /path/to/source.env]
# Examples:
#   sudo bash infra/scripts/install-env-prod.sh
#   sudo bash infra/scripts/install-env-prod.sh --force --from /tmp/prod.env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

TARGET="/etc/quant-core/quant-core.env"
SOURCE_PATH=""
FORCE=false

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --force           Remplace le fichier existant"
  echo "  --from <path>     Source explicite (sinon: ./.env si présent, sinon .env.example)"
  echo "  -h, --help        Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --from)
      SOURCE_PATH="${2:-}"
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

if [[ -z "${SOURCE_PATH}" ]]; then
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    SOURCE_PATH="${ROOT_DIR}/.env"
  else
    SOURCE_PATH="${ROOT_DIR}/.env.example"
  fi
fi

if [[ ! -f "${SOURCE_PATH}" ]]; then
  echo "[!] Fichier source introuvable: ${SOURCE_PATH}" >&2
  exit 1
fi

if [[ -f "${TARGET}" && "${FORCE}" == false ]]; then
  echo "[!] ${TARGET} existe déjà. Utilisez --force pour écraser." >&2
  exit 1
fi

echo "[+] Installation du fichier d'environnement dans ${TARGET}"
mkdir -p "$(dirname "${TARGET}")"
umask 077
if [[ "${SOURCE_PATH}" == "${ROOT_DIR}/.env.example" ]]; then
  {
    echo "# Template prod généré depuis .env.example"
    echo "# Remplir toutes les valeurs et QUOTER celles contenant \$ (fichier dotenv, pas un script bash)."
    cat "${SOURCE_PATH}"
  } > "${TARGET}"
else
  cp "${SOURCE_PATH}" "${TARGET}"
fi
chmod 600 "${TARGET}"

if command -v chown >/dev/null 2>&1; then
  chown root:root "${TARGET}" 2>/dev/null || true
fi

echo "[ok] ${TARGET} copié depuis ${SOURCE_PATH}"
echo "[=] Éditez /etc/quant-core/quant-core.env puis relancez prod-deploy.sh"
