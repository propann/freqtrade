#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 <tenant_id> <archive.tar.gz>"
  exit 0
fi

if [[ -z "${1:-}" || -z "${2:-}" ]]; then
  echo "[!] Usage: $0 <tenant_id> <archive.tar.gz>" >&2
  exit 2
fi

load_env
require_env CLIENTS_DIR POSTGRES_URI

TENANT_ID="$1"
ARCHIVE="$2"
META_FILE=${META_FILE:-""}

mkdir -p "$CLIENTS_DIR"
tar -xzf "$ARCHIVE" -C "$CLIENTS_DIR"

if [[ -n "$META_FILE" ]]; then
  psql "$POSTGRES_URI" < "$META_FILE"
fi

echo "Restore completed for tenant $TENANT_ID"
