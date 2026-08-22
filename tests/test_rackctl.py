import json
import os
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RACKCTL = REPOSITORY_ROOT / "scripts" / "rackctl.py"


class RackCtlTests(unittest.TestCase):
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
            "dry_run": False,
            "max_open_trades": 8,
            "exchange": {"pair_whitelist": ["BTC/USDT", "ETH/USDT"]},
        }))
        self.env = {**os.environ, "QUANT_RACK_ROOT": str(self.root)}

        root = self.root

        class FreqtradeHandler(BaseHTTPRequestHandler):
            dry_run = True
            open_trades = []
            reload_status = 200
            reload_count = 0

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
                type(self).reload_count += 1
                self.payload(type(self).reload_status, {"status": "reloaded"})

        self.api_handler = FreqtradeHandler
        self.api = ThreadingHTTPServer(("127.0.0.1", 0), FreqtradeHandler)
        self.api_thread = threading.Thread(target=self.api.serve_forever, daemon=True)
        self.api_thread.start()
        self.env.update({
            "FREQTRADE_API_URL": f"http://127.0.0.1:{self.api.server_port}",
            "FREQTRADE_USERNAME": "operator",
            "FREQTRADE_PASSWORD": "server-only-password",
            "QUANT_RACK_ACTOR": "test-operator",
        })

    def tearDown(self):
        self.api.shutdown()
        self.api.server_close()
        self.api_thread.join(timeout=2)
        self.temp.cleanup()

    def run_rack(self, *args):
        return subprocess.run(
            ["python3", str(RACKCTL), *args],
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_list_validates_profile(self):
        result = self.run_rack("list")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)[0]["id"], "test")

    def test_list_rejects_duplicate_indicators(self):
        profile_path = self.root / "quant_rack" / "profiles" / "test.json"
        profile = json.loads(profile_path.read_text())
        profile["indicators"] = ["rsi_14", "RSI_14"]
        profile_path.write_text(json.dumps(profile))
        result = self.run_rack("list")
        self.assertEqual(result.returncode, 2)
        self.assertIn("indicators contient un doublon", result.stderr)

    def test_activate_without_apply_does_not_touch_config(self):
        result = self.run_rack("activate", "test")
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads((self.root / "user_data" / "config.json").read_text())
        state = json.loads((self.root / "user_data" / "rack" / "state.json").read_text())
        self.assertEqual(config["strategy"], "Old")
        self.assertFalse(state["config_applied"])
        self.assertFalse(state["restart_required"])

    def test_apply_backs_up_config_and_forces_dry_run(self):
        result = self.run_rack("activate", "test", "--apply-config")
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads((self.root / "user_data" / "config.json").read_text())
        backups = list((self.root / "user_data").glob("config.backup-*.json"))
        self.assertEqual(config["strategy"], "TestStrategy")
        self.assertTrue(config["dry_run"])
        self.assertEqual(config["timeframe"], "15m")
        self.assertEqual(config["max_open_trades"], 3)
        self.assertEqual(len(backups), 1)

    def test_apply_rejects_pairlist_over_budget(self):
        config_path = self.root / "user_data" / "config.json"
        config = json.loads(config_path.read_text())
        config["exchange"]["pair_whitelist"] = ["A/USDT", "B/USDT", "C/USDT", "D/USDT"]
        config_path.write_text(json.dumps(config))
        result = self.run_rack("activate", "test", "--apply-config")
        self.assertEqual(result.returncode, 2)
        self.assertIn("autorise 3 paires", result.stderr)

    def test_apply_replaces_unlimited_trade_count_with_profile_limit(self):
        config_path = self.root / "user_data" / "config.json"
        config = json.loads(config_path.read_text())
        config["max_open_trades"] = -1
        config_path.write_text(json.dumps(config))
        result = self.run_rack("activate", "test", "--apply-config")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(config_path.read_text())["max_open_trades"], 3)

    def test_deploy_reloads_and_verifies_dry_run_profile(self):
        config_path = self.root / "user_data" / "config.json"
        config = json.loads(config_path.read_text())
        config["dry_run"] = True
        config_path.write_text(json.dumps(config))

        result = self.run_rack("deploy", "test", "--confirm", "DRY-RUN")

        self.assertEqual(result.returncode, 0, result.stderr)
        deployed = json.loads(config_path.read_text())
        state = json.loads((self.root / "user_data" / "rack" / "state.json").read_text())
        audit = json.loads((self.root / "user_data" / "rack" / "audit.jsonl").read_text().splitlines()[-1])
        self.assertEqual(deployed["strategy"], "TestStrategy")
        self.assertEqual(state["activation_status"], "healthy")
        self.assertFalse(state["restart_required"])
        self.assertEqual(audit["result"], "success")
        self.assertNotIn("server-only-password", json.dumps(audit))

    def test_deploy_rejects_live_engine(self):
        self.api_handler.dry_run = False
        result = self.run_rack("deploy", "test", "--confirm", "DRY-RUN")
        self.assertEqual(result.returncode, 2)
        self.assertIn("doit déjà être en dry-run", result.stderr)

    def test_deploy_rolls_back_when_reload_fails(self):
        config_path = self.root / "user_data" / "config.json"
        original = json.loads(config_path.read_text())
        original["dry_run"] = True
        config_path.write_text(json.dumps(original))
        self.api_handler.reload_status = 500

        result = self.run_rack("deploy", "test", "--confirm", "DRY-RUN")

        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(config_path.read_text()), original)
        audit = json.loads((self.root / "user_data" / "rack" / "audit.jsonl").read_text().splitlines()[-1])
        self.assertEqual(audit["result"], "rolled-back")

    def test_deploy_requires_exact_confirmation(self):
        result = self.run_rack("deploy", "test", "--confirm", "YES")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--confirm DRY-RUN", result.stderr)


if __name__ == "__main__":
    unittest.main()
