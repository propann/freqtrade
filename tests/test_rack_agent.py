import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RACK_AGENT = REPOSITORY_ROOT / "scripts" / "rack_agent.py"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class RackAgentTests(unittest.TestCase):
    """Exercises scripts/rack_agent.py as a real subprocess over real HTTP,
    the same way test_rackctl.py exercises rackctl.py as a real subprocess
    over argv -- both rely on module-level env-var-derived constants that
    only get re-read on process start, so an in-process import/reload would
    not reflect per-test fixtures reliably.
    """

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "quant_rack" / "profiles").mkdir(parents=True)
        (self.root / "strategies").mkdir()
        (self.root / "strategies" / "TestStrategy.py").write_text("class TestStrategy: pass\n")
        profile = {
            "id": "test",
            "label": "Test Rack",
            "strategy": "TestStrategy",
            "strategy_file": "strategies/TestStrategy.py",
            "timeframe": "15m",
            "pair_limit": 3,
            "budget": {"cpu": 0.5, "memory_mb": 512, "max_parallel_jobs": 1},
            "indicators": ["rsi_14"],
            "protections": ["cooldown"],
            "tools": {"telegram": "on", "backtest": "job", "freqai": "off"},
        }
        (self.root / "quant_rack" / "profiles" / "test.json").write_text(json.dumps(profile))
        (self.root / "user_data").mkdir()
        (self.root / "user_data" / "config.json").write_text(json.dumps({
            "strategy": "Old",
            "dry_run": True,
            "max_open_trades": 8,
            "exchange": {"pair_whitelist": ["BTC/USDT", "ETH/USDT"]},
        }))

        root = self.root

        class FreqtradeHandler(BaseHTTPRequestHandler):
            dry_run = True
            open_trades = []
            reload_status = 200

            def log_message(self, *_args):
                pass

            def payload(self, status, value):
                body = json.dumps(value).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path == "/api/v1/status":
                    self.payload(200, type(self).open_trades)
                elif self.path == "/api/v1/show_config":
                    config = json.loads((root / "user_data" / "config.json").read_text())
                    self.payload(200, {
                        "dry_run": type(self).dry_run,
                        "strategy": config["strategy"],
                        "timeframe": config.get("timeframe", "5m"),
                    })
                elif self.path == "/api/v1/health":
                    self.payload(200, {"last_process_ts": 123456789})
                else:
                    self.payload(404, {"error": "not found"})

            def do_POST(self):
                if self.path != "/api/v1/reload_config":
                    self.payload(404, {"error": "not found"})
                    return
                self.payload(type(self).reload_status, {"status": "reloaded"})

        self.api_handler = FreqtradeHandler
        self.api = ThreadingHTTPServer(("127.0.0.1", 0), FreqtradeHandler)
        self.api_thread = threading.Thread(target=self.api.serve_forever, daemon=True)
        self.api_thread.start()

        self.token = "test-token-0123456789abcdef"
        self.agent_port = free_port()
        env = {
            **os.environ,
            "QUANT_RACK_ROOT": str(self.root),
            "FREQTRADE_API_URL": f"http://127.0.0.1:{self.api.server_port}",
            "FREQTRADE_USERNAME": "operator",
            "FREQTRADE_PASSWORD": "server-only-password",
            "QUANT_RACK_ACTOR": "test-console-ui",
            "QUANT_RACK_AGENT_TOKEN": self.token,
            "QUANT_RACK_AGENT_HOST": "127.0.0.1",
            "QUANT_RACK_AGENT_PORT": str(self.agent_port),
        }
        self.agent = subprocess.Popen(
            [sys.executable, str(RACK_AGENT)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._wait_for_agent()

    def _wait_for_agent(self):
        deadline = time.time() + 5
        last_error: Exception | None = None
        while time.time() < deadline:
            if self.agent.poll() is not None:
                out, err = self.agent.communicate(timeout=1)
                raise AssertionError(f"rack_agent exited early: {err or out}")
            try:
                status, _ = self.call("GET", "/profiles", token=self.token)
                if status:
                    return
            except OSError as exc:
                last_error = exc
            time.sleep(0.1)
        self.agent.terminate()
        raise AssertionError(f"rack_agent did not start in time: {last_error}")

    def tearDown(self):
        self.agent.terminate()
        try:
            self.agent.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.agent.kill()
        self.api.shutdown()
        self.api.server_close()
        self.api_thread.join(timeout=2)
        self.temp.cleanup()

    def call(self, method: str, path: str, token: str | None = None, body: dict | None = None):
        conn = http.client.HTTPConnection("127.0.0.1", self.agent_port, timeout=3)
        headers = {"Content-Type": "application/json"}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        raw = json.dumps(body).encode() if body is not None else None
        conn.request(method, path, body=raw, headers=headers)
        response = conn.getresponse()
        data = response.read()
        conn.close()
        parsed = json.loads(data) if data else {}
        return response.status, parsed

    def test_rejects_missing_token(self):
        status, _ = self.call("GET", "/profiles", token=None)
        self.assertEqual(status, 401)

    def test_rejects_wrong_token(self):
        status, _ = self.call("GET", "/profiles", token="wrong-token-entirely")
        self.assertEqual(status, 401)

    def test_lists_profiles(self):
        status, payload = self.call("GET", "/profiles", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(payload["profiles"][0]["id"], "test")

    def test_unknown_route_is_404(self):
        status, _ = self.call("GET", "/nope", token=self.token)
        self.assertEqual(status, 404)

    def test_activate_unknown_profile_is_404(self):
        status, _ = self.call("POST", "/activate", token=self.token, body={"profile_id": "missing"})
        self.assertEqual(status, 404)

    def test_activate_rejects_invalid_profile_id_shape(self):
        status, _ = self.call("POST", "/activate", token=self.token, body={"profile_id": 123})
        self.assertEqual(status, 400)

    def test_activate_deploys_and_reloads(self):
        status, payload = self.call("POST", "/activate", token=self.token, body={"profile_id": "test"})
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["strategy"], "TestStrategy")
        self.assertEqual(payload["activation_status"], "healthy")
        deployed = json.loads((self.root / "user_data" / "config.json").read_text())
        self.assertEqual(deployed["strategy"], "TestStrategy")

    def test_activate_rejects_when_engine_is_live(self):
        self.api_handler.dry_run = False
        status, payload = self.call("POST", "/activate", token=self.token, body={"profile_id": "test"})
        self.assertEqual(status, 409)
        self.assertIn("dry-run", payload["error"])

    def test_activate_rejects_with_open_trades(self):
        self.api_handler.open_trades = [{"trade_id": 1}]
        status, payload = self.call("POST", "/activate", token=self.token, body={"profile_id": "test"})
        self.assertEqual(status, 409)
        self.assertIn("ouvertes", payload["error"])


if __name__ == "__main__":
    unittest.main()
