#!/usr/bin/env python3
"""Run one reproducible, resource-bounded Freqtrade research job at a time."""

from __future__ import annotations

import argparse
import csv
import fcntl
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
import zipfile
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
DATE_PATTERN = re.compile(r"^\d{8}$")


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
    try:
        for part in value.split("-"):
            datetime.strptime(part, "%Y%m%d")
    except ValueError as exc:
        raise ResearchError("Date calendaire invalide dans le timerange") from exc
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


def validation_plan(profile_id: str, timerange: str) -> dict[str, Any]:
    item = profile(profile_id)
    timerange = validate_timerange(timerange)
    strategy_path = ROOT / str(item["strategy_file"])
    return {
        "kind": "strategy_validation",
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
        "checks": ["strategy_discovery", "backtest", "lookahead", "recursive"],
    }


def oos_policy(item: dict[str, Any]) -> dict[str, float | int]:
    validation = item.get("validation", {})
    configured = validation.get("oos", {}) if isinstance(validation, dict) else {}
    if not isinstance(configured, dict):
        raise ResearchError("validation.oos doit être un objet")
    policy: dict[str, float | int] = {
        "min_trades": configured.get("min_trades", 20),
        "min_profit_factor": configured.get("min_profit_factor", 1.05),
        "max_drawdown_account": configured.get("max_drawdown_account", 0.20),
    }
    try:
        policy["min_trades"] = int(policy["min_trades"])
        policy["min_profit_factor"] = float(policy["min_profit_factor"])
        policy["max_drawdown_account"] = float(policy["max_drawdown_account"])
    except (TypeError, ValueError) as exc:
        raise ResearchError("Seuils validation.oos invalides") from exc
    if not 1 <= policy["min_trades"] <= 10_000:
        raise ResearchError("validation.oos.min_trades doit être compris entre 1 et 10000")
    if not 0 <= policy["min_profit_factor"] <= 10:
        raise ResearchError("validation.oos.min_profit_factor doit être compris entre 0 et 10")
    if not 0 < policy["max_drawdown_account"] <= 1:
        raise ResearchError("validation.oos.max_drawdown_account doit être compris entre 0 et 1")
    return policy


def oos_plan(profile_id: str, timerange: str, split_date: str, fee: float) -> dict[str, Any]:
    item = profile(profile_id)
    in_sample, out_of_sample = oos_ranges(timerange, split_date)
    if not 0 <= fee <= 0.01:
        raise ResearchError("--fee doit être compris entre 0 et 0.01")
    strategy_path = ROOT / str(item["strategy_file"])
    return {
        "kind": "out_of_sample_validation",
        "profile": profile_id,
        "strategy": item["strategy"],
        "strategy_sha256": sha256(strategy_path),
        "config_sha256": sha256(CONFIG_PATH) if CONFIG_PATH.is_file() else "missing",
        "git_commit": git_revision(),
        "timeframe": item["timeframe"],
        "timerange": validate_timerange(timerange),
        "split_date": split_date,
        "in_sample_timerange": in_sample,
        "out_of_sample_timerange": out_of_sample,
        "fee_per_side": fee,
        "policy": oos_policy(item),
        "budget": item["budget"],
        "runner": "docker-compose/strategy-lab",
        "parallel_jobs": 1,
    }


def bounded_timeout(variable: str, default: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(variable, str(default)))
    except ValueError as exc:
        raise ResearchError(f"{variable} doit être un nombre entier") from exc
    return max(60, min(maximum, value))


def tail_text(value: str | bytes | None) -> str:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    return (value or "")[-500_000:]


def lookahead_has_bias(path: Path) -> bool:
    try:
        with path.open(newline="", encoding="utf-8-sig") as handle:
            rows = list(csv.DictReader(handle))
    except (OSError, csv.Error) as exc:
        raise ResearchError(f"Rapport lookahead inutilisable : {path}") from exc
    headers = {str(key).strip().casefold() for key in rows[0]} if rows else set()
    if not rows or "has_bias" not in headers:
        raise ResearchError(f"Rapport lookahead vide ou incomplet : {path}")
    for row in rows:
        normalized = {str(key).strip().casefold(): str(value).strip().casefold() for key, value in row.items()}
        if normalized.get("has_bias") in {"yes", "true", "1"}:
            return True
    return False


