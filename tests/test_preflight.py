import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
PREFLIGHT = REPOSITORY_ROOT / "scripts" / "preflight.py"


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "user_data").mkdir()
        self.password = "internal-password-42"
        self.env_path = self.root / ".env"
        self.values = {
            "FREQTRADE_USERNAME": "operator",
            "FREQTRADE_PASSWORD": self.password,
            "FREQTRADE_API_JWT_SECRET": "a" * 40,
            "FREQTRADE_WS_TOKEN": "b" * 32,
            "FREQTRADE_ADMIN_USER": "admin",
            "FREQTRADE_ADMIN_PASSWORD": "console-password-42",
            "FREQTRADE_JWT_SECRET": "c" * 40,
            "TELEGRAM_ENABLED": "true",
            "TELEGRAM_BOT_TOKEN": "123456789:abcdefghijklmnopqrstuvwxyzABCDE",
            "TELEGRAM_CHAT_ID": "123456789",
            "TELEGRAM_AUTHORIZED_USERS": '["operator"]',
            "EXCHANGE_API_KEY": "exchange-key-1234",
            "EXCHANGE_API_SECRET": "exchange-secret-1234",
        }
        self.write_env()
        self.config_path = self.root / "user_data" / "config.json"
        self.config = {
            "dry_run": True,
            "force_entry_enable": False,
            "exchange": {"name": "binance", "key": "", "secret": ""},
            "telegram": {"enabled": False, "token": "", "chat_id": ""},
            "api_server": {"CORS_origins": []},
        }
        self.write_config()
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        (self.root / "safe.txt").write_text("safe repository\n")
        subprocess.run(["git", "add", "safe.txt"], cwd=self.root, check=True)
        self.env = {**os.environ, "QUANT_RACK_ROOT": str(self.root)}

    def tearDown(self):
        self.temp.cleanup()

    def write_env(self):
        self.env_path.write_text("\n".join(f"{key}={value}" for key, value in self.values.items()) + "\n")
        self.env_path.chmod(0o600)

    def write_config(self):
        self.config_path.write_text(json.dumps(self.config))

    def run_preflight(self, *extra):
        return subprocess.run(
            ["python3", str(PREFLIGHT), "--env-file", str(self.env_path), "--config", str(self.config_path), *extra],
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_complete_dry_run_configuration_passes_without_echoing_secrets(self):
        result = self.run_preflight("--require-telegram", "--require-exchange")
        self.assertEqual(result.returncode, 0, result.stdout)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "pass")
        self.assertNotIn(self.password, result.stdout)
        self.assertNotIn(self.values["TELEGRAM_BOT_TOKEN"], result.stdout)

    def test_placeholders_and_live_mode_are_blocked(self):
        self.values["FREQTRADE_PASSWORD"] = "change-me-password"
        self.values["EXCHANGE_API_KEY"] = "change-me-key"
        self.values["EXCHANGE_API_SECRET"] = "change-me-secret"
        self.write_env()
        self.config["dry_run"] = False
        self.write_config()
        result = self.run_preflight()
        self.assertEqual(result.returncode, 2)
        failures = {item["id"] for item in json.loads(result.stdout)["checks"] if item["status"] == "fail"}
        self.assertIn("required_secrets", failures)
        self.assertIn("exchange_keys", failures)
        self.assertIn("dry_run", failures)

    def test_embedded_and_tracked_secrets_are_blocked_without_value_in_report(self):
        self.config["exchange"]["secret"] = "embedded-value"
        self.write_config()
        (self.root / "leak.txt").write_text(self.password)
        subprocess.run(["git", "add", "leak.txt"], cwd=self.root, check=True)
        result = self.run_preflight()
        self.assertEqual(result.returncode, 2)
        failures = {item["id"] for item in json.loads(result.stdout)["checks"] if item["status"] == "fail"}
        self.assertIn("config_secrets", failures)
        self.assertIn("tracked_secret_scan", failures)
        self.assertNotIn(self.password, result.stdout)

    def test_open_env_permissions_are_blocked(self):
        self.env_path.chmod(0o644)
        result = self.run_preflight()
        self.assertEqual(result.returncode, 2)
        failures = {item["id"] for item in json.loads(result.stdout)["checks"] if item["status"] == "fail"}
        self.assertIn("env_permissions", failures)

    def test_process_environment_mode_does_not_require_env_file(self):
        process_env = {**self.env, **self.values}
        result = subprocess.run(
            [
                "python3", str(PREFLIGHT), "--process-env", "--env-file", str(self.root / "absent"),
                "--config", str(self.config_path), "--require-telegram", "--require-exchange",
            ],
            env=process_env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertNotIn(self.password, result.stdout)


if __name__ == "__main__":
    unittest.main()
