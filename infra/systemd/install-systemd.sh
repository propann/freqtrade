#!/usr/bin/env bash
# Usage: install-systemd.sh
# Examples:
#   sudo bash infra/systemd/install-systemd.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SERVICE_TEMPLATE="${ROOT_DIR}/infra/systemd/quant-core.service"
SERVICE_NAME="quant-core"
TARGET="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_PATH="/etc/quant-core/quant-core.env"

usage() {
  grep '^#' "$0" | sed 's/^# //'
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "[!] L'installation systemd nécessite root (sudo)." >&2
  exit 1
fi

if [[ ! -f "${SERVICE_TEMPLATE}" ]]; then
  echo "[!] Template introuvable: ${SERVICE_TEMPLATE}" >&2
  exit 1
fi

for bin in systemctl sed install; do
  if ! command -v "${bin}" >/dev/null 2>&1; then
    echo "[!] Commande manquante: ${bin}" >&2
    exit 1
  fi
done

if [[ ! -f "${ENV_PATH}" ]]; then
  echo "[!] ${ENV_PATH} manquant. Installez-le via infra/scripts/install-env-prod.sh avant d'activer systemd." >&2
  exit 1
fi

tmp_service="$(mktemp)"
trap 'rm -f "${tmp_service}"' EXIT

sed -e "s|{{ROOT_DIR}}|${ROOT_DIR}|g" \
    -e "s|{{ENV_FILE}}|${ENV_PATH}|g" \
    "${SERVICE_TEMPLATE}" > "${tmp_service}"

echo "[+] Installation du service systemd dans ${TARGET}"
install -m 0644 "${tmp_service}" "${TARGET}"

echo "[+] systemctl daemon-reload"
systemctl daemon-reload
echo "[+] Activation + démarrage"
systemctl enable --now "${SERVICE_NAME}"

echo "[ok] Service ${SERVICE_NAME} installé."
echo "Consultez les logs: journalctl -u ${SERVICE_NAME} -f"
