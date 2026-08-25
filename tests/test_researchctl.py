import fcntl
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts import researchctl


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
            "if [ -n \"${FAIL_RESEARCH_COMMAND:-}\" ]; then\n"
            "  for argument in \"$@\"; do\n"
            "    [ \"$argument\" = \"$FAIL_RESEARCH_COMMAND\" ] && exit 9\n"
            "  done\n"
            "fi\n"
            "previous=''\n"
            "backtest_directory=''\n"
            "timerange=''\n"
            "for argument in \"$@\"; do\n"
            "  [ \"$previous\" = '--backtest-directory' ] && backtest_directory=${argument#/freqtrade/user_data/}\n"
            "  [ \"$previous\" = '--timerange' ] && timerange=$argument\n"
            "  if [ \"$previous\" = '--output' ]; then\n"
            "    relative=${argument#/freqtrade/user_data/}\n"
            "    mkdir -p \"$QUANT_RACK_ROOT/user_data/$(dirname \"$relative\")\"\n"
            "    echo '{\"profile\":\"test\",\"strategy\":\"TestStrategy\",\"timing_ms\":{\"median\":1.2},\"memory\":{\"indicator_bytes\":128}}' > \"$QUANT_RACK_ROOT/user_data/$relative\"\n"
            "  fi\n"
            "  if [ \"$previous\" = '--lookahead-analysis-exportfilename' ]; then\n"
            "    relative=${argument#/freqtrade/user_data/}\n"
            "    mkdir -p \"$QUANT_RACK_ROOT/user_data/$(dirname \"$relative\")\"\n"
            "    printf 'strategy,has_bias\\nTestStrategy,%s\\n' \"${LOOKAHEAD_BIAS:-No}\" > \"$QUANT_RACK_ROOT/user_data/$relative\"\n"
            "  fi\n"
            "  previous=$argument\n"
            "done\n"
            "if [ -n \"$backtest_directory\" ]; then\n"
            "  mkdir -p \"$QUANT_RACK_ROOT/user_data/$backtest_directory\"\n"
            "  profit_total=0.10\n"
            "  if [ \"${OOS_REJECT:-false}\" = 'true' ] && [ \"$timerange\" = '20260301-20260501' ]; then profit_total=-0.10; fi\n"
            "  printf '{\"strategy\":{\"TestStrategy\":{\"total_trades\":30,\"wins\":20,\"losses\":10,\"profit_total\":%s,\"profit_factor\":1.50,\"expectancy\":1.0,\"max_drawdown_account\":0.10}}}' \"$profit_total\" > \"$QUANT_RACK_ROOT/user_data/$backtest_directory/result.json\"\n"
            "fi\n"
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
        self.assertTrue((self.root / "user_data" / record["output"]).is_dir())
        self.assertEqual(record["metrics"]["total_trades"], 30)
        registry = (self.root / "user_data" / "research" / "experiments.jsonl").read_text().splitlines()
        self.assertEqual(json.loads(registry[-1])["strategy_sha256"], record["strategy_sha256"])

    def test_reads_native_freqtrade_zip_report(self):
        directory = self.root / "native-report"
        directory.mkdir()
        payload = {
            "strategy": {
                "TestStrategy": {
                    "total_trades": 30,
                    "wins": 20,
                    "losses": 10,
                    "profit_total": 0.1,
                    "profit_factor": 1.5,
                    "expectancy": 1.0,
                    "max_drawdown_account": 0.1,
                }
            }
        }
        archive = directory / "backtest-result.zip"
        with zipfile.ZipFile(archive, "w") as handle:
            handle.writestr("backtest-result.json", json.dumps(payload))
            handle.writestr("config.json", json.dumps({"strategy": "TestStrategy"}))
        artifact, report = researchctl.backtest_report(directory, "TestStrategy")
        self.assertEqual(artifact, archive)
        self.assertEqual(researchctl.backtest_metrics(report, "TestStrategy")["total_trades"], 30)

    def test_run_requires_confirmation(self):
        result = self.run_research("run", "test", "--timerange", "20260101-20260201", "--confirm", "YES")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--confirm RESEARCH", result.stderr)

    def test_rejects_invalid_timerange(self):
        result = self.run_research("plan", "test", "--timerange", "yesterday")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Timerange attendu", result.stderr)
        invalid_date = self.run_research("plan", "test", "--timerange", "20260230-20260315")
        self.assertEqual(invalid_date.returncode, 2)
        self.assertIn("Date calendaire invalide", invalid_date.stderr)

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

    def test_validate_records_all_checks_and_requires_recursive_review(self):
        result = self.run_research(
            "validate", "test", "--timerange", "20260101-20260201", "--confirm", "VALIDATE"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads(result.stdout)
        self.assertEqual(record["kind"], "strategy_validation")
        self.assertEqual(record["result"], "review_required")
        self.assertEqual(
            [check["result"] for check in record["validation_checks"]],
            ["completed", "completed", "no_bias_detected", "review_required"],
        )
        self.assertTrue((self.root / "user_data" / record["lookahead_report"]).is_file())

    def test_validate_requires_exact_confirmation(self):
        result = self.run_research(
            "validate", "test", "--timerange", "20260101-20260201", "--confirm", "YES"
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("--confirm VALIDATE", result.stderr)

    def test_validate_blocks_a_strategy_with_lookahead_bias(self):
        self.env["LOOKAHEAD_BIAS"] = "Yes"
        result = self.run_research(
            "validate", "test", "--timerange", "20260101-20260201", "--confirm", "VALIDATE"
        )
        self.assertEqual(result.returncode, 2)
        registry = (self.root / "user_data" / "research" / "experiments.jsonl").read_text().splitlines()
        record = json.loads(registry[-1])
        self.assertEqual(
            [check["result"] for check in record["validation_checks"]],
            ["completed", "completed", "bias_detected", "skipped"],
        )

    def test_validate_stops_after_a_failed_check(self):
        self.env["FAIL_RESEARCH_COMMAND"] = "backtesting"
        result = self.run_research(
            "validate", "test", "--timerange", "20260101-20260201", "--confirm", "VALIDATE"
        )
        self.assertEqual(result.returncode, 2)
        registry = (self.root / "user_data" / "research" / "experiments.jsonl").read_text().splitlines()
        record = json.loads(registry[-1])
        self.assertEqual(
            [check["result"] for check in record["validation_checks"]],
            ["completed", "failed", "skipped", "skipped"],
        )

    def test_oos_passes_only_after_two_bounded_backtests(self):
        result = self.run_research(
            "oos", "test", "--timerange", "20260101-20260501", "--split-date", "20260301",
            "--fee", "0.001", "--confirm", "OOS",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads(result.stdout)
        self.assertEqual(record["result"], "passed")
        self.assertEqual([phase["result"] for phase in record["phases"]], ["completed", "completed"])
        self.assertTrue(all(check["passed"] for check in record["gate_checks"]))

    def test_oos_rejects_weak_unseen_results(self):
        self.env["OOS_REJECT"] = "true"
        result = self.run_research(
            "oos", "test", "--timerange", "20260101-20260501", "--split-date", "20260301",
            "--fee", "0.001", "--confirm", "OOS",
        )
        self.assertEqual(result.returncode, 2)
        registry = (self.root / "user_data" / "research" / "experiments.jsonl").read_text().splitlines()
        record = json.loads(registry[-1])
        self.assertEqual(record["result"], "rejected")
        self.assertFalse(next(check for check in record["gate_checks"] if check["name"] == "oos_profit_positive")["passed"])

    def test_oos_requires_exact_confirmation_and_long_periods(self):
        wrong_confirmation = self.run_research(
            "oos", "test", "--timerange", "20260101-20260501", "--split-date", "20260301",
            "--fee", "0.001", "--confirm", "YES",
        )
        self.assertEqual(wrong_confirmation.returncode, 2)
        self.assertIn("--confirm OOS", wrong_confirmation.stderr)
        short_period = self.run_research(
            "oos", "test", "--timerange", "20260101-20260201", "--split-date", "20260115",
            "--fee", "0.001", "--confirm", "OOS",
        )
        self.assertEqual(short_period.returncode, 2)
        self.assertIn("au moins 30 jours", short_period.stderr)

    def test_retention_is_read_only_and_preserves_recent_experiments(self):
        research = self.root / "user_data" / "research"
        old = research / "old-experiment"
        recent = research / "recent-experiment"
        old.mkdir(parents=True)
        recent.mkdir()
        (old / "result.zip").write_bytes(b"old")
        (recent / "result.zip").write_bytes(b"recent")
        old_time = 1_700_000_000
        os.utime(old, (old_time, old_time))

        result = self.run_research("retention", "--keep-days", "7", "--keep-last", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report["dry_run"])
        self.assertEqual([item["experiment"] for item in report["candidates"]], ["old-experiment"])
        self.assertTrue(old.is_dir())
        self.assertTrue(recent.is_dir())

    def test_retention_prune_requires_confirmation_and_only_removes_candidates(self):
        research = self.root / "user_data" / "research"
        old = research / "old-experiment"
        recent = research / "recent-experiment"
        old.mkdir(parents=True)
        recent.mkdir()
        (old / "result.zip").write_bytes(b"old")
        (recent / "result.zip").write_bytes(b"recent")
        old_time = 1_700_000_000
        os.utime(old, (old_time, old_time))

        rejected = self.run_research("retention", "--keep-days", "7", "--keep-last", "1", "--prune")
        self.assertEqual(rejected.returncode, 2)
        self.assertTrue(old.is_dir())

        result = self.run_research(
            "retention", "--keep-days", "7", "--keep-last", "1", "--prune",
            "--confirm", "PRUNE-RESEARCH",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report["dry_run"])
        self.assertEqual(report["removed_experiments"], ["old-experiment"])
        self.assertFalse(old.exists())
        self.assertTrue(recent.is_dir())


if __name__ == "__main__":
    unittest.main()
