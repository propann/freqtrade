import json
import tempfile
import unittest
from pathlib import Path

from scripts.runtime_secrets import bootstrap


class RuntimeSecretsTests(unittest.TestCase):
    def test_bootstrap_imports_once_without_overwriting(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "private" / "runtime-secrets.json"
            environment = {
                "QUANT_BOOTSTRAP_EXCHANGE_KEY": "exchange-key",
                "QUANT_BOOTSTRAP_EXCHANGE_SECRET": "exchange-secret",
                "QUANT_BOOTSTRAP_TELEGRAM_ENABLED": "true",
                "QUANT_BOOTSTRAP_TELEGRAM_TOKEN": "12345:token",
                "QUANT_BOOTSTRAP_TELEGRAM_CHAT_ID": "12345",
                "QUANT_BOOTSTRAP_TELEGRAM_AUTHORIZED_USERS": "[12345]",
            }

            self.assertTrue(bootstrap(path, environment))
            payload = json.loads(path.read_text())
            self.assertEqual(payload["exchange"]["key"], "exchange-key")
            self.assertEqual(payload["telegram"]["authorized_users"], ["12345"])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

            path.write_text('{"preserved":true}\n')
            self.assertFalse(bootstrap(path, {}))
            self.assertEqual(json.loads(path.read_text()), {"preserved": True})
