#!/usr/bin/env python3
"""Bootstrap the private Freqtrade override without printing secret values."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Mapping


def _authorized_users(raw: str) -> list[str]:
    try:
        values = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(values, list):
        return []
    result: list[str] = []
    for value in values:
        try:
            result.append(str(int(value)))
        except (TypeError, ValueError):
            continue
    return result


def bootstrap_payload(environment: Mapping[str, str]) -> dict[str, Any]:
    telegram_enabled = environment.get("QUANT_BOOTSTRAP_TELEGRAM_ENABLED", "false").casefold() in {
        "1", "true", "yes", "on",
    }
    return {
        "exchange": {
            "key": environment.get("QUANT_BOOTSTRAP_EXCHANGE_KEY", ""),
            "secret": environment.get("QUANT_BOOTSTRAP_EXCHANGE_SECRET", ""),
            "password": environment.get("QUANT_BOOTSTRAP_EXCHANGE_PASSWORD", ""),
            "uid": environment.get("QUANT_BOOTSTRAP_EXCHANGE_UID", ""),
        },
        "telegram": {
            "enabled": telegram_enabled,
            "token": environment.get("QUANT_BOOTSTRAP_TELEGRAM_TOKEN", ""),
            "chat_id": environment.get("QUANT_BOOTSTRAP_TELEGRAM_CHAT_ID", ""),
            "authorized_users": _authorized_users(
                environment.get("QUANT_BOOTSTRAP_TELEGRAM_AUTHORIZED_USERS", "[]")
            ),
        },
    }


def bootstrap(path: Path, environment: Mapping[str, str]) -> bool:
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = bootstrap_payload(environment)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".runtime-secrets-", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Initialiser la configuration privée")
    parser.add_argument("path", type=Path)
    args = parser.parse_args(argv)
    created = bootstrap(args.path, os.environ)
    print("runtime secrets: initialized" if created else "runtime secrets: preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
