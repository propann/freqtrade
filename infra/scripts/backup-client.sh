#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 <tenant_id>"
  exit 0
fi

TENANT_ID=${1:-}
if [[ -z "${TENANT_ID}" ]]; then
  echo "[!] Usage: $0 <tenant_id>" >&2
  exit 2
fi

load_env
require_env CLIENTS_DIR POSTGRES_URI

BACKUP_DIR=${BACKUP_DIR:-"${ROOT_DIR}/backups"}

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$BACKUP_DIR/${TENANT_ID}-${TS}.tar.gz"

# Export fichier + dump ciblé des tables multi-tenant (pas de secrets).
tar -czf "$ARCHIVE" -C "$CLIENTS_DIR" "$TENANT_ID"
pg_dump --data-only --column-inserts --table tenants --table audit_logs "$POSTGRES_URI" > "$BACKUP_DIR/${TENANT_ID}-${TS}-meta.sql"

echo "Backup ready: $ARCHIVE"
echo "Metadata dump: $BACKUP_DIR/${TENANT_ID}-${TS}-meta.sql"
