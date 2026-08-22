#!/usr/bin/env python3
"""Collect small, secret-free Freqtrade health samples and summarize them."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import statistics
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("QUANT_RACK_ROOT", Path(__file__).resolve().parent.parent))
OBSERVABILITY_DIR = Path(os.environ.get("QUANT_OBSERVABILITY_DIR", ROOT / "user_data" / "observability"))
SAMPLES_PATH = OBSERVABILITY_DIR / "samples.jsonl"
SUMMARY_PATH = OBSERVABILITY_DIR / "summary-168h.json"
FREQTRADE_API_URL = os.environ.get("FREQTRADE_API_URL", "http://127.0.0.1:8080").rstrip("/")
FREQTRADE_USERNAME = os.environ.get("FREQTRADE_USERNAME", "")
FREQTRADE_PASSWORD = os.environ.get("FREQTRADE_PASSWORD", "")
CPU_WARN_PCT = float(os.environ.get("OBS_CPU_WARN_PCT", "80"))
RAM_WARN_PCT = float(os.environ.get("OBS_RAM_WARN_PCT", "80"))
EXCHANGE_ERROR_WARN_COUNT = int(os.environ.get("OBS_EXCHANGE_ERROR_WARN_COUNT", "3"))


class ObserveError(RuntimeError):
    pass


def number(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if parsed == parsed else default
    except (TypeError, ValueError):
        return default


def api_get(endpoint: str) -> Any:
    if not FREQTRADE_USERNAME or not FREQTRADE_PASSWORD:
        raise ObserveError("Identifiants API Freqtrade absents")
    token = base64.b64encode(f"{FREQTRADE_USERNAME}:{FREQTRADE_PASSWORD}".encode()).decode()
    request = urllib.request.Request(
        f"{FREQTRADE_API_URL}/api/v1/{endpoint.lstrip('/')}",
        headers={"Accept": "application/json", "Authorization": f"Basic {token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ObserveError(f"HTTP {exc.code} sur {endpoint}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ObserveError(f"API indisponible sur {endpoint}") from exc


def timeframe_seconds(value: str) -> int:
    match = re.fullmatch(r"(\d+)([mhdw])", value or "")
    if not match:
        return 900
    amount, unit = int(match.group(1)), match.group(2)
    return amount * {"m": 60, "h": 3600, "d": 86400, "w": 604800}[unit]


def timestamp(value: Any) -> datetime | None:
    if isinstance(value, (int, float)) and value > 0:
        seconds = float(value) / 1000 if value > 10_000_000_000 else float(value)
        return datetime.fromtimestamp(seconds, timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def exchange_error_count(payload: Any) -> tuple[int, int]:
    logs = payload.get("logs", []) if isinstance(payload, dict) else []
    if not isinstance(logs, list):
        return 0, 0
    exchange_terms = (
        "exchange", "ccxt", "networkerror", "requesttimeout", "ratelimit",
        "rate limit", "ddosprotection", "binance", "kraken", "bybit", "coinbase",
    )
    count = 0
    for entry in logs:
        if not isinstance(entry, list):
            continue
        fields = [str(value).casefold() for value in entry]
        joined = " | ".join(fields)
        severity = any(value in ("error", "critical") for value in fields)
        if severity and any(term in joined for term in exchange_terms):
            count += 1
    return count, len(logs)


def collect_sample(now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    endpoints: dict[str, Any] = {}
    unavailable: list[str] = []
    endpoint_paths = {
        "ping": "ping",
        "show_config": "show_config",
        "status": "status",
        "sysinfo": "sysinfo",
        "health": "health",
        "logs": "logs?limit=100",
    }
    for endpoint, path in endpoint_paths.items():
        try:
            endpoints[endpoint] = api_get(path)
        except ObserveError:
            endpoints[endpoint] = None
            unavailable.append(endpoint)

    config = endpoints["show_config"] if isinstance(endpoints["show_config"], dict) else {}
    sysinfo = endpoints["sysinfo"] if isinstance(endpoints["sysinfo"], dict) else {}
    health = endpoints["health"] if isinstance(endpoints["health"], dict) else {}
    trades = endpoints["status"] if isinstance(endpoints["status"], list) else []
    ping_ok = isinstance(endpoints["ping"], dict) and endpoints["ping"].get("status") == "pong"
    cpu_pct = number(sysinfo.get("cpu_avg"))
    ram_pct = number(sysinfo.get("ram_pct"))
    timeframe = str(config.get("timeframe") or "")
    exchange_value = config.get("exchange")
    exchange = (
        exchange_value.get("name", "unknown")
        if isinstance(exchange_value, dict)
        else exchange_value if isinstance(exchange_value, str) and exchange_value else "unknown"
    )
    last_process = timestamp(health.get("last_process_ts")) or timestamp(health.get("last_process"))
    bot_start = timestamp(health.get("bot_start"))
    exchange_errors, log_window_size = exchange_error_count(endpoints["logs"])
    process_age = max(0.0, (now - last_process).total_seconds()) if last_process else None
    stale_after = timeframe_seconds(timeframe) * 2

    alerts: list[dict[str, str]] = []
    if unavailable or not ping_ok:
        alerts.append({"code": "api_unavailable", "level": "critical"})
    if config.get("state") not in (None, "running"):
        alerts.append({"code": "engine_not_running", "level": "critical"})
    if process_age is None:
        alerts.append({"code": "freshness_unknown", "level": "warning"})
    elif process_age > stale_after:
        alerts.append({"code": "stale_process", "level": "critical"})
    if cpu_pct >= CPU_WARN_PCT:
        alerts.append({"code": "cpu_high", "level": "warning"})
    if ram_pct >= RAM_WARN_PCT:
        alerts.append({"code": "ram_high", "level": "warning"})
    if exchange_errors >= EXCHANGE_ERROR_WARN_COUNT:
        alerts.append({"code": "exchange_errors", "level": "warning"})

    levels = {alert["level"] for alert in alerts}
    status = "critical" if "critical" in levels else "degraded" if "warning" in levels else "healthy"
    return {
        "schema_version": 1,
        "observed_at": now.isoformat(),
        "status": status,
        "alerts": alerts,
        "unavailable_endpoints": unavailable,
        "engine": {
            "ping": ping_ok,
            "state": config.get("state", "unknown"),
            "dry_run": config.get("dry_run") if isinstance(config.get("dry_run"), bool) else None,
            "strategy": config.get("strategy", "unknown"),
            "timeframe": timeframe or "unknown",
            "exchange": exchange,
            "open_trades": len(trades),
            "bot_start_at": bot_start.isoformat() if bot_start else None,
        },
        "resources": {
            "cpu_average_pct": round(cpu_pct, 3) if sysinfo else None,
            "cpu_count": int(number(sysinfo.get("cpu_count"))) if sysinfo else None,
            "ram_pct": round(ram_pct, 3) if sysinfo else None,
        },
        "freshness": {
            "last_process_at": last_process.isoformat() if last_process else None,
            "age_seconds": round(process_age, 3) if process_age is not None else None,
            "stale_after_seconds": stale_after,
        },
        "exchange": {
            "errors_in_log_window": exchange_errors,
            "log_window_size": log_window_size,
        },
        "thresholds": {
            "cpu_warn_pct": CPU_WARN_PCT,
            "ram_warn_pct": RAM_WARN_PCT,
            "exchange_error_warn_count": EXCHANGE_ERROR_WARN_COUNT,
        },
    }


def append_sample(sample: dict[str, Any]) -> None:
    OBSERVABILITY_DIR.mkdir(parents=True, exist_ok=True)
    with SAMPLES_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(sample, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def read_samples(hours: int, now: datetime | None = None) -> list[dict[str, Any]]:
    if not 1 <= hours <= 24 * 90:
        raise ObserveError("--hours doit être compris entre 1 et 2160")
    if not SAMPLES_PATH.is_file():
        raise ObserveError(f"Aucun relevé disponible : {SAMPLES_PATH}")
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    samples: list[dict[str, Any]] = []
    for line in SAMPLES_PATH.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
            observed = timestamp(item.get("observed_at"))
        except (json.JSONDecodeError, AttributeError):
            continue
        if isinstance(item, dict) and observed and observed >= cutoff:
            samples.append(item)
    if not samples:
        raise ObserveError(f"Aucun relevé sur les {hours} dernières heures")
    return samples


def values(samples: list[dict[str, Any]], section: str, field: str) -> list[float]:
    found = [sample.get(section, {}).get(field) for sample in samples]
    return [float(value) for value in found if isinstance(value, (int, float))]


def average(items: list[float]) -> float | None:
    return round(statistics.fmean(items), 3) if items else None


def maximum(items: list[float]) -> float | None:
    return round(max(items), 3) if items else None


def max_consecutive(items: list[bool]) -> int:
    best = current = 0
    for item in items:
        current = current + 1 if item else 0
        best = max(best, current)
    return best


def summarize(samples: list[dict[str, Any]], hours: int) -> dict[str, Any]:
    cpu = values(samples, "resources", "cpu_average_pct")
    ram = values(samples, "resources", "ram_pct")
    age = values(samples, "freshness", "age_seconds")
    open_trades = values(samples, "engine", "open_trades")
    exchange_errors = values(samples, "exchange", "errors_in_log_window")
    bot_starts = {
        str(sample.get("engine", {}).get("bot_start_at"))
        for sample in samples
        if sample.get("engine", {}).get("bot_start_at")
    }
    modes = set()
    for sample in samples:
        dry_run = sample.get("engine", {}).get("dry_run")
        modes.add("dry_run" if dry_run is True else "live" if dry_run is False else "unknown")
    exchange_alerts = [
        any(alert.get("code") == "exchange_errors" for alert in sample.get("alerts", []))
        for sample in samples
    ]
    return {
        "schema_version": 1,
        "window_hours": hours,
        "from": samples[0]["observed_at"],
        "to": samples[-1]["observed_at"],
        "samples": len(samples),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status_counts": dict(Counter(str(sample.get("status", "unknown")) for sample in samples)),
        "cpu_average_pct": {"average": average(cpu), "max": maximum(cpu)},
        "ram_pct": {"average": average(ram), "max": maximum(ram)},
        "freshness_age_seconds": {"average": average(age), "max": maximum(age)},
        "max_open_trades": int(max(open_trades)) if open_trades else None,
        "observed_bot_starts": len(bot_starts),
        "restart_count_lower_bound": max(0, len(bot_starts) - 1),
        "exchange_errors": {
            "max_in_log_window": int(max(exchange_errors)) if exchange_errors else 0,
            "samples_with_errors": sum(1 for value in exchange_errors if value > 0),
            "max_consecutive_alert_samples": max_consecutive(exchange_alerts),
        },
        "strategies": sorted({str(sample.get("engine", {}).get("strategy")) for sample in samples}),
        "modes": sorted(modes),
    }


def write_summary(summary: dict[str, Any]) -> None:
    OBSERVABILITY_DIR.mkdir(parents=True, exist_ok=True)
    temporary = SUMMARY_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(SUMMARY_PATH)


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Observabilité Freqtrade légère et ponctuelle")
    subcommands = command.add_subparsers(dest="command", required=True)
    sample = subcommands.add_parser("sample")
    sample.add_argument("--fail-on-alert", action="store_true")
    summary = subcommands.add_parser("summary")
    summary.add_argument("--hours", type=int, default=168)
    return command


def main(argv: list[str] | None = None) -> int:
    try:
        args = parser().parse_args(argv)
        if args.command == "sample":
            result = collect_sample()
            append_sample(result)
            write_summary(summarize(read_samples(168), 168))
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 1 if args.fail_on_alert and result["status"] != "healthy" else 0
        result = summarize(read_samples(args.hours), args.hours)
        if args.hours == 168:
            write_summary(result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ObserveError as exc:
        print(f"observectl: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
