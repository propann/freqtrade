#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

tmp_env="$(mktemp)"
trap 'rm -f "${tmp_env}"' EXIT

cat > "${tmp_env}" <<'EOF'
# comment line
ADMIN_PASSWORD_HASH=admin$2y$12$abc
PORTAL_ADMIN_TOKEN=xxx=yyy==
PATH_LIKE=/app/clients
QUOTED='value with spaces and $dollar'
DOUBLE_QUOTED="quoted with = and $chars"
EOF

load_env --file "${tmp_env}"

assert_equal() {
  local name="$1"
  local expected="$2"
  local actual="${!name:-}"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "[!] ${name} mismatch. Expected '${expected}', got '${actual}'" >&2
    exit 1
  fi
}

assert_equal "ADMIN_PASSWORD_HASH" "admin\$2y\$12\$abc"
assert_equal "PORTAL_ADMIN_TOKEN" "xxx=yyy=="
assert_equal "PATH_LIKE" "/app/clients"
assert_equal "QUOTED" "value with spaces and \$dollar"
assert_equal "DOUBLE_QUOTED" "quoted with = and \$chars"

echo "[ok] load_env parser: tests pass"