def backtest_report(directory: Path, strategy: str) -> tuple[Path, dict[str, Any]]:
    candidates: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(directory.glob("*.json")):
        try:
            payload = read_json(path)
        except ResearchError:
            continue
        if isinstance(payload.get("strategy"), dict) and strategy in payload["strategy"]:
            candidates.append((path, payload))
    for path in sorted(directory.glob("*.zip")):
        try:
            with zipfile.ZipFile(path) as archive:
                for member in archive.infolist():
                    if not member.filename.endswith(".json") or member.file_size > 50_000_000:
                        continue
                    payload = json.loads(archive.read(member).decode("utf-8"))
                    if (
                        isinstance(payload, dict)
                        and isinstance(payload.get("strategy"), dict)
                        and strategy in payload["strategy"]
                    ):
                        candidates.append((path, payload))
                        break
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, zipfile.BadZipFile):
            continue
    if len(candidates) != 1:
        raise ResearchError(
            f"Un rapport Freqtrade unique était attendu dans {directory}, trouvé : {len(candidates)}"
        )
    return candidates[0]


def backtest_metrics(report: dict[str, Any], strategy: str) -> dict[str, float | int]:
    strategy_data = report.get("strategy", {}).get(strategy)
    if not isinstance(strategy_data, dict):
        raise ResearchError(f"Stratégie absente du rapport de backtest : {strategy}")
    fields = {
        "total_trades": int,
        "wins": int,
        "losses": int,
        "profit_total": float,
        "profit_factor": float,
        "expectancy": float,
        "max_drawdown_account": float,
    }
    metrics: dict[str, float | int] = {}
    try:
        for field, converter in fields.items():
            metrics[field] = converter(strategy_data[field])
    except (KeyError, TypeError, ValueError) as exc:
        raise ResearchError("Métriques Freqtrade incomplètes ou invalides") from exc
    if any(isinstance(value, float) and not math.isfinite(value) for value in metrics.values()):
        raise ResearchError("Métriques Freqtrade non finies")
    return metrics


def oos_ranges(timerange: str, split_date: str) -> tuple[str, str]:
    timerange = validate_timerange(timerange)
    if "-" not in timerange or not DATE_PATTERN.fullmatch(split_date):
        raise ResearchError("OOS exige une période fermée et --split-date au format YYYYMMDD")
    start, end = timerange.split("-", 1)
    if not start < split_date < end:
        raise ResearchError("--split-date doit être strictement à l'intérieur du timerange")
    try:
        start_date = datetime.strptime(start, "%Y%m%d")
        split = datetime.strptime(split_date, "%Y%m%d")
        end_date = datetime.strptime(end, "%Y%m%d")
    except ValueError as exc:
        raise ResearchError("Dates OOS calendaires invalides") from exc
    if (split - start_date).days < 30 or (end_date - split).days < 30:
        raise ResearchError("Les périodes in-sample et out-of-sample doivent durer au moins 30 jours")
    return f"{start}-{split_date}", f"{split_date}-{end}"


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
    relative_output = f"research/{experiment_id}/backtest-results"
    backtest_dir = output_dir / "backtest-results"
    backtest_dir.mkdir()
    command = [
        "docker", "compose", "--env-file", str(ENV_FILE), "-f", str(COMPOSE_FILE),
        "run", "--rm", "--no-deps", "strategy-lab", "backtesting",
        "--config", "/freqtrade/user_data/config.json",
        "--strategy", str(plan["strategy"]),
        "--timeframe", str(plan["timeframe"]),
        "--timerange", str(plan["timerange"]),
        "--export", "trades",
        "--backtest-directory", f"/freqtrade/user_data/{relative_output}",
        "--cache", "none",
    ]
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    timeout = max(60, min(14_400, int(os.environ.get("QUANT_RESEARCH_TIMEOUT", "3600"))))
    result = "failed"
    exit_code = 124
    try:
        completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=False)
        exit_code = completed.returncode
        (output_dir / "stdout.log").write_text(tail_text(completed.stdout), encoding="utf-8")
        (output_dir / "stderr.log").write_text(tail_text(completed.stderr), encoding="utf-8")
        result = "success" if exit_code == 0 else "failed"
        if result == "success":
            try:
                artifact_path, report = backtest_report(backtest_dir, str(plan["strategy"]))
                metrics = backtest_metrics(report, str(plan["strategy"]))
            except ResearchError as exc:
                result = "failed"
                exit_code = 65
                with (output_dir / "stderr.log").open("a", encoding="utf-8") as handle:
                    handle.write(f"\n{exc}\n")
    except subprocess.TimeoutExpired as exc:
        (output_dir / "stdout.log").write_text(tail_text(exc.stdout), encoding="utf-8")
        (output_dir / "stderr.log").write_text(tail_text(exc.stderr), encoding="utf-8")
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
        "artifact": (
            str(artifact_path.relative_to(ROOT / "user_data"))
            if result == "success" else None
        ),
        "metrics": metrics if result == "success" else None,
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


