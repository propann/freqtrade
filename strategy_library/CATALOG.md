# Active strategy catalogue

Static screening only: a strategy is not promoted for trading until it passes
the project's backtest, lookahead, recursive and out-of-sample checks.

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
- `FixedRiskRewardLoss`: runtime failure with the current pandas API.
- `AlmgrenChrissStrategy`, `TWAPStrategy`: short strategies, outside the Binance
  spot profile.

## Observe, not promoted

- `IchiV1Research`: near flat in the sampled year (-0.13%) with 7.79% drawdown.
  It needs out-of-sample and dry-run evidence before any promotion.

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
