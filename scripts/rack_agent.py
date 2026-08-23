#!/usr/bin/env python3
"""Tiny internal HTTP wrapper around rackctl, for the console's profile picker.

Why this exists: the console (Next.js, exposed to the internet) and rackctl
(the tool that can rewrite user_data/config.json and reload the live engine)
were deliberately kept in separate containers with no shared write access —
see ARCHITECTURE.md. Letting the console UI activate a Quant Rack profile
means *something* has to bridge that gap. The two cheap ways to do it would
have been mounting the Docker socket into the console (full host takeover
if the console is ever compromised) or mounting scripts/ + a writable
user_data into the console itself (undoes the privilege separation the
2026-08-22 audit specifically hardened). This agent is the alternative:
a small always-on service, reachable only on the private quant-network
(never published to the host), holding its own bearer token that only the
console knows, doing nothing but re-exporting three rackctl operations
(list profiles, read state, deploy). It calls straight into rackctl's own
functions -- no shelling out, no re-implemented safety logic -- so every
guarantee deploy() already has (dry-run-only, refuses with open trades,
backup + reload_config + health-verify + automatic rollback, audit log,
single-flight file lock) applies unchanged here.

Trade-off to keep in view: this makes the blast radius of a compromised
console bigger than it is today -- an attacker who steals the console's
session could now also flip the active strategy/timeframe (still gated to
dry-run, still refused while trades are open, still fully audited). It does
NOT expose exchange withdrawal, real-money trading, or config fields beyond
what a rack profile already covers. Treat QUANT_RACK_AGENT_TOKEN with the
same care as the other secrets in this repo.
"""

from __future__ import annotations

import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import rackctl

HOST = os.environ.get("QUANT_RACK_AGENT_HOST", "0.0.0.0")
PORT = int(os.environ.get("QUANT_RACK_AGENT_PORT", "9191"))
TOKEN = os.environ.get("QUANT_RACK_AGENT_TOKEN", "")
MAX_BODY_BYTES = 4096


def authorized(handler: BaseHTTPRequestHandler) -> bool:
    if not TOKEN:
        return False
    header = handler.headers.get("Authorization", "")
    prefix = "Bearer "
    if not header.startswith(prefix):
        return False
    return hmac.compare_digest(header[len(prefix):], TOKEN)


class Handler(BaseHTTPRequestHandler):
    server_version = "quant-rack-agent/1"

    def log_message(self, format_: str, *args: object) -> None:  # noqa: A002 - stdlib signature
        sys.stderr.write(f"{self.address_string()} - {format_ % args}\n")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            return {}
        if length <= 0 or length > MAX_BODY_BYTES:
            return {}
        raw = self.rfile.read(length)
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return value if isinstance(value, dict) else {}

    def do_GET(self) -> None:  # noqa: N802 - stdlib method name
        if not authorized(self):
            return self._send_json(401, {"error": "unauthorized"})

        if self.path == "/profiles":
            try:
                profiles = rackctl.load_profiles()
            except rackctl.RackError as exc:
                return self._send_json(503, {"error": str(exc)})
            return self._send_json(200, {
                "profiles": [
                    {
                        "id": profile["id"],
                        "label": profile["label"],
                        "strategy": profile["strategy"],
                        "timeframe": profile["timeframe"],
                    }
                    for profile in profiles.values()
                ],
            })

        if self.path == "/status":
            try:
                state = rackctl.read_json(rackctl.STATE_PATH) if rackctl.STATE_PATH.exists() else {"status": "not_configured"}
            except rackctl.RackError as exc:
                return self._send_json(503, {"error": str(exc)})
            return self._send_json(200, state)

        return self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802 - stdlib method name
        if not authorized(self):
            return self._send_json(401, {"error": "unauthorized"})
        if self.path != "/activate":
            return self._send_json(404, {"error": "not_found"})

        body = self._read_json_body()
        profile_id = body.get("profile_id")
        if not isinstance(profile_id, str) or not profile_id or len(profile_id) > 64:
            return self._send_json(400, {"error": "profile_id invalide"})

        try:
            profiles = rackctl.load_profiles()
        except rackctl.RackError as exc:
            return self._send_json(503, {"error": str(exc)})

        profile = profiles.get(profile_id)
        if profile is None:
            return self._send_json(404, {"error": "Profil inconnu"})

        try:
            with rackctl.deployment_lock():
                state = rackctl.deploy(profile, "DRY-RUN")
        except rackctl.RackError as exc:
            # Every RackError here is an expected, already-audited business
            # rejection (live mode, open trades, concurrent deploy, rollback
            # after a failed health check) -- 409 Conflict, not a 5xx.
            return self._send_json(409, {"error": str(exc)})
        except Exception:  # pragma: no cover - defensive: never leak internals
            return self._send_json(500, {"error": "Activation refusée : erreur interne"})

        return self._send_json(200, state)


def main() -> int:
    if not TOKEN:
        print("rack_agent: QUANT_RACK_AGENT_TOKEN manquant, arrêt", file=sys.stderr)
        return 2
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"rack_agent: écoute sur {HOST}:{PORT}", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
