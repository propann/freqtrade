#!/usr/bin/env python3
"""Create a safe, static inventory of every quarantined strategy source.

The script never imports third-party Python.  It separates runnable-looking
strategy candidates from Freqtrade core, tests, templates and research
frameworks, so only the candidate set enters the compatibility queue.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from inventory_strategies import scan


EXCLUDED_PATH_PARTS = {".git", ".venv", "__pycache__", "tests", "test", "templates", "template", "docs", "examples", "example"}


def disposition(source: str, record: dict[str, Any]) -> tuple[str, str]:
    path = record.get("path", "")
    parts = {part.lower() for part in Path(path).parts}
    if record.get("status") != "inventory_only":
        return "excluded", "Unreadable or syntactically invalid source file."
    if parts & EXCLUDED_PATH_PARTS:
        return "excluded", "Test, template, example or documentation fixture."
    # baoyuy-f-d-cn is a full Freqtrade fork: only its user strategy folder is
    # a strategy source; everything under freqtrade/ is engine code.
    if source == "baoyuy-f-d-cn" and not path.startswith("user_data/strategies/"):
        return "excluded", "Forked engine code, not a user strategy."
    if source == "nanshan1002-quant-strategies":
        return "reference_only", "Quant research framework, not a drop-in Freqtrade strategy set."
    if "freqai" in path.lower() or source == "freqtrade-strategy-lab":
        return "separate_runtime", "FreqAI/model runtime requires a separate reproducible environment."
    if not {"populate_indicators", "populate_entry_trend"}.issubset(set(record.get("methods", []))):
        return "excluded", "Does not implement the current entry/indicator strategy surface."
    return "compatibility_queue", "Static candidate; import and audit required."


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    all_sources: list[dict[str, Any]] = []
    totals: dict[str, int] = {}
    for source_dir in sorted(path for path in args.sources.iterdir() if path.is_dir()):
        records = scan(source_dir)
        classified: list[dict[str, Any]] = []
        for record in records:
            status, reason = disposition(source_dir.name, record)
            classified.append({**record, "disposition": status, "reason": reason})
            totals[status] = totals.get(status, 0) + 1
        all_sources.append({"source": source_dir.name, "records": classified})
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "method": "AST-only static discovery; no third-party module is imported.",
        "totals": totals,
        "sources": all_sources,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
