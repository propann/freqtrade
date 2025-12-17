#!/usr/bin/env bash
set -euo pipefail

# Lance un backtest dans un conteneur éphémère isolé (1 job = 1 conteneur).

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id> [strategy] [timerange]" >&2
  exit 1
fi

CLIENT_ID="$1"
STRATEGY="${2:-SampleStrategy}"
TIMERANGE="${3:-20230101-20230201}"
ROOT_DIR="${CLIENTS_DIR:-./clients}"
CLIENT_DIR="${ROOT_DIR}/${CLIENT_ID}"
DATA_DIR="${CLIENT_DIR}/data"
CONFIG_FILE="${DATA_DIR}/config.json"
COMPOSE_FILE="${CLIENT_DIR}/docker-compose.job.yml"
ENV_FILE="${CLIENT_DIR}/.env"
NETWORK="fta-client-${CLIENT_ID}"
SUBSCRIPTION_STATUS_FILE="${CLIENT_DIR}/subscription.status"
JOB_TIMEOUT="${JOB_TIMEOUT:-${DEFAULT_JOB_TIMEOUT:-10m}}"

if [[ ! -d "${CLIENT_DIR}" ]]; then
  echo "Client ${CLIENT_ID} introuvable" >&2
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Fichier de configuration manquant: ${CONFIG_FILE}" >&2
  exit 1
fi

if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  echo "Réseau ${NETWORK} introuvable. Provisionnez le client avant de lancer un job." >&2
  exit 1
fi

if [[ ! -f "${SUBSCRIPTION_STATUS_FILE}" ]] || [[ "$(tr -d '[:space:]' < "${SUBSCRIPTION_STATUS_FILE}")" != "active" ]]; then
  echo "Job refusé (subscription inactive)" >&2
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Fichier manquant: ${COMPOSE_FILE}. Provisionnez le client." >&2
  exit 1
fi

if grep -Eq '^[[:space:]]*(ports:|expose:)' "${COMPOSE_FILE}"; then
  echo "Refus de lancer le job: ports exposés détectés dans docker-compose.job.yml" >&2
  exit 1
fi

for required in "cap_drop" "no-new-privileges" "mem_limit" "cpus" "pids_limit"; do
  if ! grep -q "${required}" "${COMPOSE_FILE}"; then
    echo "Refus de lancer le job: option manquante (${required}) dans docker-compose.job.yml" >&2
    exit 1
  fi
done

JOB_ID="$(date +%s)-${RANDOM}"
RESULT_DIR="${DATA_DIR}/results/${JOB_ID}"
RESULT_FILE="${RESULT_DIR}/backtest.json"
CONTAINER_NAME="fta-job-${CLIENT_ID}-${JOB_ID}"

mkdir -p "${RESULT_DIR}" "${DATA_DIR}/tmp"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

echo "[+] Lancement du job ${CONTAINER_NAME} (client=${CLIENT_ID}, job=${JOB_ID})"

export STRATEGY TIMERANGE JOB_ID CLIENT_ID

cd "${CLIENT_DIR}"

cleanup() {
  docker compose -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

if ! timeout "${JOB_TIMEOUT}" docker compose -f "${COMPOSE_FILE}" ${ENV_FILE:+--env-file "${ENV_FILE}"} \
  up --abort-on-container-exit --exit-code-from freqtrade-job; then
  status=$?
  if [[ ${status} -eq 124 ]]; then
    echo "Job timeout" >&2
  fi
  exit ${status}
fi

cleanup

if [[ ! -f "${RESULT_FILE}" ]]; then
  echo "Aucun résultat trouvé (${RESULT_FILE})" >&2
  exit 1
fi

echo "Job terminé avec succès"
echo "Résultats enregistrés dans ${RESULT_FILE}"
