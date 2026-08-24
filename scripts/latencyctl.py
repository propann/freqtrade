#!/usr/bin/env python3
"""Measure execution-path latency without storing credentials or order payloads.

This collector does not place orders.  It samples public CEX connectivity, the
private Freqtrade API when configured, and optionally a read-only EVM RPC.
Its output is an input for conservative research assumptions, not proof that a
backtest models real fills or MEV.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("QUANT_RACK_ROOT", Path(__file__).resolve().parent.parent))
LATENCY_DIR = Path(os.environ.get("QUANT_LATENCY_DIR", ROOT / "user_data" / "latency"))
SAMPLES_PATH = LATENCY_DIR / "samples.jsonl"
PROFILE_PATH = LATENCY_DIR / "execution-profile.json"
CEX_PROBE_URL = os.environ.get("QUANT_CEX_PROBE_URL", "https://api.binance.com/api/v3/time")
DEX_RPC_URL = os.environ.get("QUANT_DEX_RPC_URL", "")
FREQTRADE_API_URL = os.environ.get("FREQTRADE_API_URL", "http://127.0.0.1:8080").rstrip("/")
FREQTRADE_USERNAME = os.environ.get("FREQTRADE_USERNAME", "")
FREQTRADE_PASSWORD = os.environ.get("FREQTRADE_PASSWORD", "")


class LatencyError(RuntimeError):
    pass


def safe_target(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    return parsed.netloc or "invalid-target"


def http_probe(url: str, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {"Accept": "application/json"})
    started = time.monotonic_ns()
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = response.read()
            elapsed_ms = (time.monotonic_ns() - started) / 1_000_000
            return {"target": safe_target(url), "ok": True, "status_code": response.status, "rtt_ms": round(elapsed_ms, 3), "payload": payload}
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        elapsed_ms = (time.monotonic_ns() - started) / 1_000_000
        return {"target": safe_target(url), "ok": False, "error_type": type(exc).__name__, "rtt_ms": round(elapsed_ms, 3)}


def cex_sample() -> dict[str, Any]:
    result = http_probe(CEX_PROBE_URL)
    return {key: value for key, value in result.items() if key != "payload"}


def engine_sample() -> dict[str, Any]:
    if not FREQTRADE_USERNAME or not FREQTRADE_PASSWORD:
        return {"target": safe_target(FREQTRADE_API_URL), "ok": False, "error_type": "credentials_unavailable", "rtt_ms": None}
    token = base64.b64encode(f"{FREQTRADE_USERNAME}:{FREQTRADE_PASSWORD}".encode()).decode()
    result = http_probe(f"{FREQTRADE_API_URL}/api/v1/ping", headers={"Accept": "application/json", "Authorization": f"Basic {token}"})
    return {key: value for key, value in result.items() if key != "payload"}


def dex_sample() -> dict[str, Any] | None:
    if not DEX_RPC_URL:
        return None
    request_body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_getBlockByNumber", "params": ["latest", False]}).encode()
    result = http_probe(DEX_RPC_URL, method="POST", body=request_body, headers={"Content-Type": "application/json"})
    payload = result.pop("payload", b"")
    block_timestamp: int | None = None
    block_number: int | None = None
    if result["ok"]:
        try:
            block = json.loads(payload.decode("utf-8")).get("result") or {}
            block_timestamp = int(str(block.get("timestamp")), 16)
            block_number = int(str(block.get("number")), 16)
        except (ValueError, TypeError, json.JSONDecodeError):
            result["ok"] = False
            result["error_type"] = "invalid_rpc_response"
    result["block_number"] = block_number
    result["block_timestamp"] = block_timestamp
    return result


def append_sample(sample: dict[str, Any]) -> None:
    LATENCY_DIR.mkdir(parents=True, exist_ok=True)
    with SAMPLES_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(sample, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def collect_sample(now: datetime | None = None) -> dict[str, Any]:
    return {"schema_version": 1, "observed_at": (now or datetime.now(timezone.utc)).isoformat(), "cex": cex_sample(), "engine": engine_sample(), "dex": dex_sample()}


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = round((len(ordered) - 1) * fraction)
    return round(ordered[index], 3)


def read_samples(hours: int, now: datetime | None = None) -> list[dict[str, Any]]:
    if not 1 <= hours <= 2160:
        raise LatencyError("--hours doit être compris entre 1 et 2160")
    if not SAMPLES_PATH.is_file():
        raise LatencyError("Aucun relevé de latence disponible")
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(hours=hours)
    records: list[dict[str, Any]] = []
    for line in SAMPLES_PATH.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
            observed_at = datetime.fromisoformat(str(item["observed_at"]).replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
        if isinstance(item, dict) and observed_at >= cutoff:
            records.append(item)
    if not records:
        raise LatencyError("Aucun relevé dans la fenêtre demandée")
    return records


def metrics(records: list[dict[str, Any]], section: str) -> dict[str, Any]:
    successful = [item.get(section, {}) for item in records if isinstance(item.get(section), dict) and item[section].get("ok")]
    rtts = [float(item["rtt_ms"]) for item in successful if isinstance(item.get("rtt_ms"), (int, float))]
    return {"samples": len(records), "successful": len(successful), "p50_ms": percentile(rtts, 0.50), "p95_ms": percentile(rtts, 0.95), "p99_ms": percentile(rtts, 0.99), "average_ms": round(statistics.fmean(rtts), 3) if rtts else None}


def build_profile(records: list[dict[str, Any]], hours: int) -> dict[str, Any]:
    cex = metrics(records, "cex")
    engine = metrics(records, "engine")
    dex = metrics(records, "dex")
    return {
        "schema_version": 1,
        "window_hours": hours,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cex_public_http": cex,
        "engine_api": engine,
        "dex_rpc": dex,
        "backtest_assumptions": {
            "signal_delay_seconds_p95": round((cex["p95_ms"] or 0) / 1000, 3) if cex["p95_ms"] is not None else None,
            "slippage_bps_per_side": None,
            "fee_per_side": None,
            "note": "La latence seule ne modélise pas les fills. Renseigner slippage et frais à partir des ordres réellement exécutés avant toute promotion live.",
        },
    }


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Mesure passive du chemin d’exécution CEX/DEX")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("sample")
    profile = commands.add_parser("profile")
    profile.add_argument("--hours", type=int, default=168)
    return root


def main(argv: list[str] | None = None) -> int:
    try:
        args = parser().parse_args(argv)
        if args.command == "sample":
            sample = collect_sample()
            append_sample(sample)
            print(json.dumps(sample, ensure_ascii=False, indent=2))
        else:
            profile = build_profile(read_samples(args.hours), args.hours)
            LATENCY_DIR.mkdir(parents=True, exist_ok=True)
            temporary = PROFILE_PATH.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary.replace(PROFILE_PATH)
            print(json.dumps(profile, ensure_ascii=False, indent=2))
        return 0
    except LatencyError as exc:
        print(f"latencyctl: {exc}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
