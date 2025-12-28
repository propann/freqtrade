#!/usr/bin/env bash
# Usage: prod-restore-db.sh --file /path/to/dump.sql[.gz] [--yes] [--skip-stop]
# Examples:
#   sudo bash infra/scripts/prod-restore-db.sh --file /var/backups/quant-core/20240201-120000.sql.gz --yes
#   sudo bash infra/scripts/prod-restore-db.sh --file ./dump.sql --skip-stop
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
DUMP_FILE=""
CONFIRM=false
STOP_STACK=true
TARGET_DB=""

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --file <dump.sql[.gz]>  Fichier de dump à restaurer (obligatoire)"
  echo "  --database <name>       Base cible (défaut: POSTGRES_DB)"
  echo "  --yes                   Ne pas demander de confirmation interactive"
  echo "  --skip-stop             Ne pas arrêter portal/nginx avant la restauration"
  echo "  -h, --help              Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      DUMP_FILE="${2:-}"
      shift 2
      ;;
    --database)
      TARGET_DB="${2:-}"
      shift 2
      ;;
    --yes)
      CONFIRM=true
      shift
      ;;
    --skip-stop)
      STOP_STACK=false
      shift
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

if [[ -z "${DUMP_FILE}" ]]; then
  echo "[!] --file est obligatoire" >&2
  usage
  exit 1
fi

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "[!] Fichier introuvable: ${DUMP_FILE}" >&2
  exit 1
fi

load_env
require_env POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
require_docker_compose
require_cmd gzip

if [[ -z "${TARGET_DB}" ]]; then
  TARGET_DB="${POSTGRES_DB}"
fi

if ! "${CONFIRM}"; then
  read -r -p "Cette action écrase la base ${TARGET_DB}? Continuer ? (yes/NO) " answer
  if [[ "${answer}" != "yes" ]]; then
    echo "[=] Abandon."
    exit 0
  fi
fi

restore_cmd=(cat "${DUMP_FILE}")
if [[ "${DUMP_FILE}" == *.gz ]]; then
  restore_cmd=(gzip -cd "${DUMP_FILE}")
fi

if "${STOP_STACK}"; then
  echo "[+] Arrêt portal/nginx le temps de la restauration"
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" stop portal nginx
fi

echo "[+] Restauration en cours vers ${TARGET_DB}"
if ! "${restore_cmd[@]}" | docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  postgres psql -U "${POSTGRES_USER}" -d "${TARGET_DB}";
then
  echo "[!] Restauration échouée" >&2
  exit 1
fi

if "${STOP_STACK}"; then
  echo "[+] Redémarrage portal/nginx"
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d portal nginx
fi

echo "[ok] Restauration terminée"
