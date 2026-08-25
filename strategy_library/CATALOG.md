# Active strategy catalogue

Static screening only: a strategy is not promoted for trading until it passes
the project's backtest, resource benchmark, lookahead, recursive and
out-of-sample checks.

Backtests use `quantcore.strategy-audit.json` for limit-order strategies and
`quantcore.market-order-audit.json` when a source explicitly requires market
entries. The profiles are dry-run only and keep pricing assumptions explicit.

All entries are retained as research references, including rejected ones.  A
rejected long may motivate a separately specified inverse hypothesis, but is
never inverted mechanically or activated without a dedicated futures/margin
risk model. See `docs/STRATEGY_RETENTION_POLICY.md`.

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

- CustomStoplossWithPSAR, GenesisMicro
- MatrixBugScalper, RSIBollingerStrategy, SuperTrendImproved, TrendRetracementATR
- GodStra, Heracles, hlhb, mabStra, MultiMa, Supertrend, TrendRiderStrategy
- Strategy001 through Strategy005, Strategy001_custom_exit, SwingHighToSky and
  the remaining V3 reference candidates.

## Rejected parameterisations in the current annual spot audit

- `Bandtastic`: -79.2% return and 82.5% drawdown.
- `Diamond`: -25.78% return and 29.57% drawdown.
- `BreakEven`: no trades over the sampled year.
- `QuantCoreBaseline`: -14.2% return; retain only as a development baseline.
- `FixedRiskRewardLoss`: compatibility repaired, then -42.18% return with
  42.18% drawdown over 3 trades; reject.
- `CnStrongTrendStrategy` (Chinese-source import): -25.71% return, 28.19%
  drawdown, 358 trades and profit factor 0.60. The exit logic closes losing
  positions too eagerly; reject this parameterisation.
- `CnTrendPullbackStrategy` (Chinese-source import): -44.22% return, 44.68%
  drawdown, 1,005 trades and profit factor 0.44. Reject this parameterisation.
- `GenesisRelic`: repaired to use a valid 15m-entry/4h-regime timeframe layout;
  -3.30% return, 3.30% drawdown and 12 trades. Reject this parameterisation.
- `MultiTimeframeRsiStrategy` (`multi_tf.py`): renamed from an underscore class
  name so the Freqtrade resolver can run it; -33.15% return, 39.16% drawdown,
  289 trades and profit factor 0.66. Reject this parameterisation.
- `MatrixBugScalper`: first annual 1m audit produced 5,903 trades, -98.66%
  return, 98.66% drawdown and profit factor 0.51. Reject; the source's assumed
  low-cost limit fills are not evidence of a viable strategy.
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
- `GodStra`: annual 12h audit completed after confirming its `ta` dependency;
  it produced no trade across the five-pair spot sample. Keep inactive rather
  than retuning it to manufacture signals.
- `Heracles`: annual 4h audit completed after confirming its `ta` dependency;
  91 trades returned -53.58% with 64.21% drawdown and profit factor 0.39.
  Reject the parameterisation: a 65.9% win rate hid a small number of
  disproportionate losses.
- `StratyxAdaptedStrategy`: requires market entries, so it was audited with
  the dedicated dry-run market-order profile. It made 179 trades for -10.94%
  return, 12.46% drawdown and profit factor 0.52. Reject.
- `HumanConfluenceStrategy`: repaired to use a valid 15m-entry/1h-trend layout,
  but generated no trade in the annual sample. Keep as an inactive reference.
- `NostalgiaForInfinityX7` (external quarantine, 2025-08-24 to 2026-08-24):
  +1.61%, 2.59% drawdown and profit factor 1.60, but only 5 trades. This is
  statistically inconclusive and its long informative-history requirements
  were not fully met by that preliminary fixture; do not activate or award a
  performance rating.

## Needs dependency review

These use optional packages and should only be tested after their dependencies
are confirmed in the `strategy-lab` image:

- `PatternRecognition.py`, `PowerTower.py`, `UniversalMACD.py`
  (`pandas_ta` and/or `technical`)
- `sample_strategy.py` (`technical`)

`GodStra.py` and `Heracles.py` require `ta`; that dependency is pinned in
`Dockerfile.engine`, and both have completed their annual audits.

## FreqAI research rack

- `FreqaiCpuStrategy`: the isolated CPU rack has completed its first bounded
  three-month dry-run backtest (BTC/ETH/SOL, 15m, LightGBM, 1 CPU and 2 GB
  memory). The full training/prediction chain ran successfully, producing 137
  trades for -0.15% return and 0.89% drawdown. This validates the rack, not the
  model: the negative result is not promotable, and lookahead, recursive,
  longer out-of-sample and resource gates remain required.

## External quarantine: Ceyhanmolla batch

The source files remain under `strategy_library/sources/` until a candidate
passes the complete gate; they are not copied into `strategies/` merely because
they load. The first three compatible V3 candidates were audited against the
same five-pair Binance spot sample (2025-08-24 to 2026-08-25):

- `AdaptiveMomentum`: 31 trades, -17.36% return, 19.81% drawdown and profit
  factor 0.30. Its per-candle DCA logging is also too noisy for the execution
  rack. Reject the source parameterisation.
- `EVX_Tactical_Strategy`: 1,341 trades, -65.46% return, 72.15% drawdown and
  profit factor 0.72. Reject.
