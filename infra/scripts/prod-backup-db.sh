#!/usr/bin/env bash
# Usage: prod-backup-db.sh [--dir /var/backups/quant-core] [--retention-days 7]
# Examples:
#   sudo bash infra/scripts/prod-backup-db.sh
#   sudo bash infra/scripts/prod-backup-db.sh --dir /data/backups --retention-days 14
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
BACKUP_ROOT="/var/backups/quant-core"
RETENTION_DAYS=7

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --dir <path>           Répertoire de sauvegarde (défaut: /var/backups/quant-core)"
  echo "  --retention-days <n>   Suppression des dumps plus vieux que n jours (défaut: 7)"
  echo "  -h, --help             Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      BACKUP_ROOT="${2:-}"
      shift 2
      ;;
    --retention-days)
      RETENTION_DAYS="${2:-}"
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

if ! [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
  echo "[!] --retention-days doit être numérique" >&2
  exit 1
fi

if [[ -z "${BACKUP_ROOT}" ]]; then
  echo "[!] --dir ne peut pas être vide" >&2
  exit 1
fi

load_env
require_env POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
require_docker_compose
require_cmd date gzip find

timestamp="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_ROOT}"
chmod 700 "${BACKUP_ROOT}" || true
umask 077
output="${BACKUP_ROOT}/${timestamp}.sql.gz"

echo "[+] Dump Postgres -> ${output}"
if ! docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  | gzip > "${output}"
then
  echo "[!] Échec du dump" >&2
  rm -f "${output}"
  exit 1
fi

echo "[+] Sauvegarde OK: ${output}"

echo "[+] Rétention: suppression > ${RETENTION_DAYS} jours dans ${BACKUP_ROOT}"
find "${BACKUP_ROOT}" -type f -name '*.sql.gz' -mtime +"${RETENTION_DAYS}" -print -delete
