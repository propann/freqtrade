#!/usr/bin/env bash
# Run from WSL at the repository root.  This is research-only: it never starts
# the bot and uses the isolated quant-core-research Docker volume.
set -uo pipefail

image="quant-core/engine:local"
config_dir="/mnt/c/Users/azoth/freqtrade/config_examples"
strategy_dir="/mnt/c/Users/azoth/freqtrade/strategies"
timerange="20250824-20260825"
# Prevent a verbose or pathological candidate from consuming the VPS disk or
# blocking the queue indefinitely.  The final log bytes contain the Freqtrade
# report/traceback that is useful for the catalogue.
audit_timeout_seconds="${AUDIT_TIMEOUT_SECONDS:-900}"
max_log_bytes="${AUDIT_MAX_LOG_BYTES:-2097152}"

# Short-only strategies are intentionally not listed because this audit targets
# Binance spot.  See strategy_library/CATALOG.md for their disposition.
entries=(
  "Bandtastic:15m"
  "CnStrongTrendStrategy:15m"
  "IchiV1Research:15m"
  "QuantCoreBaseline:15m"
  "RSIBollingerStrategy:15m"
  "SwingHighToSky:15m"
  "TrendRetracementATR:15m"
  "FixedRiskRewardLoss:15m"
  "BreakEven:5m"
  "CnTrendPullbackStrategy:5m"
  "Diamond:5m"
  "InformativeSample:5m"
  "PowerTower:5m"
  "SampleStrategy:5m"
  "Strategy001:5m"
  "Strategy001_custom_exit:5m"
  "Strategy002:5m"
  "Strategy003:5m"
  "Strategy004:5m"
  "Strategy005:5m"
  "UniversalMACD:5m"
  "MultiTimeframeRsiStrategy:5m"
  "CustomStoplossWithPSAR:1h"
  "GenesisMicro:1h"
  "HourBasedStrategy:1h"
  "HumanConfluenceStrategy:15m"
  "StratyxAdaptedStrategy:1h"
  "Supertrend:1h"
  "SuperTrendImproved:1h"
  "TrendRiderStrategy:1h"
  "GenesisRelic:15m"
  "Heracles:4h"
  "hlhb:4h"
  "mabStra:4h"
  "MultiMa:4h"
  "GodStra:12h"
  "PatternRecognition:1d"
)

# Keep each research run in the repository (which is mounted read/write from
# WSL) rather than under /tmp.  A long audit can then be resumed or inspected
# after Docker/WSL exits.  Generated evidence is intentionally git-ignored.
audit_root="${AUDIT_RESULTS_DIR:-/mnt/c/Users/azoth/freqtrade/strategy_library/audit_results}"
run_id="${AUDIT_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
log_dir="${audit_root}/${run_id}"
mkdir -p "$log_dir"
summary="$log_dir/summary.tsv"
printf 'strategy\ttimeframe\tstatus\tlog\n' >"$summary"

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
quality_log="$log_dir/data-quality.log"
if ! docker run --rm --entrypoint python \
  -v quant-core-research:/data:ro \
  -v "${script_dir}:/audit-script:ro" \
  -v "${log_dir}:/audit-results" \
  "$image" /audit-script/data_quality.py /data/data/binance \
  --output /audit-results/data-quality.json >"$quality_log" 2>&1; then
  printf 'Data quality failed; see %s\n' "$quality_log" >&2
  exit 2
fi
audit_from="${AUDIT_FROM:-}"
audit_only="${AUDIT_ONLY:-}"
started=0
for entry in "${entries[@]}"; do
  strategy="${entry%%:*}"
  timeframe="${entry##*:}"
  if [[ -n "$audit_only" && ",$audit_only," != *",$strategy,"* ]]; then
    continue
  fi
  if [[ -n "$audit_from" && $started -eq 0 ]]; then
    [[ "$strategy" == "$audit_from" ]] || continue
    started=1
  fi
  log="${log_dir}/${strategy}.log"
  printf 'AUDIT %s (%s)\n' "$strategy" "$timeframe"
  if timeout "${audit_timeout_seconds}s" docker run --rm \
    -v quant-core-research:/freqtrade/user_data \
    -v "${config_dir}:/config:ro" \
    -v "${strategy_dir}:/strategies:ro" \
    --entrypoint freqtrade "$image" backtesting \
    --config /config/quantcore.strategy-audit.json \
    --userdir /freqtrade/user_data \
    --strategy-path /strategies \
    --strategy "$strategy" \
    --timeframe "$timeframe" \
    --timerange "$timerange" \
    --export trades \
    --backtest-directory /freqtrade/user_data/backtest_results \
    --notes "strategy-audit-${strategy}" 2>&1 | tail -c "$max_log_bytes" >"$log"; then
    printf '%s\t%s\tpass\t%s\n' "$strategy" "$timeframe" "${strategy}.log" >>"$summary"
    printf 'PASS %s\n' "$strategy"
  else
    printf '%s\t%s\tfail\t%s\n' "$strategy" "$timeframe" "${strategy}.log" >>"$summary"
    printf 'FAIL %s (see %s)\n' "$strategy" "$log"
  fi
done

printf 'Audit evidence: %s\n' "$log_dir"
