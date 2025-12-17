#!/usr/bin/env bash
set -euo pipefail

# Lance un backtest Freqtrade dans un conteneur éphémère isolé pour un client donné.
# Chaque job est limité en CPU/Mem/PIDs et écrit ses résultats dans clients/<id>/data/results/<job_id>/.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id> [strategy] [timerange]" >&2
  exit 1
fi

CLIENT_ID="$1"
STRATEGY="${2:-SampleStrategy}"
TIMERANGE="${3:-20220101-20220201}"
ROOT_DIR="${CLIENTS_DIR:-$(pwd)/clients}"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"
CONFIG_FILE="${CLIENT_DIR}/data/config.json"
TEMPLATE_FILE="${CLIENT_DIR}/docker-compose.job.yml"
CLIENT_ENV_FILE="${CLIENT_DIR}/.env"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Configuration manquante: ${CONFIG_FILE}" >&2
  exit 1
fi

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "Template manquant: ${TEMPLATE_FILE}" >&2
  exit 1
fi

set -a
[[ -f .env ]] && source .env
[[ -f "${CLIENT_ENV_FILE}" ]] && source "${CLIENT_ENV_FILE}"
set +a

JOB_ID="$(date +%s)-$RANDOM"
RESULT_DIR="${CLIENT_DIR}/data/results/${JOB_ID}"
mkdir -p "${RESULT_DIR}"

TMP_COMPOSE=$(mktemp)
sed "s/STRATEGY_PLACEHOLDER/${STRATEGY}/g; s/TIMERANGE_PLACEHOLDER/${TIMERANGE}/g; s/JOB_ID_PLACEHOLDER/${JOB_ID}/g" \
  "${TEMPLATE_FILE}" > "${TMP_COMPOSE}"

export JOB_CPU="${JOB_CPU:-${DEFAULT_CPU:-1.0}}"
export JOB_MEM_LIMIT="${JOB_MEM_LIMIT:-${DEFAULT_MEM_LIMIT:-1024m}}"
export JOB_PIDS_LIMIT="${JOB_PIDS_LIMIT:-${DEFAULT_PIDS_LIMIT:-256}}"

echo "Lancement du backtest pour ${CLIENT_ID} (job ${JOB_ID})..."
docker compose -f "${TMP_COMPOSE}" --env-file "${CLIENT_ENV_FILE}" up --abort-on-container-exit --force-recreate

rm -f "${TMP_COMPOSE}"
echo "Résultats enregistrés dans ${RESULT_DIR}/backtest.json"
