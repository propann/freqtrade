#!/usr/bin/env python3
"""Check Freqtrade OHLCV Feather files before using them in research.

The check is deliberately read-only.  It reports duplicate timestamps, missing
candles and invalid OHLC/volume values so a backtest cannot silently look more
precise than its data permits.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd


TIMEFRAME_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "12h": 43200, "1d": 86400}
NAME = re.compile(r"^(?P<pair>.+)-(?P<timeframe>\d+[mhd])\.feather$")


def inspect(path: Path) -> dict[str, object]:
    match = NAME.match(path.name)
    if not match or match["timeframe"] not in TIMEFRAME_SECONDS:
        return {"file": path.name, "status": "skipped"}
    try:
        frame = pd.read_feather(path, columns=["date", "open", "high", "low", "close", "volume"])
    except (OSError, ValueError, KeyError) as error:
        return {"file": path.name, "pair": match["pair"], "timeframe": match["timeframe"], "status": "unreadable", "message": str(error)}
    required = {"date", "open", "high", "low", "close", "volume"}
    if required - set(frame.columns) or frame.empty:
        return {"file": path.name, "pair": match["pair"], "timeframe": match["timeframe"], "status": "invalid_schema"}
    dates = pd.to_datetime(frame["date"], utc=True, errors="coerce")
    gaps = dates.sort_values().diff().dt.total_seconds().fillna(0)
    expected = TIMEFRAME_SECONDS[match["timeframe"]]
    missing = int(((gaps[gaps > expected] // expected) - 1).sum())
    invalid_price = int(((frame["high"] < frame[["open", "close", "low"]].max(axis=1)) | (frame["low"] > frame[["open", "close", "high"]].min(axis=1))).sum())
    invalid_volume = int((frame["volume"] < 0).sum())
    duplicates = int(dates.duplicated().sum())
    bad_dates = int(dates.isna().sum())
    status = "pass" if not any((missing, invalid_price, invalid_volume, duplicates, bad_dates)) else "review"
    return {
        "file": path.name, "pair": match["pair"], "timeframe": match["timeframe"], "status": status,
        "rows": int(len(frame)), "start": dates.min().isoformat(), "end": dates.max().isoformat(),
        "missing_intervals": missing, "duplicate_timestamps": duplicates, "invalid_price_rows": invalid_price,
        "negative_volume_rows": invalid_volume, "invalid_dates": bad_dates,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    reports = [inspect(path) for path in sorted(args.data_dir.glob("*.feather"))]
    payload = {"schema_version": 1, "reports": reports, "passed": sum(item.get("status") == "pass" for item in reports), "review": sum(item.get("status") not in {"pass", "skipped"} for item in reports)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0 if not payload["review"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
