#!/usr/bin/env bash
set -euo pipefail

# Lance un backtest dans un conteneur éphémère dédié à un client.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id> [strategy] [timerange]" >&2
  exit 1
fi

CLIENT_ID="$1"
STRATEGY="${2:-SampleStrategy}"
TIMERANGE="${3:-}"
ROOT_DIR="${CLIENTS_DIR:-./clients}"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"
DATA_DIR="${CLIENT_DIR}/data"
CONFIG_FILE="${DATA_DIR}/config.json"

if [[ ! -d "${CLIENT_DIR}" ]]; then
  echo "Client ${CLIENT_ID} introuvable" >&2
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Fichier de configuration manquant: ${CONFIG_FILE}" >&2
  exit 1
fi

JOB_ID="$(date +%s)-${RANDOM}"
RESULT_DIR="${DATA_DIR}/results/${JOB_ID}"
CONTAINER_NAME="fta-job-${CLIENT_ID}-${JOB_ID}"

mkdir -p "${RESULT_DIR}"

# Nettoie un conteneur résiduel éventuel avant de relancer un job.
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

BACKTEST_CMD=("backtesting" "--config" "/freqtrade/user_data/config.json" "--strategy" "${STRATEGY}" "--export" "trades" "--export-filename" "results/${JOB_ID}/backtest.json")

if [[ -n "${TIMERANGE}" ]]; then
  BACKTEST_CMD+=("--timerange" "${TIMERANGE}")
fi

docker run --rm \
  --name "${CONTAINER_NAME}" \
  --cpus "1.0" \
  --memory 1024m \
  --pids-limit 256 \
  -v "${DATA_DIR}:/freqtrade/user_data" \
  freqtradeorg/freqtrade:stable \
  "${BACKTEST_CMD[@]}"

echo "Résultats enregistrés dans ${RESULT_DIR}/backtest.json"
