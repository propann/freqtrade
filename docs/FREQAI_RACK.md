# FreqAI research rack

`freqai-lab` is an ephemeral, private Docker profile for model research. It
does not start with the trading engine, exposes no port, receives no exchange
or Telegram secrets and uses its own `quant_freqai_data` volume for OHLCV,
models and experiment exports. The normal `quant_user_data` execution volume
is deliberately not mounted.

Run only an explicit research command, for example:

```bash
docker compose --env-file .env -f docker-compose.coolify.yml \
  --profile research run --rm --no-deps freqai-lab freqtrade --help
```

Start with the standard CPU FreqAI image. Torch/RL or GPU access is a separate
future profile requiring a VPS resource review, explicit GPU runtime setup and
a model-specific validation plan. A strategy only moves from this rack to a
dry-run candidate after reproducible backtest, lookahead, recursive and
out-of-sample checks.

## Execution rack

`freqai-execution` is a separate Freqtrade/FreqAI engine that can execute the
promoted CPU strategy. It owns `quant_freqai_runtime`, including its model
state and trade database, and receives only the `FREQAI_EXCHANGE_*` VPS
secrets. It defaults to dry-run. It does not start with the normal stack.

```bash
docker compose --env-file .env -f docker-compose.coolify.yml \
  --profile ai-execution up -d freqai-execution
```

For a real deployment, set `FREQAI_EXECUTION_DRY_RUN=false` only on the VPS,
use a separate API key with withdrawals disabled and an IP allowlist, and first
complete the model validation gate. Never place a real key in Git or in the UI.
