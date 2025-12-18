#!/usr/bin/env bash
set -euo pipefail

TENANT_ID=${1:-}
if [[ -z "$TENANT_ID" ]]; then
  echo "Usage: $0 <tenant_id>" >&2
  exit 1
fi

CLIENTS_DIR=${CLIENTS_DIR:-"$(pwd)/clients"}
BACKUP_DIR=${BACKUP_DIR:-"$(pwd)/backups"}
POSTGRES_URI=${POSTGRES_URI:-"postgresql://postgres:postgres@127.0.0.1:5432/postgres"}

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$BACKUP_DIR/${TENANT_ID}-${TS}.tar.gz"

# Export fichier + dump ciblé des tables multi-tenant (pas de secrets).
tar -czf "$ARCHIVE" -C "$CLIENTS_DIR" "$TENANT_ID"
pg_dump --data-only --column-inserts --table tenants --table audit_logs "$POSTGRES_URI" > "$BACKUP_DIR/${TENANT_ID}-${TS}-meta.sql"

echo "Backup ready: $ARCHIVE"
echo "Metadata dump: $BACKUP_DIR/${TENANT_ID}-${TS}-meta.sql"
