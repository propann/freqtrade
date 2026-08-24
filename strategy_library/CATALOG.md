# Active strategy catalogue

Static screening only: a strategy is not promoted for trading until it passes
the project's backtest, resource benchmark, lookahead, recursive and
out-of-sample checks.

## Resource gate

The catalogue records deterministic indicator timing, dataframe memory growth
and process peak RSS separately from financial metrics.  A strategy can be
rejected for performance and still be useful as a lightweight development
baseline; conversely, a financially promising strategy cannot be promoted
without a resource measurement.

- `QuantCoreBaseline`: measured at 0.828 ms per 1,000 candles (median) and
  +480 KB indicator dataframe memory for 10,000 candles. It is lightweight but
  remains a negative-performance development baseline.
- `IchiV1Research`: 164.645 ms per 1,000 candles (median) for the same fixture.
  This exceeds the current single-VPS review trigger and remains unpromoted.

## Pending annual spot audit

These active strategies use the current V3 entry/exit interface and do not
declare an additional third-party strategy package beyond the normal Freqtrade
stack:

- CustomStoplossWithPSAR, GenesisMicro, GenesisRelic, HumanConfluenceStrategy
- MatrixBugScalper, RSIBollingerStrategy, SuperTrendImproved, TrendRetracementATR
- GodStra, Heracles, hlhb, mabStra, MultiMa, Supertrend, TrendRiderStrategy
- Strategy001 through Strategy005, Strategy001_custom_exit, SwingHighToSky and
  the remaining V3 reference candidates.

## Excluded by current annual spot audit

- `Bandtastic`: -79.2% return and 82.5% drawdown.
- `Diamond`: -25.78% return and 29.57% drawdown.
- `BreakEven`: no trades over the sampled year.
- `QuantCoreBaseline`: -14.2% return; retain only as a development baseline.
- `FixedRiskRewardLoss`: compatibility repaired, then -42.18% return with
  42.18% drawdown over 3 trades; reject.
- `AlmgrenChrissStrategy`, `TWAPStrategy`: short strategies, outside the Binance
  spot profile.

Additional negative annual results (same five-pair Binance spot sample):

- `CustomStoplossWithPSAR` -48.13% / 62.84% drawdown; `HourBasedStrategy`
  -76.26% / 81.08%; `InformativeSample` -51.46% / 65.14%.
- `MultiMa` -33.44% / 40.60%; `PatternRecognition` -51.12% / 56.62%; `PowerTower`
  produced no trades.
- `SampleStrategy` -56.05% / 63.39%; `Strategy001` -55.64% / 64.25%;
  `Strategy001_custom_exit` -68.26% / 71.64%.
- `Strategy003` -36.04% / 43.35%; `Strategy004` -32.36% / 43.73%;
  `Strategy005` -58.33% / 62.11%; `Supertrend` -36.89% / 52.35%.
- `SwingHighToSky` -43.46% / 51.98%; `TrendRiderStrategy` -30.00% / 33.81%;
  `UniversalMACD` -17.73% / 30.40%; `hlhb` -18.60% / 24.70%; `mabStra`
  -63.73% / 75.16%.

## Observe, not promoted

- `IchiV1Research`: near flat in the sampled year (-0.13%) with 7.79% drawdown.
  It needs out-of-sample and dry-run evidence before any promotion.
- `Strategy002`: -2.98% with 13.02% drawdown and profit factor 0.88. It is a
  retraining candidate, not an active strategy.
- `RSIBollingerStrategy`: compatibility repaired; -1.76% with 2.59% drawdown
  across 37 trades and profit factor 0.62. It is eligible for a constrained
  research revision, not activation.
- `TrendRetracementATR`: compatibility repaired but no trades in the annual
  sample. Diagnose its signal conditions before changing any parameters.
- `GenesisMicro` and `SuperTrendImproved`: compatibility repaired and annual
  test completed, but neither produced a trade. Keep as inactive research
  references until their signal design is reviewed.
- `NostalgiaForInfinityX7` (external quarantine, 2025-08-24 to 2026-08-24):
  +1.61%, 2.59% drawdown and profit factor 1.60, but only 5 trades. This is
  statistically inconclusive; do not activate or award a performance rating.

## Needs dependency review

These use optional packages and should only be tested after their dependencies
are confirmed in the `strategy-lab` image:

- `multi_tf.py`, `PatternRecognition.py`, `PowerTower.py`, `UniversalMACD.py`
  (`pandas_ta` and/or `technical`)
- `sample_strategy.py` (`technical`)

`GodStra.py` and `Heracles.py` require `ta`; that dependency is now pinned in
`Dockerfile.engine`, so both are included in the pending annual audit.

## Legacy

- `legacy/CryptoFrog.py`: retained for reference; it uses the older buy/sell
  interface and extra packages (`finta`, `skopt`, `cachetools`).
