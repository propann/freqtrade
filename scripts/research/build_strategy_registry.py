#!/usr/bin/env python3
"""Build a conservative, read-only strategy registry from Freqtrade ZIP exports."""

from __future__ import annotations

import argparse
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def number(value: Any) -> float | None:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if value == value else None


def resource_record(report: dict[str, Any] | None) -> dict[str, Any]:
    if not report:
        return {"status": "not_measured"}
    timing = report.get("timing_ms") if isinstance(report.get("timing_ms"), dict) else {}
    memory = report.get("memory") if isinstance(report.get("memory"), dict) else {}
    per_1000 = number(timing.get("per_1000_rows_median"))
    indicator_bytes = number(memory.get("indicator_bytes"))
    # These are review triggers, not a claim about profitability.  They keep a
    # single strategy under a conservative 1 CPU / 1 GiB VPS profile.
    review = (per_1000 is not None and per_1000 > 50) or (indicator_bytes is not None and indicator_bytes > 50 * 1024 * 1024)
    return {
        "status": "needs_review" if review else "measured",
        "timing_ms_per_1000_rows": per_1000,
        "timing_p95_ms": number(timing.get("p95")),
        "indicator_bytes": int(indicator_bytes) if indicator_bytes is not None else None,
        "process_peak_rss_kib": memory.get("process_peak_rss_kib"),
        "rows": report.get("rows"),
        "repeats": report.get("repeats"),
    }


def classify(metrics: dict[str, Any], resources: dict[str, Any]) -> tuple[str, int, str]:
    trades = int(metrics.get("trades") or 0)
    profit = number(metrics.get("profit_pct")) or 0.0
    drawdown = number(metrics.get("drawdown_pct")) or 0.0
    profit_factor = number(metrics.get("profit_factor")) or 0.0
    if trades == 0:
        return "insufficient_activity", 0, "No trades in the tested window."
    if profit <= 0 or profit_factor < 1:
        return "rejected_annual", 0, "Negative annual result or profit factor below 1."
    if trades < 30:
        return "observation", 0, "Too few trades for a performance conclusion."
    if drawdown > 20:
        return "observation", 0, "Positive result but annual drawdown exceeds 20%."
    if resources["status"] == "not_measured":
        return "candidate_resource_benchmark", 0, "Financial screen passed; resource benchmark is still required."
    if resources["status"] == "needs_review":
        return "candidate_resource_review", 0, "Financial screen passed; CPU or memory cost requires review."
    return "candidate_validation", 1, "Requires lookahead, recursive, OOS and dry-run checks."


def read_zip(path: Path, benchmarks: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    with zipfile.ZipFile(path) as archive:
        reports = [name for name in archive.namelist() if name.endswith(".json") and not name.endswith("_config.json")]
        if not reports:
            return []
        payload = json.loads(archive.read(reports[0]))
    results: list[dict[str, Any]] = []
    for item in payload.get("strategy_comparison", []):
        if not isinstance(item, dict) or not isinstance(item.get("key"), str):
            continue
        drawdown = number(item.get("max_drawdown_account"))
        metrics = {
            "trades": int(item.get("trades") or 0),
            "profit_pct": round((number(item.get("profit_total_pct")) or 0.0), 4),
            "profit_abs": number(item.get("profit_total_abs")),
            "drawdown_pct": round((drawdown or 0.0) * 100, 4),
            "profit_factor": number(item.get("profit_factor")),
        }
        resources = resource_record(benchmarks.get(item["key"]))
        status, stars, reason = classify(metrics, resources)
        results.append({
            "strategy": item["key"], "status": status, "stars": stars, "reason": reason,
            "metrics": metrics, "resources": resources, "artifact": path.name,
        })
    return results


def load_benchmarks(root: Path | None) -> dict[str, dict[str, Any]]:
    if not root or not root.is_dir():
        return {}
    reports: dict[str, dict[str, Any]] = {}
    for path in sorted(root.rglob("indicator-benchmark.json"), key=lambda candidate: candidate.stat().st_mtime):
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(report.get("strategy"), str):
                reports[report["strategy"]] = report
        except (OSError, ValueError, TypeError):
            continue
    return reports


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("results", type=Path, help="Freqtrade backtest_results directory")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--benchmarks", type=Path, help="research directory containing indicator-benchmark.json reports")
    args = parser.parse_args()
    newest: dict[str, dict[str, Any]] = {}
    benchmarks = load_benchmarks(args.benchmarks)
    for path in sorted(args.results.glob("*.zip"), key=lambda candidate: candidate.stat().st_mtime):
        try:
            for record in read_zip(path, benchmarks):
                newest[record["strategy"]] = record
        except (OSError, ValueError, zipfile.BadZipFile, KeyError):
            continue
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "method": "latest native Freqtrade ZIP per strategy; no promotion without further validation",
        "strategies": sorted(newest.values(), key=lambda item: item["strategy"].lower()),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
