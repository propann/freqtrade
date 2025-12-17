#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:-portal}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

docker compose -f infra/docker-compose.yml --env-file .env logs -f "${SERVICE}"
