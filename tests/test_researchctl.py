import fcntl
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RESEARCHCTL = REPOSITORY_ROOT / "scripts" / "researchctl.py"


class ResearchCtlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "quant_rack" / "profiles").mkdir(parents=True)
        (self.root / "strategies").mkdir()
        (self.root / "user_data").mkdir()
        (self.root / "strategies" / "TestStrategy.py").write_text("class TestStrategy: pass\n")
        (self.root / "user_data" / "config.json").write_text(json.dumps({"dry_run": True}))
        (self.root / "quant_rack" / "profiles" / "test.json").write_text(json.dumps({
            "id": "test",
            "strategy": "TestStrategy",
            "strategy_file": "strategies/TestStrategy.py",
            "timeframe": "15m",
            "indicators": ["rsi_14"],
            "budget": {"cpu": 1, "memory_mb": 512, "max_parallel_jobs": 1},
        }))
        (self.root / "docker-compose.coolify.yml").write_text("services: {}\n")
        (self.root / ".env").write_text("TEST=true\n")
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        docker = fake_bin / "docker"
        docker.write_text(
            "#!/bin/sh\n"
            "previous=''\n"
            "for argument in \"$@\"; do\n"
            "  if [ \"$previous\" = '--export-filename' ]; then\n"
            "    relative=${argument#/freqtrade/user_data/}\n"
            "    mkdir -p \"$QUANT_RACK_ROOT/user_data/$(dirname \"$relative\")\"\n"
            "    echo '{}' > \"$QUANT_RACK_ROOT/user_data/$relative\"\n"
            "  fi\n"
            "  if [ \"$previous\" = '--output' ]; then\n"
            "    relative=${argument#/freqtrade/user_data/}\n"
            "    mkdir -p \"$QUANT_RACK_ROOT/user_data/$(dirname \"$relative\")\"\n"
            "    echo '{\"profile\":\"test\",\"strategy\":\"TestStrategy\",\"timing_ms\":{\"median\":1.2},\"memory\":{\"indicator_bytes\":128}}' > \"$QUANT_RACK_ROOT/user_data/$relative\"\n"
            "  fi\n"
            "  previous=$argument\n"
            "done\n"
            "exit 0\n"
        )
        docker.chmod(0o755)
        self.env = {
            **os.environ,
            "QUANT_RACK_ROOT": str(self.root),
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
        }

    def tearDown(self):
        self.temp.cleanup()

    def run_research(self, *args):
        return subprocess.run(
            ["python3", str(RESEARCHCTL), *args],
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_plan_is_reproducible_and_read_only(self):
        result = self.run_research("plan", "test", "--timerange", "20260101-20260201")
        self.assertEqual(result.returncode, 0, result.stderr)
        plan = json.loads(result.stdout)
        self.assertEqual(plan["strategy"], "TestStrategy")
        self.assertEqual(plan["parallel_jobs"], 1)
        self.assertFalse((self.root / "user_data" / "research").exists())

    def test_run_records_experiment_and_export(self):
        result = self.run_research("run", "test", "--timerange", "20260101-20260201", "--confirm", "RESEARCH")
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads(result.stdout)
        self.assertEqual(record["result"], "success")
        self.assertTrue((self.root / "user_data" / record["output"]).is_file())
        registry = (self.root / "user_data" / "research" / "experiments.jsonl").read_text().splitlines()
        self.assertEqual(json.loads(registry[-1])["strategy_sha256"], record["strategy_sha256"])

    def test_run_requires_confirmation(self):
        result = self.run_research("run", "test", "--timerange", "20260101-20260201", "--confirm", "YES")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--confirm RESEARCH", result.stderr)

    def test_rejects_invalid_timerange(self):
        result = self.run_research("plan", "test", "--timerange", "yesterday")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Timerange attendu", result.stderr)

    def test_rejects_parallel_job(self):
        lock_path = self.root / "user_data" / "research" / "research.lock"
        lock_path.parent.mkdir(parents=True)
        with lock_path.open("a+") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_research("run", "test", "--timerange", "20260101-20260201", "--confirm", "RESEARCH")
        self.assertEqual(result.returncode, 2)
        self.assertIn("déjà en cours", result.stderr)

    def test_benchmark_records_reproducible_metrics(self):
        result = self.run_research(
            "benchmark", "test", "--rows", "500", "--repeats", "2", "--confirm", "BENCHMARK"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads(result.stdout)
        self.assertEqual(record["kind"], "indicator_benchmark")
        self.assertEqual(record["dataset"], "deterministic_benchmark_fixture")
        self.assertEqual(record["metrics"]["timing_ms"]["median"], 1.2)
        self.assertTrue((self.root / "user_data" / record["output"]).is_file())

    def test_benchmark_requires_exact_confirmation(self):
        result = self.run_research("benchmark", "test", "--confirm", "YES")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--confirm BENCHMARK", result.stderr)

    def test_benchmark_rejects_unbounded_workload(self):
        result = self.run_research("benchmark", "test", "--rows", "100", "--confirm", "BENCHMARK")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--rows", result.stderr)


if __name__ == "__main__":
    unittest.main()
