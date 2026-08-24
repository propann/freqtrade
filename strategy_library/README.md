# Strategy library

This directory contains imported strategy packs kept locally for research. They
are intentionally outside `strategies/` so the active strategy directory stays
small and easy to inspect.

## Contents

- `imports/`: complete third-party strategy packs and their supporting files.
- `generated/`: timestamped/generated candidates and Python cache files.
- `support/`: notebooks, legacy configuration and helper files kept for
  reference but not loaded as active strategies.

The active candidates remain directly in `strategies/`. Nothing in this library
has been marked as profitable or safe for live trading; each strategy still
needs its own backtest, configuration review, and lookahead-bias check.
