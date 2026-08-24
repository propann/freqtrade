#!/usr/bin/env python3
"""Statically inventory untrusted Freqtrade strategy files.

This scanner deliberately never imports strategy modules.  External repositories
can therefore be catalogued before they are mounted read-only in an isolated
research container for discovery/backtesting.
"""

from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
from typing import Any


def literal(node: ast.AST | None) -> Any:
    if node is None:
        return None
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError):
        return None


def class_record(path: Path, source_root: Path, node: ast.ClassDef) -> dict[str, Any]:
    assignments: dict[str, Any] = {}
    methods: set[str] = set()
    for child in node.body:
        if isinstance(child, (ast.Assign, ast.AnnAssign)):
            targets = child.targets if isinstance(child, ast.Assign) else [child.target]
            value = literal(child.value)
            for target in targets:
                if isinstance(target, ast.Name):
                    assignments[target.id] = value
        elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            methods.add(child.name)

    bases = [base.id if isinstance(base, ast.Name) else base.attr if isinstance(base, ast.Attribute) else "?" for base in node.bases]
    is_strategy = "IStrategy" in bases or {"populate_indicators", "populate_entry_trend"}.issubset(methods)
    return {
        "path": path.relative_to(source_root).as_posix(),
        "class_name": node.name,
        "is_strategy_candidate": is_strategy,
        "bases": bases,
        "timeframe": assignments.get("timeframe"),
        "interface_version": assignments.get("INTERFACE_VERSION"),
        "can_short": assignments.get("can_short", False),
        "methods": sorted(methods & {"populate_indicators", "populate_entry_trend", "populate_exit_trend", "populate_buy_trend", "populate_sell_trend", "custom_stoploss", "custom_exit"}),
    }


def scan(source_root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in sorted(source_root.rglob("*.py")):
        if any(part in {".git", ".venv", "__pycache__"} for part in path.parts):
            continue
        if not path.is_file():
            records.append({"path": path.relative_to(source_root).as_posix(), "status": "unreadable", "message": "not a regular file"})
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), filename=str(path))
        except OSError as error:
            records.append({"path": path.relative_to(source_root).as_posix(), "status": "unreadable", "message": str(error)})
            continue
        except SyntaxError as error:
            records.append({"path": path.relative_to(source_root).as_posix(), "status": "syntax_error", "message": f"{error.msg} (line {error.lineno})"})
            continue
        candidates = [class_record(path, source_root, node) for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
        for candidate in candidates:
            if candidate["is_strategy_candidate"]:
                candidate["status"] = "inventory_only"
                records.append(candidate)
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="strategy directory or quarantined repository")
    parser.add_argument("--output", type=Path, help="JSON destination; stdout when omitted")
    args = parser.parse_args()
    source = args.source.resolve()
    if not source.is_dir():
        parser.error(f"not a directory: {source}")
    payload = {"source": str(source), "strategies": scan(source)}
    rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
