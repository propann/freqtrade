#!/usr/bin/env python3
"""Validate a Coolify/Freqtrade deployment without exposing secret values."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("QUANT_RACK_ROOT", Path(__file__).resolve().parent.parent))
SECRET_FIELDS = {
    "FREQTRADE_PASSWORD",
    "FREQTRADE_API_JWT_SECRET",
    "FREQTRADE_WS_TOKEN",
    "EXCHANGE_API_KEY",
    "EXCHANGE_API_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "FREQTRADE_ADMIN_PASSWORD",
    "FREQTRADE_JWT_SECRET",
}
REQUIRED_FIELDS = {
    "FREQTRADE_USERNAME": 3,
    "FREQTRADE_PASSWORD": 16,
    "FREQTRADE_API_JWT_SECRET": 32,
    "FREQTRADE_WS_TOKEN": 24,
    "FREQTRADE_ADMIN_USER": 3,
    "FREQTRADE_ADMIN_PASSWORD": 16,
    "FREQTRADE_JWT_SECRET": 32,
}
PLACEHOLDERS = ("change-me", "changeme", "replace-me", "example", "your-")


class PreflightError(RuntimeError):
    pass


def parse_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise PreflightError(f"Fichier d'environnement absent : {path}")
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def read_config(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise PreflightError(f"Configuration Freqtrade inutilisable : {path}") from exc
    if not isinstance(value, dict):
        raise PreflightError(f"Objet JSON attendu : {path}")
    return value


def enabled(value: str) -> bool:
    return value.strip().casefold() in ("1", "true", "yes", "on")


def weak(value: str, minimum: int) -> bool:
    lowered = value.casefold()
    return len(value) < minimum or any(marker in lowered for marker in PLACEHOLDERS)


class Report:
    def __init__(self):
        self.checks: list[dict[str, str]] = []

    def add(self, check_id: str, status: str, message: str) -> None:
        self.checks.append({"id": check_id, "status": status, "message": message})

    def ok(self, check_id: str, message: str) -> None:
        self.add(check_id, "pass", message)

    def warn(self, check_id: str, message: str) -> None:
        self.add(check_id, "warning", message)

    def fail(self, check_id: str, message: str) -> None:
        self.add(check_id, "fail", message)

    def payload(self) -> dict[str, Any]:
        failures = sum(item["status"] == "fail" for item in self.checks)
        warnings = sum(item["status"] == "warning" for item in self.checks)
        return {
            "status": "fail" if failures else "pass",
            "failures": failures,
            "warnings": warnings,
            "checks": self.checks,
        }


def tracked_files() -> list[Path]:
    try:
        result = subprocess.run(
            ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True, timeout=5
        )
    except (OSError, subprocess.SubprocessError):
        return []
    return [ROOT / name.decode("utf-8", errors="surrogateescape") for name in result.stdout.split(b"\0") if name]


def scan_tracked_secrets(values: dict[str, str]) -> dict[str, list[str]]:
    candidates = {
        key: value.encode()
        for key, value in values.items()
        if key in SECRET_FIELDS and len(value) >= 8 and not weak(value, 1)
    }
    found: dict[str, list[str]] = {}
    for path in tracked_files():
        try:
            content = path.read_bytes()
        except OSError:
            continue
        for key, secret in candidates.items():
            if secret in content:
                found.setdefault(key, []).append(str(path.relative_to(ROOT)))
    return found


def run_checks(
    env_path: Path,
    config_path: Path,
    require_telegram: bool,
    require_exchange: bool,
    process_env: bool = False,
    runtime_secrets_path: Path | None = None,
) -> dict[str, Any]:
    values = dict(os.environ) if process_env else parse_env(env_path)
    config = read_config(config_path)
    if runtime_secrets_path and runtime_secrets_path.exists():
        runtime = read_config(runtime_secrets_path)
        runtime_exchange = runtime.get("exchange") if isinstance(runtime.get("exchange"), dict) else {}
        runtime_telegram = runtime.get("telegram") if isinstance(runtime.get("telegram"), dict) else {}
        values.update({
            "EXCHANGE_API_KEY": str(runtime_exchange.get("key") or values.get("EXCHANGE_API_KEY", "")),
            "EXCHANGE_API_SECRET": str(runtime_exchange.get("secret") or values.get("EXCHANGE_API_SECRET", "")),
            "TELEGRAM_ENABLED": str(runtime_telegram.get("enabled", values.get("TELEGRAM_ENABLED", "false"))),
            "TELEGRAM_BOT_TOKEN": str(runtime_telegram.get("token") or values.get("TELEGRAM_BOT_TOKEN", "")),
            "TELEGRAM_CHAT_ID": str(runtime_telegram.get("chat_id") or values.get("TELEGRAM_CHAT_ID", "")),
        })
        if "authorized_users" in runtime_telegram:
            values["TELEGRAM_AUTHORIZED_USERS"] = json.dumps(runtime_telegram["authorized_users"])
    report = Report()

    if process_env:
        report.ok("env_permissions", "Secrets reçus depuis l'environnement du conteneur Coolify")
    else:
        permissions = stat.S_IMODE(env_path.stat().st_mode)
        if permissions & 0o077:
            report.fail("env_permissions", "Le fichier .env doit être limité au propriétaire : chmod 600 .env")
        else:
            report.ok("env_permissions", "Permissions du fichier d'environnement restrictives")

    missing_or_weak = [key for key, minimum in REQUIRED_FIELDS.items() if weak(values.get(key, ""), minimum)]
    if missing_or_weak:
        report.fail("required_secrets", f"Variables absentes, factices ou trop faibles : {', '.join(sorted(missing_or_weak))}")
    else:
        report.ok("required_secrets", "Identifiants internes présents et suffisamment longs")
    telegram_on = enabled(values.get("TELEGRAM_ENABLED", "false"))
    telegram_token = values.get("TELEGRAM_BOT_TOKEN", "")
    telegram_chat = values.get("TELEGRAM_CHAT_ID", "")
    if require_telegram and not telegram_on:
        report.fail("telegram", "Telegram doit être activé pour ce préflight")
    elif telegram_on:
        valid_token = bool(re.fullmatch(r"\d{5,}:[A-Za-z0-9_-]{20,}", telegram_token))
        valid_chat = bool(re.fullmatch(r"-?\d+", telegram_chat))
        if not valid_token or not valid_chat:
            report.fail("telegram", "Configuration Telegram incomplète ou format invalide")
        else:
            report.ok("telegram", "Configuration Telegram présente ; aucune valeur affichée")
        try:
            authorized = json.loads(values.get("TELEGRAM_AUTHORIZED_USERS", "[]"))
        except json.JSONDecodeError:
            authorized = None
        if not isinstance(authorized, list):
            report.fail("telegram_authorized_users", "TELEGRAM_AUTHORIZED_USERS doit être une liste JSON")
        elif not authorized:
            report.warn("telegram_authorized_users", "Aucun utilisateur Telegram explicitement autorisé")
        else:
            report.ok("telegram_authorized_users", "Liste d'utilisateurs Telegram configurée")
    else:
        report.warn("telegram", "Telegram désactivé")

    exchange_key = values.get("EXCHANGE_API_KEY", "")
    exchange_secret = values.get("EXCHANGE_API_SECRET", "")
    if bool(exchange_key) != bool(exchange_secret):
        report.fail("exchange_keys", "La clé et le secret exchange doivent être fournis ensemble")
    elif exchange_key and exchange_secret:
        if weak(exchange_key, 8) or weak(exchange_secret, 8):
            report.fail("exchange_keys", "Clés exchange présentes mais factices ou trop faibles")
        else:
            report.ok("exchange_keys", "Paire de clés exchange présente sans être affichée")
            report.warn("exchange_permissions", "Confirmer côté exchange : trading autorisé, retraits interdits, IP filtrée si possible")
    elif require_exchange:
        report.fail("exchange_keys", "Clés exchange requises mais absentes")
    else:
        report.warn("exchange_keys", "Clés exchange absentes ; acceptable uniquement pour le dry-run public")

    exchange_config = config.get("exchange") if isinstance(config.get("exchange"), dict) else {}
    telegram_config = config.get("telegram") if isinstance(config.get("telegram"), dict) else {}
    embedded = []
    if exchange_config.get("key") or exchange_config.get("secret"):
        embedded.append("exchange")
    if telegram_config.get("token") or telegram_config.get("chat_id"):
        embedded.append("telegram")
    if embedded:
        report.fail("config_secrets", f"Secrets présents dans config.json : {', '.join(embedded)}")
    else:
        report.ok("config_secrets", "Aucun secret durable dans config.json")

    if config.get("dry_run") is not True:
        report.fail("dry_run", "Le préflight de validation interdit le mode réel")
    else:
        report.ok("dry_run", "Dry-run explicitement activé")
    if config.get("force_entry_enable") is True:
        report.fail("force_entry", "Les entrées forcées doivent rester désactivées")
    else:
        report.ok("force_entry", "Entrées forcées désactivées")

    api_config = config.get("api_server") if isinstance(config.get("api_server"), dict) else {}
    if api_config.get("CORS_origins"):
        report.fail("cors", "Les origines CORS doivent rester vides")
    else:
        report.ok("cors", "Aucune origine CORS exposée")

    tracked = tracked_files()
    if any(path.name == env_path.name and path.resolve() == env_path.resolve() for path in tracked):
        report.fail("env_git", "Le fichier d'environnement est suivi par Git")
    else:
        report.ok("env_git", "Le fichier d'environnement n'est pas suivi par Git")
    leaks = scan_tracked_secrets(values)
    if leaks:
        details = ", ".join(f"{key} ({len(paths)} fichier(s))" for key, paths in sorted(leaks.items()))
        report.fail("tracked_secret_scan", f"Valeurs secrètes retrouvées dans Git : {details}")
    elif tracked:
        report.ok("tracked_secret_scan", "Aucune valeur secrète retrouvée dans les fichiers suivis")
    else:
        report.warn("tracked_secret_scan", "Dépôt Git indisponible ; scan des fichiers suivis non exécuté")

    return report.payload()


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Préflight Coolify/Freqtrade sans exposition de secret")
    command.add_argument("--env-file", type=Path, default=ROOT / ".env")
    command.add_argument("--config", type=Path, default=ROOT / "user_data" / "config.json")
    command.add_argument("--runtime-secrets", type=Path, default=ROOT / "user_data" / "private" / "runtime-secrets.json")
    command.add_argument("--require-telegram", action="store_true")
    command.add_argument("--require-exchange", action="store_true")
    command.add_argument("--process-env", action="store_true", help="Contrôler les variables injectées par Coolify")
    return command


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = run_checks(
            args.env_file, args.config, args.require_telegram, args.require_exchange, args.process_env,
            args.runtime_secrets,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] == "pass" else 2
    except PreflightError as exc:
        print(json.dumps({"status": "fail", "failures": 1, "warnings": 0, "checks": [
            {"id": "input", "status": "fail", "message": str(exc)}
        ]}, ensure_ascii=False, indent=2))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
