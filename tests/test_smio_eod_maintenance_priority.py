import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from bridge.smio_demo_adapter import DemoLifecycle


class EodMaintenancePriorityTests(unittest.IsolatedAsyncioTestCase):
    async def test_eod_precedes_slow_or_failed_maintenance_and_persists(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            lifecycle = DemoLifecycle(SimpleNamespace(), journal_path=path / "journal.json")
            calls = []

            async def eod():
                calls.append("eod")
                lifecycle.health["eod_result"] = "evaluated"

            async def inbox():
                calls.append("inbox")
                raise RuntimeError("fixture")

            async def reconcile():
                calls.append("reconcile")

            lifecycle.eod_failsafe_pass = eod
            lifecycle.process_inbox = inbox
            lifecycle.reconcile = reconcile
            await lifecycle.maintenance_pass()
            self.assertEqual(calls, ["eod", "inbox", "reconcile"])
            self.assertEqual(lifecycle.health["process_inbox_error"], "RuntimeError")
            records = (path / "smio_eod_diagnostics.jsonl").read_text().splitlines()
            self.assertEqual(len(records), 1)
            self.assertEqual(json.loads(records[0])["eod_result"], "evaluated")
            self.assertIn("eod_failsafe_pass_duration_seconds", json.loads(records[0]))

    async def test_diagnostic_failure_does_not_abort_maintenance(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            lifecycle = DemoLifecycle(SimpleNamespace(), journal_path=path / "journal.json")
            (path / "smio_eod_diagnostics.jsonl").mkdir()
            calls = []

            async def phase():
                calls.append(True)

            lifecycle.eod_failsafe_pass = phase
            lifecycle.process_inbox = phase
            lifecycle.reconcile = phase
            await lifecycle.maintenance_pass()
            self.assertEqual(len(calls), 3)
            self.assertIn("eod_diagnostic_error", lifecycle.health)
