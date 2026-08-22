#!/usr/bin/env python3
"""Benchmark one strategy's indicator pass inside the Freqtrade image.

The fixture is deterministic and is never presented as market data. It exists
only to compare CPU and dataframe memory costs between rack profiles.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import platform
import resource
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def read_profile(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    required = {"id", "strategy", "strategy_file", "timeframe", "indicators"}
    if not isinstance(payload, dict) or required - payload.keys():
        raise ValueError(f"Profil incomplet : {path}")
    return payload


def load_strategy(profile: dict[str, Any], strategy_dir: Path):
    strategy_path = strategy_dir / Path(str(profile["strategy_file"])).name
    if not strategy_path.is_file():
        raise FileNotFoundError(f"Stratégie absente : {strategy_path}")
    spec = importlib.util.spec_from_file_location("quant_benchmark_strategy", strategy_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Chargement impossible : {strategy_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    strategy_class = getattr(module, str(profile["strategy"]), None)
    if strategy_class is None:
        raise ImportError(f"Classe {profile['strategy']} absente de {strategy_path.name}")
    return strategy_class.__new__(strategy_class), strategy_path


def deterministic_ohlcv(rows: int, timeframe: str) -> pd.DataFrame:
    minutes = 15
    if timeframe.endswith("m") and timeframe[:-1].isdigit():
        minutes = max(1, int(timeframe[:-1]))
    sequence = np.arange(rows, dtype=np.float64)
    centre = 100.0 + (sequence * 0.002) + (np.sin(sequence / 19.0) * 1.8)
    opening = centre + (np.cos(sequence / 11.0) * 0.12)
    closing = centre + (np.sin(sequence / 13.0) * 0.12)
    return pd.DataFrame({
        "date": pd.date_range("2025-01-01", periods=rows, freq=f"{minutes}min", tz="UTC"),
        "open": opening,
        "high": np.maximum(opening, closing) + 0.25,
        "low": np.minimum(opening, closing) - 0.25,
        "close": closing,
        "volume": 900.0 + np.mod(sequence * 37.0, 250.0),
    })


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * fraction))))]


def benchmark(profile_path: Path, strategy_dir: Path, rows: int, repeats: int) -> dict[str, Any]:
    if not 500 <= rows <= 2_000_000:
        raise ValueError("--rows doit être compris entre 500 et 2000000")
    if not 1 <= repeats <= 20:
        raise ValueError("--repeats doit être compris entre 1 et 20")

    profile = read_profile(profile_path)
    strategy, strategy_path = load_strategy(profile, strategy_dir)
    source = deterministic_ohlcv(rows, str(profile["timeframe"]))
    input_columns = set(source.columns)
    input_bytes = int(source.memory_usage(index=True, deep=True).sum())

    # Warm-up imports and native TA-Lib paths before collecting timings.
    strategy.populate_indicators(source.copy(deep=True), {"pair": "BENCH/USDT"})
    timings: list[float] = []
    output = None
    for _ in range(repeats):
        frame = source.copy(deep=True)
        started = time.perf_counter()
        output = strategy.populate_indicators(frame, {"pair": "BENCH/USDT"})
        timings.append((time.perf_counter() - started) * 1000)

    if output is None or len(output) != rows:
        raise RuntimeError("La stratégie a modifié le nombre de bougies")
    added_columns = sorted(set(output.columns) - input_columns)
    output_bytes = int(output.memory_usage(index=True, deep=True).sum())
    nan_cells = int(output[added_columns].isna().sum().sum()) if added_columns else 0
    rss_kib = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if sys.platform == "darwin":
        rss_kib //= 1024

    return {
        "schema_version": 1,
        "dataset": "deterministic_benchmark_fixture",
        "profile": profile["id"],
        "strategy": profile["strategy"],
        "strategy_file": strategy_path.name,
        "timeframe": profile["timeframe"],
        "declared_indicators": profile["indicators"],
        "rows": rows,
        "repeats": repeats,
        "timing_ms": {
            "median": round(statistics.median(timings), 3),
            "p95": round(percentile(timings, 0.95), 3),
            "min": round(min(timings), 3),
            "max": round(max(timings), 3),
            "per_1000_rows_median": round(statistics.median(timings) * 1000 / rows, 3),
        },
        "memory": {
            "input_bytes": input_bytes,
            "output_bytes": output_bytes,
            "indicator_bytes": output_bytes - input_bytes,
            "process_peak_rss_kib": rss_kib,
        },
        "output_columns": added_columns,
        "nan_cells": nan_cells,
        "runtime": {
            "python": platform.python_version(),
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "platform": platform.platform(),
        },
    }


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Mesure reproductible des indicateurs d'une stratégie")
    command.add_argument("--profile", type=Path, required=True)
    command.add_argument("--strategy-dir", type=Path, required=True)
    command.add_argument("--rows", type=int, default=10_000)
    command.add_argument("--repeats", type=int, default=5)
    command.add_argument("--output", type=Path, required=True)
    return command


def main() -> int:
    args = parser().parse_args()
    try:
        result = benchmark(args.profile, args.strategy_dir, args.rows, args.repeats)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(args.output)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OSError, ValueError, ImportError, RuntimeError) as exc:
        print(f"indicator-bench: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
