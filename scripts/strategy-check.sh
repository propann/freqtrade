#!/usr/bin/env bash
set -euo pipefail

strategy="${1:-QuantCoreBaseline}"
timerange="${2:-20250101-20260101}"
compose_file="${COMPOSE_FILE:-docker-compose.coolify.yml}"
config_file="/freqtrade/user_data/config.json"

if [[ ! -f user_data/config.json ]]; then
  echo "user_data/config.json manque." >&2
  echo "Copiez config_examples/quantcore.dry-run.json vers user_data/config.json." >&2
  exit 1
fi

run_freqtrade() {
  docker compose -f "${compose_file}" run --rm --no-deps freqtrade-engine "$@"
}

echo "[1/4] Découverte de la stratégie"
run_freqtrade list-strategies --config "${config_file}" --strategy-path /freqtrade/user_data/strategies

echo "[2/4] Backtest avec protections"
run_freqtrade backtesting \
  --config "${config_file}" \
  --strategy "${strategy}" \
  --strategy-path /freqtrade/user_data/strategies \
  --timerange "${timerange}" \
  --enable-protections \
  --cache none \
  --breakdown month year

echo "[3/4] Recherche de biais d'anticipation"
run_freqtrade lookahead-analysis \
  --config "${config_file}" \
  --strategy "${strategy}" \
  --strategy-path /freqtrade/user_data/strategies \
  --timerange "${timerange}"

echo "[4/4] Analyse des indicateurs récursifs"
run_freqtrade recursive-analysis \
  --config "${config_file}" \
  --strategy "${strategy}" \
  --strategy-path /freqtrade/user_data/strategies \
  --timerange "${timerange}"

echo "Validation terminée. Un résultat positif ne remplace pas un test hors-échantillon puis un long dry-run."
