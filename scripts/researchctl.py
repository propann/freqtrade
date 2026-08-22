#!/usr/bin/env python3
"""Run one reproducible, resource-bounded Freqtrade research job at a time."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("QUANT_RACK_ROOT", Path(__file__).resolve().parent.parent))
PROFILES_DIR = Path(os.environ.get("QUANT_RACK_PROFILES", ROOT / "quant_rack" / "profiles"))
CONFIG_PATH = Path(os.environ.get("QUANT_RACK_CONFIG", ROOT / "user_data" / "config.json"))
RESEARCH_DIR = Path(os.environ.get("QUANT_RESEARCH_DIR", ROOT / "user_data" / "research"))
LOCK_PATH = RESEARCH_DIR / "research.lock"
REGISTRY_PATH = RESEARCH_DIR / "experiments.jsonl"
COMPOSE_FILE = Path(os.environ.get("QUANT_COMPOSE_FILE", ROOT / "docker-compose.coolify.yml"))
ENV_FILE = Path(os.environ.get("QUANT_ENV_FILE", ROOT / ".env"))
TIMERANGE_PATTERN = re.compile(r"^\d{8}(?:-\d{8})?$")


class ResearchError(RuntimeError):
    pass


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise ResearchError(f"Fichier JSON inutilisable : {path}") from exc
    if not isinstance(value, dict):
        raise ResearchError(f"Objet JSON attendu : {path}")
    return value


def profile(profile_id: str) -> dict[str, Any]:
    path = PROFILES_DIR / f"{profile_id}.json"
    item = read_json(path)
    required = {"id", "strategy", "strategy_file", "timeframe", "budget", "indicators"}
    if required - item.keys() or item.get("id") != profile_id:
        raise ResearchError(f"Profil incomplet ou incohérent : {profile_id}")
    indicators = item["indicators"]
    if not isinstance(indicators, list) or not indicators or any(
        not isinstance(name, str) or not name.strip() for name in indicators
    ):
        raise ResearchError(f"Liste d'indicateurs invalide : {profile_id}")
    normalized = [name.strip().casefold() for name in indicators]
    if len(normalized) != len(set(normalized)):
        raise ResearchError(f"Indicateur dupliqué : {profile_id}")
    strategy_path = ROOT / str(item["strategy_file"])
    if not strategy_path.is_file():
        raise ResearchError(f"Stratégie absente : {strategy_path}")
    return item


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_revision() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, timeout=2, check=True
        )
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def validate_timerange(value: str) -> str:
    if not TIMERANGE_PATTERN.fullmatch(value):
        raise ResearchError("Timerange attendu : YYYYMMDD ou YYYYMMDD-YYYYMMDD")
    if "-" in value:
        start, end = value.split("-", 1)
        if start >= end:
            raise ResearchError("La fin du timerange doit être postérieure au début")
    return value


@contextmanager
def research_lock():
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK_PATH.open("a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ResearchError("Un travail de recherche est déjà en cours") from exc
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def append_registry(payload: dict[str, Any]) -> None:
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    with REGISTRY_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def experiment_plan(profile_id: str, timerange: str) -> dict[str, Any]:
    item = profile(profile_id)
    timerange = validate_timerange(timerange)
    strategy_path = ROOT / str(item["strategy_file"])
    return {
        "kind": "backtest",
        "profile": profile_id,
        "strategy": item["strategy"],
        "strategy_sha256": sha256(strategy_path),
        "config_sha256": sha256(CONFIG_PATH) if CONFIG_PATH.is_file() else "missing",
        "git_commit": git_revision(),
        "timeframe": item["timeframe"],
        "timerange": timerange,
        "budget": item["budget"],
        "runner": "docker-compose/strategy-lab",
        "parallel_jobs": 1,
    }


def benchmark_plan(profile_id: str, rows: int, repeats: int) -> dict[str, Any]:
    item = profile(profile_id)
    if not 500 <= rows <= 2_000_000:
        raise ResearchError("--rows doit être compris entre 500 et 2000000")
    if not 1 <= repeats <= 20:
        raise ResearchError("--repeats doit être compris entre 1 et 20")
    strategy_path = ROOT / str(item["strategy_file"])
    return {
        "kind": "indicator_benchmark",
        "profile": profile_id,
        "strategy": item["strategy"],
        "strategy_sha256": sha256(strategy_path),
        "git_commit": git_revision(),
        "timeframe": item["timeframe"],
        "rows": rows,
        "repeats": repeats,
        "declared_indicators": item.get("indicators", []),
        "budget": item["budget"],
        "runner": "docker-compose/strategy-lab",
        "parallel_jobs": 1,
        "dataset": "deterministic_benchmark_fixture",
    }


def run_experiment(profile_id: str, timerange: str, confirmation: str) -> dict[str, Any]:
    if confirmation != "RESEARCH":
        raise ResearchError("Confirmation requise : --confirm RESEARCH")
    if not CONFIG_PATH.is_file():
        raise ResearchError(f"Configuration Freqtrade absente : {CONFIG_PATH}")
    if not COMPOSE_FILE.is_file() or not ENV_FILE.is_file():
        raise ResearchError("Fichier Compose ou .env absent")

    plan = experiment_plan(profile_id, timerange)
    experiment_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{profile_id}"
    output_dir = RESEARCH_DIR / experiment_id
    output_dir.mkdir(parents=True, exist_ok=False)
    relative_output = f"research/{experiment_id}/trades.json"
    command = [
        "docker", "compose", "--env-file", str(ENV_FILE), "-f", str(COMPOSE_FILE),
        "run", "--rm", "--no-deps", "strategy-lab", "backtesting",
        "--config", "/freqtrade/user_data/config.json",
        "--strategy", str(plan["strategy"]),
        "--timeframe", str(plan["timeframe"]),
        "--timerange", str(plan["timerange"]),
        "--export", "trades",
        "--export-filename", f"/freqtrade/user_data/{relative_output}",
    ]
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    timeout = max(60, min(14_400, int(os.environ.get("QUANT_RESEARCH_TIMEOUT", "3600"))))
    result = "failed"
    exit_code = 124
    try:
        completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=False)
        exit_code = completed.returncode
        (output_dir / "stdout.log").write_text(completed.stdout[-500_000:], encoding="utf-8")
        (output_dir / "stderr.log").write_text(completed.stderr[-500_000:], encoding="utf-8")
        result = "success" if exit_code == 0 else "failed"
        if result == "success" and not (output_dir / "trades.json").is_file():
            result = "failed"
            exit_code = 65
            with (output_dir / "stderr.log").open("a", encoding="utf-8") as handle:
                handle.write("\nExport Freqtrade absent.\n")
    except subprocess.TimeoutExpired as exc:
        (output_dir / "stdout.log").write_text((exc.stdout or "")[-500_000:], encoding="utf-8")
        (output_dir / "stderr.log").write_text((exc.stderr or "")[-500_000:], encoding="utf-8")
        result = "timeout"

    record = {
        **plan,
        "experiment_id": experiment_id,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "result": result,
        "exit_code": exit_code,
        "output": relative_output,
    }
    (output_dir / "metadata.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    append_registry(record)
    if result != "success":
        raise ResearchError(f"Expérience {experiment_id} terminée avec l'état {result}")
    return record


def run_benchmark(profile_id: str, rows: int, repeats: int, confirmation: str) -> dict[str, Any]:
    if confirmation != "BENCHMARK":
        raise ResearchError("Confirmation requise : --confirm BENCHMARK")
    plan = benchmark_plan(profile_id, rows, repeats)
    if not COMPOSE_FILE.is_file() or not ENV_FILE.is_file():
        raise ResearchError("Fichier Compose ou .env absent")

    experiment_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{profile_id}-indicators"
    output_dir = RESEARCH_DIR / experiment_id
    output_dir.mkdir(parents=True, exist_ok=False)
    relative_output = f"research/{experiment_id}/indicator-benchmark.json"
    command = [
        "docker", "compose", "--env-file", str(ENV_FILE), "-f", str(COMPOSE_FILE),
        "run", "--rm", "--no-deps", "--entrypoint", "python", "strategy-lab",
        "/freqtrade/quant_tools/indicator_bench.py",
        "--profile", f"/freqtrade/quant_rack/profiles/{profile_id}.json",
        "--strategy-dir", "/freqtrade/user_data/strategies",
        "--rows", str(rows),
        "--repeats", str(repeats),
        "--output", f"/freqtrade/user_data/{relative_output}",
    ]
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    timeout = max(60, min(3_600, int(os.environ.get("QUANT_BENCHMARK_TIMEOUT", "600"))))
    result = "failed"
    exit_code = 124
    metrics: dict[str, Any] | None = None
    try:
        completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=False)
        exit_code = completed.returncode
        (output_dir / "stdout.log").write_text(completed.stdout[-500_000:], encoding="utf-8")
        (output_dir / "stderr.log").write_text(completed.stderr[-500_000:], encoding="utf-8")
        report_path = output_dir / "indicator-benchmark.json"
        if exit_code == 0 and report_path.is_file():
            try:
                metrics = read_json(report_path)
            except ResearchError:
                exit_code = 65
            else:
                if metrics.get("profile") == profile_id and metrics.get("strategy") == plan["strategy"]:
                    result = "success"
                else:
                    exit_code = 65
        elif exit_code == 0:
            exit_code = 65
    except subprocess.TimeoutExpired as exc:
        (output_dir / "stdout.log").write_text((exc.stdout or "")[-500_000:], encoding="utf-8")
        (output_dir / "stderr.log").write_text((exc.stderr or "")[-500_000:], encoding="utf-8")
        result = "timeout"

    record = {
        **plan,
        "experiment_id": experiment_id,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "result": result,
        "exit_code": exit_code,
        "output": relative_output,
        "metrics": metrics,
    }
    (output_dir / "metadata.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    append_registry(record)
    if result != "success":
        raise ResearchError(f"Benchmark {experiment_id} terminé avec l'état {result}")
    return record


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Atelier de recherche Freqtrade éphémère")
    commands = root.add_subparsers(dest="command", required=True)
    plan_parser = commands.add_parser("plan")
    plan_parser.add_argument("profile")
    plan_parser.add_argument("--timerange", required=True)
    run_parser = commands.add_parser("run")
    run_parser.add_argument("profile")
    run_parser.add_argument("--timerange", required=True)
    run_parser.add_argument("--confirm", required=True)
    benchmark_parser = commands.add_parser("benchmark")
    benchmark_parser.add_argument("profile")
    benchmark_parser.add_argument("--rows", type=int, default=10_000)
    benchmark_parser.add_argument("--repeats", type=int, default=5)
    benchmark_parser.add_argument("--confirm", required=True)
    return root


def main(argv: list[str] | None = None) -> int:
    try:
        args = parser().parse_args(argv)
        if args.command == "plan":
            result = experiment_plan(args.profile, args.timerange)
        elif args.command == "run":
            with research_lock():
                result = run_experiment(args.profile, args.timerange, args.confirm)
        else:
            with research_lock():
                result = run_benchmark(args.profile, args.rows, args.repeats, args.confirm)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ResearchError as exc:
        print(f"researchctl: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
