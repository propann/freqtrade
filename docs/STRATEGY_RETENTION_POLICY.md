# Strategy retention policy

Every discovered strategy is retained in the source quarantine or active
research catalogue. A negative backtest is evidence about one implementation,
market sample, fee model and execution profile; it is never a reason to erase
the source.

## Statuses

- **Rejected parameterisation**: runnable and tested, but unsuitable for the
  tested deployment profile. It remains available for comparison and revision.
- **Inactive reference**: runnable but generated too few trades to evaluate.
- **Compatibility queue**: static candidate awaiting isolated loading and test.
- **Separate runtime**: requires FreqAI, ML training, futures data or another
  environment not provided by the ordinary spot research image.

## Inverse hypotheses

An inverse is a separate research strategy, not a switch applied to a failed
long strategy. It must define the intended execution venue and mode (spot,
margin or perpetual futures), borrow/funding costs, leverage limit, liquidation
buffer, maker/taker fee model, slippage and a fresh walk-forward evaluation.
It only enters the catalogue after its own compatibility, lookahead, recursive,
annual, out-of-sample and dry-run checks.

For Binance spot, a short inverse cannot be executed directly. It is retained
as a signal hypothesis until a supported margin or perpetual adapter and risk
profile exist.
