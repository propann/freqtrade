#!/usr/bin/env bash
# Usage: prod-deploy.sh [--no-pull] [--public-url https://app.example.com/health] [--health-timeout 180]
# Examples:
#   sudo bash infra/scripts/prod-deploy.sh
#   sudo bash infra/scripts/prod-deploy.sh --no-pull --public-url https://app.quant-core.app/health
#   sudo bash infra/scripts/prod-deploy.sh --health-timeout 240
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
PULL_GIT=true
PUBLIC_HEALTH_URL=""
HEALTH_TIMEOUT=180

usage() {
  grep '^#' "$0" | sed 's/^# //'
  echo
  echo "Options:"
  echo "  --no-pull             Ne pas exécuter git pull"
  echo "  --public-url <url>    URL de healthcheck public (https://.../health)"
  echo "  --health-timeout <s>  Temps max pour les healthchecks (par défaut 180s)"
  echo "  -h, --help            Affiche cette aide"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull)
      PULL_GIT=false
      shift
      ;;
    --public-url)
      PUBLIC_HEALTH_URL="${2:-}"
      shift 2
      ;;
    --health-timeout)
      HEALTH_TIMEOUT="${2:-}"
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

if ! [[ "${HEALTH_TIMEOUT}" =~ ^[0-9]+$ ]]; then
  echo "[!] --health-timeout doit être un entier (secondes)" >&2
  exit 1
fi

wait_for_health() {
  local url="$1"
  local label="$2"
  local deadline shell_now
  deadline=$((SECONDS + HEALTH_TIMEOUT))

  echo "[+] Healthcheck ${label}: ${url}"
  while (( SECONDS <= deadline )); do
    if curl -fsS --max-time 5 "${url}" >/dev/null; then
      echo "[ok] ${label} UP"
      return 0
    fi
    sleep 3
  done

  echo "[!] ${label} KO après ${HEALTH_TIMEOUT}s" >&2
  return 1
}

load_env
require_env PORTAL_HOST_URL PORTAL_HTTP_PORT PORTAL_INTERNAL_PORT PORTAL_JWT_SECRET PORTAL_ADMIN_TOKEN POSTGRES_HOST POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
require_docker_compose
require_cmd curl

if "${PULL_GIT}"; then
  require_cmd git
  echo "[+] git pull (branche courante)"
  git -C "${ROOT_DIR}" pull --ff-only
else
  echo "[=] git pull SKIP (--no-pull)"
fi

echo "[+] Vérification de l'environnement"
bash "${SCRIPT_DIR}/check-env.sh"

echo "[+] Déploiement docker compose (build + up -d)"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

local_health="${PORTAL_HOST_URL%/}/health"
wait_for_health "${local_health}" "Portail (local)"

if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  wait_for_health "${PUBLIC_HEALTH_URL}" "Portail (public)"
fi

echo "[ok] Déploiement terminé. Accès local: ${PORTAL_HOST_URL}"
