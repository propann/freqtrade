# Strategy sources

Downloaded repositories are kept separate from the active `strategies/`
directory. A source is not promoted just because it compiles: it must pass
dependency checks, lookahead-bias checks, reproducible backtests and
out-of-sample validation.

## Current sources

- `freqtrade-strategies-upstream/` — official Freqtrade collection.
- `werkkrew-freqtrade-strategies/` — classic strategies with an explicit
  archived section.
- `marcosfreitas-freqtrade-strategies/` — structured BusyGuy/Goblins-Gold/
  Low-Rider collection with per-strategy configuration.
- `nateemma-strategies/` — research and machine-learning framework; keep
  separate from ordinary indicator strategies because it has extra runtime and
  training requirements.

### Newly imported sources

- `nostalgia-for-infinity/`: upstream `iterativv/NostalgiaForInfinity`, GPL-3.0,
  pinned locally at `0233e4b` (2026-08-24). Complex spot-oriented strategy family;
  audit dependencies, protections and multi-timeframe data before considering it.
- `paulcpk-strategies/`: MIT reference set of five simple trend strategies. Last
  upstream change is 2021 and none declares V3, so it is migration inspiration only.
- `freqtrade-strategy-lab/`: recent FreqAI/futures research workspace. Its models
  and runtime dependencies exclude it from the ordinary spot strategy audit.
- `ceyhanmolla-freqtrade-strategies/`: Turkish V3 collection, pinned locally at
  `937fefc` (2026-05-23). It contains short-timeframe candidates and therefore
  requires 1m/5m market data plus realistic fee, latency and slippage checks.
- `baoyuy-f-d-cn/`: Chinese research collection. It has a mixed structure and
  is inventory-only until each candidate's Freqtrade interface is confirmed.
- `nanshan1002-quant-strategies/`: Chinese quantitative research repository;
  it is not a drop-in Freqtrade strategy set and stays reference-only.
- `hansen1015-freqtrade-strategy/`: older five-strategy set, retained as
  migration/reference material rather than an active candidate source.
- `zevrichards-freqtrade-strategies/`: 16 current candidates (5m and 4h),
  pinned locally at `9dc9ef2` (2026-08-20). It needs a dedicated multi-timeframe
  data and configuration audit before any import.

### Incomplete downloads

- `theobrigitte-freqtrade/`: clone interrupted before the repository files were
  written. It is not inventoried and must be re-cloned into a clean quarantine
  directory before use.

The official collection itself describes its strategies as starting points,
not ready-to-use systems. Promotion to `strategies/` therefore requires local
evidence, not repository popularity.
