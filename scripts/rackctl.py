#!/usr/bin/env python3
"""Small, dependency-free controller for Quant Rack profiles."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("QUANT_RACK_ROOT", Path(__file__).resolve().parent.parent))
PROFILES_DIR = Path(os.environ.get("QUANT_RACK_PROFILES", ROOT / "quant_rack" / "profiles"))
STATE_PATH = Path(os.environ.get("QUANT_RACK_STATE", ROOT / "user_data" / "rack" / "state.json"))
CONFIG_PATH = Path(os.environ.get("QUANT_RACK_CONFIG", ROOT / "user_data" / "config.json"))
TOOL_STATES = {"off", "on", "warm", "job"}


class RackError(RuntimeError):
    pass


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RackError(f"Fichier introuvable : {path}") from exc
    except json.JSONDecodeError as exc:
        raise RackError(f"JSON invalide dans {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise RackError(f"Objet JSON attendu dans {path}")
    return value


def atomic_json_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def validate_profile(profile: dict[str, Any], source: Path) -> dict[str, Any]:
    required = {"id", "label", "strategy", "strategy_file", "timeframe", "pair_limit", "budget", "indicators", "protections", "tools"}
    missing = sorted(required - profile.keys())
    if missing:
        raise RackError(f"Profil {source.name}: champs manquants {', '.join(missing)}")
    if not isinstance(profile["indicators"], list) or not profile["indicators"]:
        raise RackError(f"Profil {source.name}: indicators doit être une liste non vide")
    if not isinstance(profile["protections"], list):
        raise RackError(f"Profil {source.name}: protections doit être une liste")
    if not isinstance(profile["tools"], dict) or any(value not in TOOL_STATES for value in profile["tools"].values()):
        raise RackError(f"Profil {source.name}: état d'outil invalide")
    budget = profile["budget"]
    if not isinstance(budget, dict) or float(budget.get("cpu", 0)) <= 0 or int(budget.get("memory_mb", 0)) < 256:
        raise RackError(f"Profil {source.name}: budget CPU/RAM invalide")
    if int(profile["pair_limit"]) < 1 or int(profile["pair_limit"]) > 20:
        raise RackError(f"Profil {source.name}: pair_limit doit être compris entre 1 et 20")
    strategy_path = ROOT / str(profile["strategy_file"])
    if not strategy_path.is_file():
        raise RackError(f"Profil {source.name}: stratégie absente ({strategy_path})")
    return profile


def load_profiles() -> dict[str, dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}
    for path in sorted(PROFILES_DIR.glob("*.json")):
        profile = validate_profile(read_json(path), path)
        profile_id = str(profile["id"])
        if profile_id in profiles:
            raise RackError(f"Identifiant de profil dupliqué : {profile_id}")
        profiles[profile_id] = profile
    if not profiles:
        raise RackError(f"Aucun profil trouvé dans {PROFILES_DIR}")
    return profiles


def resolved_state(profile: dict[str, Any], applied: bool) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "profile_id": profile["id"],
        "label": profile["label"],
        "strategy": profile["strategy"],
        "timeframe": profile["timeframe"],
        "pair_limit": profile["pair_limit"],
        "budget": profile["budget"],
        "indicators": profile["indicators"],
        "protections": profile["protections"],
        "tools": profile["tools"],
        "config_applied": applied,
        "restart_required": applied,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def activate(profile: dict[str, Any], apply_config: bool) -> dict[str, Any]:
    if apply_config:
        config = read_json(CONFIG_PATH)
        whitelist = config.get("exchange", {}).get("pair_whitelist", [])
        if not isinstance(whitelist, list):
            raise RackError("exchange.pair_whitelist doit être une liste")
        if len(whitelist) > int(profile["pair_limit"]):
            raise RackError(
                f"Le profil autorise {profile['pair_limit']} paires, mais la configuration en contient {len(whitelist)}"
            )
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        backup = CONFIG_PATH.with_name(f"config.backup-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.json")
        shutil.copy2(CONFIG_PATH, backup)
        config["strategy"] = profile["strategy"]
        config["timeframe"] = profile["timeframe"]
        try:
            current_max_trades = int(config.get("max_open_trades", profile["pair_limit"]))
        except (TypeError, ValueError) as exc:
            raise RackError("max_open_trades doit être un entier") from exc
        profile_limit = int(profile["pair_limit"])
        config["max_open_trades"] = profile_limit if current_max_trades == -1 else min(current_max_trades, profile_limit)
        config["dry_run"] = True
        atomic_json_write(CONFIG_PATH, config)
    state = resolved_state(profile, apply_config)
    atomic_json_write(STATE_PATH, state)
    return state


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Contrôle léger du Quant Rack")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="Lister et valider les profils")
    sub.add_parser("status", help="Afficher l'état résolu")
    plan = sub.add_parser("plan", help="Afficher un profil sans rien modifier")
    plan.add_argument("profile")
    activate_parser = sub.add_parser("activate", help="Sélectionner un profil")
    activate_parser.add_argument("profile")
    activate_parser.add_argument("--apply-config", action="store_true", help="Sauvegarder puis modifier config.json; impose dry_run")
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)
        profiles = load_profiles()
        if args.command == "list":
            print_json([{"id": item["id"], "label": item["label"], "strategy": item["strategy"]} for item in profiles.values()])
        elif args.command == "status":
            print_json(read_json(STATE_PATH) if STATE_PATH.exists() else {"status": "not_configured"})
        elif args.command == "plan":
            if args.profile not in profiles:
                raise RackError(f"Profil inconnu : {args.profile}")
            print_json(resolved_state(profiles[args.profile], False))
        elif args.command == "activate":
            if args.profile not in profiles:
                raise RackError(f"Profil inconnu : {args.profile}")
            state = activate(profiles[args.profile], args.apply_config)
            print_json(state)
            if args.apply_config:
                print("Configuration sauvegardée et modifiée. Redémarrage explicite requis.", file=sys.stderr)
        return 0
    except RackError as exc:
        print(f"rackctl: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
