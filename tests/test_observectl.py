import json
import os
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
OBSERVECTL = REPOSITORY_ROOT / "scripts" / "observectl.py"


class ObserveCtlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        root = self.root

        class FreqtradeHandler(BaseHTTPRequestHandler):
            cpu = 12.5
            ram = 31.0
            state = "running"
            exchange_logs = []

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
                if self.path == "/api/v1/ping":
                    self.payload(200, {"status": "pong"})
                elif self.path == "/api/v1/show_config":
                    self.payload(200, {
                        "state": type(self).state,
                        "dry_run": True,
                        "strategy": "TestStrategy",
                        "timeframe": "15m",
                        "exchange": "test-exchange",
                    })
                elif self.path == "/api/v1/status":
                    self.payload(200, [])
                elif self.path == "/api/v1/sysinfo":
                    self.payload(200, {"cpu_avg": type(self).cpu, "cpu_count": 2, "ram_pct": type(self).ram})
                elif self.path == "/api/v1/health":
                    self.payload(200, {"last_process_ts": time.time(), "bot_start": "2026-08-22T00:00:00Z"})
                elif self.path == "/api/v1/logs?limit=100":
                    self.payload(200, {"log_count": len(type(self).exchange_logs), "logs": type(self).exchange_logs})
                else:
                    self.payload(404, {"error": "not found"})

        self.handler = FreqtradeHandler
        self.api = ThreadingHTTPServer(("127.0.0.1", 0), FreqtradeHandler)
        self.thread = threading.Thread(target=self.api.serve_forever, daemon=True)
        self.thread.start()
        self.env = {
            **os.environ,
            "QUANT_RACK_ROOT": str(root),
            "FREQTRADE_API_URL": f"http://127.0.0.1:{self.api.server_port}",
            "FREQTRADE_USERNAME": "observer",
            "FREQTRADE_PASSWORD": "never-write-this-secret",
        }

    def tearDown(self):
        self.api.shutdown()
        self.api.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def run_observe(self, *args):
        return subprocess.run(
            ["python3", str(OBSERVECTL), *args],
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_sample_records_only_operational_data(self):
        result = self.run_observe("sample")
        self.assertEqual(result.returncode, 0, result.stderr)
        sample = json.loads(result.stdout)
        self.assertEqual(sample["status"], "healthy")
        self.assertEqual(sample["engine"]["strategy"], "TestStrategy")
        log = (self.root / "user_data" / "observability" / "samples.jsonl").read_text()
        self.assertNotIn("never-write-this-secret", log)
        self.assertTrue((self.root / "user_data" / "observability" / "summary-168h.json").is_file())

    def test_fail_on_alert_exits_nonzero_after_recording(self):
        self.handler.cpu = 91.0
        result = self.run_observe("sample", "--fail-on-alert")
        self.assertEqual(result.returncode, 1, result.stderr)
        sample = json.loads(result.stdout)
        self.assertEqual(sample["status"], "degraded")
        self.assertIn("cpu_high", {alert["code"] for alert in sample["alerts"]})

    def test_summary_aggregates_samples(self):
        self.assertEqual(self.run_observe("sample").returncode, 0)
        self.handler.ram = 52.0
        self.assertEqual(self.run_observe("sample").returncode, 0)
        result = self.run_observe("summary", "--hours", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(result.stdout)
        self.assertEqual(summary["samples"], 2)
        self.assertEqual(summary["ram_pct"]["max"], 52.0)
        self.assertEqual(summary["restart_count_lower_bound"], 0)

    def test_exchange_errors_are_counted_without_log_content(self):
        self.handler.exchange_logs = [
            ["2026-08-22 00:00:00", "freqtrade.exchange.common", "ERROR", f"request failed {index}"]
            for index in range(3)
        ] + [["2026-08-22 00:00:01", "freqtrade.worker", "ERROR", "unrelated private-value"]]
        result = self.run_observe("sample", "--fail-on-alert")
        self.assertEqual(result.returncode, 1, result.stderr)
        sample = json.loads(result.stdout)
        self.assertEqual(sample["exchange"]["errors_in_log_window"], 3)
        stored = (self.root / "user_data" / "observability" / "samples.jsonl").read_text()
        self.assertNotIn("request failed", stored)
        self.assertNotIn("private-value", stored)

    def test_missing_credentials_are_recorded_as_critical_without_secret(self):
        self.env["FREQTRADE_PASSWORD"] = ""
        result = self.run_observe("sample")
        self.assertEqual(result.returncode, 0, result.stderr)
        sample = json.loads(result.stdout)
        self.assertEqual(sample["status"], "critical")
        self.assertEqual(len(sample["unavailable_endpoints"]), 6)


if __name__ == "__main__":
    unittest.main()
