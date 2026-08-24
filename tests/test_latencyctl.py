import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
LATENCYCTL = ROOT / "scripts" / "latencyctl.py"


class LatencyCtlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                body = b'{"serverTime": 1}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                body = b'{"jsonrpc":"2.0","id":1,"result":{"number":"0x10","timestamp":"0x65"}}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        endpoint = f"http://127.0.0.1:{self.server.server_port}"
        self.env = {
            **os.environ,
            "QUANT_RACK_ROOT": self.temp.name,
            "QUANT_CEX_PROBE_URL": f"{endpoint}/time",
            "QUANT_DEX_RPC_URL": f"{endpoint}/rpc?private=never-store",
            "FREQTRADE_USERNAME": "",
            "FREQTRADE_PASSWORD": "",
        }

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def run_tool(self, *args):
        return subprocess.run([sys.executable, str(LATENCYCTL), *args], env=self.env, text=True, capture_output=True, check=False)

    def test_sample_is_secret_free_and_records_dex_head(self):
        result = self.run_tool("sample")
        self.assertEqual(result.returncode, 0, result.stderr)
        sample = json.loads(result.stdout)
        self.assertTrue(sample["cex"]["ok"])
        self.assertEqual(sample["dex"]["block_number"], 16)
        recorded = (Path(self.temp.name) / "user_data" / "latency" / "samples.jsonl").read_text()
        self.assertNotIn("private=never-store", recorded)

    def test_profile_uses_latency_percentiles_without_inventing_slippage(self):
        self.assertEqual(self.run_tool("sample").returncode, 0)
        result = self.run_tool("profile", "--hours", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        profile = json.loads(result.stdout)
        self.assertIsNotNone(profile["cex_public_http"]["p95_ms"])
        self.assertIsNone(profile["backtest_assumptions"]["slippage_bps_per_side"])


if __name__ == "__main__":
    unittest.main()
