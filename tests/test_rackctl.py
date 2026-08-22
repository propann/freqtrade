import json
import os
import subprocess
import tempfile
import unittest
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

    def tearDown(self):
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


if __name__ == "__main__":
    unittest.main()
