#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" || -z "${2:-}" ]]; then
  echo "Usage: $0 <tenant_id> <archive.tar.gz>" >&2
  exit 1
fi

TENANT_ID="$1"
ARCHIVE="$2"
CLIENTS_DIR=${CLIENTS_DIR:-"$(pwd)/clients"}
POSTGRES_URI=${POSTGRES_URI:-"postgresql://postgres:postgres@127.0.0.1:5432/postgres"}
META_FILE=${META_FILE:-""}

mkdir -p "$CLIENTS_DIR"
tar -xzf "$ARCHIVE" -C "$CLIENTS_DIR"

if [[ -n "$META_FILE" ]]; then
  psql "$POSTGRES_URI" < "$META_FILE"
fi

echo "Restore completed for tenant $TENANT_ID"