def run_validation(profile_id: str, timerange: str, confirmation: str) -> dict[str, Any]:
    if confirmation != "VALIDATE":
        raise ResearchError("Confirmation requise : --confirm VALIDATE")
    if not CONFIG_PATH.is_file():
        raise ResearchError(f"Configuration Freqtrade absente : {CONFIG_PATH}")
    if not COMPOSE_FILE.is_file() or not ENV_FILE.is_file():
        raise ResearchError("Fichier Compose ou .env absent")

    plan = validation_plan(profile_id, timerange)
    experiment_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{profile_id}-validation"
    output_dir = RESEARCH_DIR / experiment_id
    output_dir.mkdir(parents=True, exist_ok=False)
    lookahead_relative = f"research/{experiment_id}/lookahead.csv"
    common = [
        "--config", "/freqtrade/user_data/config.json",
        "--strategy", str(plan["strategy"]),
        "--strategy-path", "/freqtrade/user_data/strategies",
        "--timeframe", str(plan["timeframe"]),
        "--timerange", str(plan["timerange"]),
    ]
    checks = [
        ("strategy_discovery", [
            "list-strategies", "--config", "/freqtrade/user_data/config.json",
            "--strategy-path", "/freqtrade/user_data/strategies",
        ]),
        ("backtest", [
            "backtesting", *common, "--enable-protections", "--cache", "none",
            "--export", "none", "--breakdown", "month", "year",
        ]),
        ("lookahead", [
            "lookahead-analysis", *common,
            "--lookahead-analysis-exportfilename", f"/freqtrade/user_data/{lookahead_relative}",
        ]),
        ("recursive", ["recursive-analysis", *common]),
    ]
    docker_prefix = [
        "docker", "compose", "--env-file", str(ENV_FILE), "-f", str(COMPOSE_FILE),
        "run", "--rm", "--no-deps", "strategy-lab",
    ]
    timeout = bounded_timeout("QUANT_VALIDATION_TIMEOUT", 3600, 14_400)
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    results: list[dict[str, Any]] = []
    failed = False

    for name, arguments in checks:
        if failed:
            results.append({"name": name, "result": "skipped", "exit_code": None, "elapsed_seconds": 0})
            continue
        step_started = time.monotonic()
        stdout_path = output_dir / f"{name}.stdout.log"
        stderr_path = output_dir / f"{name}.stderr.log"
        try:
            completed = subprocess.run(
                [*docker_prefix, *arguments], cwd=ROOT, text=True, capture_output=True,
                timeout=timeout, check=False,
            )
            exit_code = completed.returncode
            stdout_path.write_text(tail_text(completed.stdout), encoding="utf-8")
            stderr_path.write_text(tail_text(completed.stderr), encoding="utf-8")
            step_result = "completed" if exit_code == 0 else "failed"
        except subprocess.TimeoutExpired as exc:
            exit_code = 124
            stdout_path.write_text(tail_text(exc.stdout), encoding="utf-8")
            stderr_path.write_text(tail_text(exc.stderr), encoding="utf-8")
            step_result = "timeout"

        if name == "lookahead" and step_result == "completed":
            try:
                biased = lookahead_has_bias(output_dir / "lookahead.csv")
            except ResearchError as exc:
                with stderr_path.open("a", encoding="utf-8") as handle:
                    handle.write(f"\n{exc}\n")
                step_result = "failed"
                exit_code = 65
            else:
                step_result = "bias_detected" if biased else "no_bias_detected"
                if biased:
                    exit_code = 66

        if name == "recursive" and step_result == "completed":
            step_result = "review_required"
        failed = step_result in {"failed", "timeout", "bias_detected"}
        results.append({
            "name": name,
            "result": step_result,
            "exit_code": exit_code,
            "elapsed_seconds": round(time.monotonic() - step_started, 3),
            "stdout": f"research/{experiment_id}/{name}.stdout.log",
            "stderr": f"research/{experiment_id}/{name}.stderr.log",
        })

    result = "failed" if failed else "review_required"
    record = {
        **plan,
        "experiment_id": experiment_id,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "result": result,
        "validation_checks": results,
        "lookahead_report": lookahead_relative,
        "review_note": "Examiner recursive.stdout.log avant toute promotion de stratégie.",
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    append_registry(record)
    if failed:
        raise ResearchError(f"Validation {experiment_id} terminée avec l'état failed")
    return record


def run_oos(
    profile_id: str, timerange: str, split_date: str, fee: float, confirmation: str
) -> dict[str, Any]:
    if confirmation != "OOS":
        raise ResearchError("Confirmation requise : --confirm OOS")
    if not CONFIG_PATH.is_file():
        raise ResearchError(f"Configuration Freqtrade absente : {CONFIG_PATH}")
    if not COMPOSE_FILE.is_file() or not ENV_FILE.is_file():
        raise ResearchError("Fichier Compose ou .env absent")

    plan = oos_plan(profile_id, timerange, split_date, fee)
    experiment_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{profile_id}-oos"
    output_dir = RESEARCH_DIR / experiment_id
    output_dir.mkdir(parents=True, exist_ok=False)
    docker_prefix = [
        "docker", "compose", "--env-file", str(ENV_FILE), "-f", str(COMPOSE_FILE),
        "run", "--rm", "--no-deps", "strategy-lab", "backtesting",
    ]
    common = [
        "--config", "/freqtrade/user_data/config.json",
        "--strategy", str(plan["strategy"]),
        "--strategy-path", "/freqtrade/user_data/strategies",
        "--timeframe", str(plan["timeframe"]),
        "--enable-protections", "--cache", "none", "--export", "trades",
        "--fee", str(plan["fee_per_side"]),
    ]
    phases = [
        ("in_sample", str(plan["in_sample_timerange"])),
        ("out_of_sample", str(plan["out_of_sample_timerange"])),
    ]
    timeout = bounded_timeout("QUANT_OOS_TIMEOUT", 3600, 14_400)
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    phase_results: list[dict[str, Any]] = []
    phase_metrics: dict[str, dict[str, float | int]] = {}
    failed = False

    for name, phase_timerange in phases:
        if failed:
            phase_results.append({"name": name, "result": "skipped", "exit_code": None})
            continue
        phase_started = time.monotonic()
        phase_dir = output_dir / name
        phase_dir.mkdir()
        relative_dir = f"research/{experiment_id}/{name}"
        stdout_path = output_dir / f"{name}.stdout.log"
        stderr_path = output_dir / f"{name}.stderr.log"
        command = [
            *docker_prefix, *common, "--timerange", phase_timerange,
            "--backtest-directory", f"/freqtrade/user_data/{relative_dir}",
        ]
        artifact: str | None = None
        metrics: dict[str, float | int] | None = None
        try:
            completed = subprocess.run(
                command, cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=False
            )
            exit_code = completed.returncode
            stdout_path.write_text(tail_text(completed.stdout), encoding="utf-8")
            stderr_path.write_text(tail_text(completed.stderr), encoding="utf-8")
            step_result = "completed" if exit_code == 0 else "failed"
            if step_result == "completed":
                try:
                    artifact_path, report = backtest_report(phase_dir, str(plan["strategy"]))
                    metrics = backtest_metrics(report, str(plan["strategy"]))
                except ResearchError as exc:
                    with stderr_path.open("a", encoding="utf-8") as handle:
                        handle.write(f"\n{exc}\n")
                    step_result = "failed"
                    exit_code = 65
                else:
                    artifact = str(artifact_path.relative_to(ROOT / "user_data"))
                    phase_metrics[name] = metrics
        except subprocess.TimeoutExpired as exc:
            exit_code = 124
            stdout_path.write_text(tail_text(exc.stdout), encoding="utf-8")
            stderr_path.write_text(tail_text(exc.stderr), encoding="utf-8")
            step_result = "timeout"
        failed = step_result != "completed"
        phase_results.append({
            "name": name,
            "timerange": phase_timerange,
            "result": step_result,
            "exit_code": exit_code,
            "elapsed_seconds": round(time.monotonic() - phase_started, 3),
            "artifact": artifact,
            "metrics": metrics,
            "stdout": f"research/{experiment_id}/{name}.stdout.log",
            "stderr": f"research/{experiment_id}/{name}.stderr.log",
        })

    gate_checks: list[dict[str, Any]] = []
    result = "failed"
    if not failed:
        in_sample = phase_metrics["in_sample"]
        out_of_sample = phase_metrics["out_of_sample"]
        policy = plan["policy"]
        checks = [
            ("in_sample_profit_positive", in_sample["profit_total"] > 0, in_sample["profit_total"], 0),
            ("oos_min_trades", out_of_sample["total_trades"] >= policy["min_trades"], out_of_sample["total_trades"], policy["min_trades"]),
            ("oos_profit_positive", out_of_sample["profit_total"] > 0, out_of_sample["profit_total"], 0),
            (
                "oos_profit_factor",
                (
                    out_of_sample["profit_factor"] >= policy["min_profit_factor"]
                    or (out_of_sample["losses"] == 0 and out_of_sample["profit_total"] > 0)
                ),
                out_of_sample["profit_factor"],
                policy["min_profit_factor"],
            ),
            ("oos_expectancy_positive", out_of_sample["expectancy"] > 0, out_of_sample["expectancy"], 0),
            ("oos_max_drawdown", out_of_sample["max_drawdown_account"] <= policy["max_drawdown_account"], out_of_sample["max_drawdown_account"], policy["max_drawdown_account"]),
        ]
        gate_checks = [
            {"name": name, "passed": passed, "actual": actual, "threshold": threshold}
            for name, passed, actual, threshold in checks
        ]
        result = "passed" if all(check["passed"] for check in gate_checks) else "rejected"

    record = {
        **plan,
        "experiment_id": experiment_id,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "result": result,
        "phases": phase_results,
        "gate_checks": gate_checks,
        "review_note": (
            "Un passage OOS ne modélise pas le slippage réel et ne remplace pas un dry-run prolongé."
        ),
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    append_registry(record)
    if result != "passed":
        raise ResearchError(f"Validation OOS {experiment_id} terminée avec l'état {result}")
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
    validate_parser = commands.add_parser("validate")
    validate_parser.add_argument("profile")
    validate_parser.add_argument("--timerange", required=True)
    validate_parser.add_argument("--confirm", required=True)
    oos_parser = commands.add_parser("oos")
    oos_parser.add_argument("profile")
    oos_parser.add_argument("--timerange", required=True)
    oos_parser.add_argument("--split-date", required=True)
    oos_parser.add_argument("--fee", type=float, required=True)
    oos_parser.add_argument("--confirm", required=True)
    return root


def main(argv: list[str] | None = None) -> int:
    try:
        args = parser().parse_args(argv)
        if args.command == "plan":
            result = experiment_plan(args.profile, args.timerange)
        elif args.command == "run":
            with research_lock():
                result = run_experiment(args.profile, args.timerange, args.confirm)
        elif args.command == "benchmark":
            with research_lock():
                result = run_benchmark(args.profile, args.rows, args.repeats, args.confirm)
        elif args.command == "validate":
            with research_lock():
                result = run_validation(args.profile, args.timerange, args.confirm)
        else:
            with research_lock():
                result = run_oos(
                    args.profile, args.timerange, args.split_date, args.fee, args.confirm
                )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ResearchError as exc:
        print(f"researchctl: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