- `EwoMomentumV1`: 339 trades, -65.35% return, 76.39% drawdown and profit
  factor 0.61. Reject.
- `FSampleStrategy`: 87 trades, -52.74% return, 65.40% drawdown and profit
  factor 0.34. Reject.
- `PivotPointStrategy`: 66 trades, -19.30% return, 21.68% drawdown and profit
  factor 0.21. Reject.
- `YigitBoxStrategy`: 585 trades, -26.58% return and 28.39% drawdown. Reject.
- `YigitBoxSystemStrategy`: 1,499 trades, -62.23% return and 68.41% drawdown.
  Reject.
- `TrendFollowingStrategyV2`: 110 trades, -53.33% return and 67.05%
  drawdown. Reject.
- `GeneticEngineV1`: 412 trades, -30.83% return and 43.10% drawdown. Reject.
- `ContraRatingsStrategy`: bounded 92-day 1m screening (six timeframes), 61
  trades, -8.93% return, 18.83% drawdown and profit factor 0.59. Reject the
  source parameterisation; an annual run is not justified.
- `ContraRatingsStrategyV2`: bounded 92-day 1m screening, 110 trades, -5.81%
  return, 24.23% drawdown and profit factor 0.82. It also took roughly three
  minutes with a single CPU. Reject the source parameterisation.

## External quarantine: Zevrichards batch

All 16 files load under the current engine, but the source contains four pairs
of equivalent 4h/1d variants. Only one representative of each pair enters the
financial audit. The `BinHV45_*_5m` family also has a systemic informative
column defect: it tests names such as `1h_is_bear`, while the current resolver
merges them as `is_bear_1h`. Its permissive fallback therefore disables the
intended 1h regime filter. Source backtests for this family are diagnostics,
not valid financial evidence, until an independent implementation is audited.

- `EMAcross`: 6 trades, -2.03% return and 3.26% drawdown. Too few trades and
  negative; reject.
- `MeanReversion`: 26 trades, -6.76% return and 7.50% drawdown. Reject.
- `DCAStrategy`: no trade in the annual five-pair sample. Keep as an inactive
  source reference; do not treat its DCA logic as validated.
- `MomentumBreakout_4h`: 13 trades, -0.48% return and 5.34% drawdown. Too few
  trades and negative; reject.
- `BinHV45_RSIDivergence_5m`: no trade in the annual diagnostic run. Keep
  inactive; the regime-column defect means this is not a valid strategy audit.
- `BinHV45_Bounce_5m`: its diagnostic run showed 36 trades, +17.45% return,
  1.01% drawdown and profit factor 5.10, with a positive short OOS slice.
  Those figures are invalidated by the family-wide regime-column defect. In
  addition, recursive analysis exposed an EMA200 `None`/float `TypeError` on
  partial history. It must not be activated, repaired in place or copied to the
  execution strategy folder.
- `QuantCoreBounceResearch`: independent defensive implementation of the
  capitulation/bounce hypothesis. It fixes missing-indicator handling, uses the
  actual Freqtrade informative-column suffixes and passes recursive analysis
  with 2,400/3,000/4,000 startup candles without indicator lookahead. Its
  annual sample is +6.74% over 13 trades with 1.01% drawdown and profit factor
  7.21, but the 2026-05-24 to 2026-08-25 out-of-sample window is -0.39% over
  two trades. Retain as a research reference only; it is not eligible for
  dry-run or execution.

## External quarantine: Marcosfreitas batch

- `BusyGuy`: the legacy V2 source still loads under the current engine, but it
  relies on deprecated configuration keys and a 70% stoploss. In the annual
  five-pair Binance spot audit it made 24 trades for -63.76% return and 66.69%
  drawdown (despite a 79.2% win rate). Reject the source parameterisation;
  winning trades were outweighed by a few very large losses.

## External quarantine: NateEmma batch

This source is primarily a TensorFlow/MLX/GAN research framework. Its anomaly,
GAN, debug and correlation modules require heavyweight optional packages and
are intentionally kept in the separate ML-runtime queue; they are not engine
dependencies.

The 15 `Basket` classes load on the current Freqtrade engine, but they manage
portfolio allocation, rebalancing and position adjustment across a basket.
They must be evaluated with a dedicated portfolio configuration, a fuller pair
universe and capital-allocation accounting. They are not comparable to the
five-pair, per-trade spot audit and are therefore queued for a separate basket
audit rather than marked good or bad from an invalid test.

## External quarantine: NostalgiaForInfinity batch

All seven X variants load in the current engine, but they are a specialised
multi-timeframe system rather than drop-in five-pair spot strategies. X6 alone
is roughly 69,000 lines, has a `-0.99` stoploss, requests per-pair 15m/1h/4h/1d
data plus BTC reference data, and asks for 1d history starting in 2023. The
current one-year fixture begins in 2025, so its annual run ends before a valid
result can be produced. Keep the whole family in a separate long-history,
multi-pair and resource-limited audit queue; do not infer performance from the
preliminary X7 screen or copy it to the execution folder.

## Legacy

- `legacy/CryptoFrog.py`: retained for reference; it uses the older buy/sell
  interface and extra packages (`finta`, `skopt`, `cachetools`).
