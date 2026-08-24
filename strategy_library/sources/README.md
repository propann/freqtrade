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

The official collection itself describes its strategies as starting points,
not ready-to-use systems. Promotion to `strategies/` therefore requires local
evidence, not repository popularity.
