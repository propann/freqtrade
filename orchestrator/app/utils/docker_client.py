from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import AsyncGenerator, Iterable

from ..models import BotInstance


_DEFAULT_LINES = [
    "[orchestrator] Attente de logs du conteneur...",
    "[orchestrator] Streaming SSE actif (read-only).",
]

_REDACTIONS = [
    re.compile(r"(api_key|api_secret|secret|password)=\S+", re.IGNORECASE),
    re.compile(r"(api_key|api_secret|secret|password)\s*:\s*\S+", re.IGNORECASE),
]


def _redact_line(line: str) -> str:
    sanitized = line
    for pattern in _REDACTIONS:
        sanitized = pattern.sub(r"\1=***", sanitized)
    return sanitized


def _prepare_lines(lines: Iterable[str]) -> list[str]:
    return [_redact_line(line).strip() for line in lines if line.strip()]


async def stream_container_logs(bot: BotInstance) -> AsyncGenerator[str, None]:
    log_path = Path(bot.logs_path) if bot.logs_path else None
    if log_path and log_path.exists():
        existing = _prepare_lines(log_path.read_text().splitlines()[-200:])
    else:
        existing = _DEFAULT_LINES

    for line in existing:
        yield f"data: {line}\n\n"

    while True:
        await asyncio.sleep(2)
        yield ":\n\n"
