"""Focused regression for durable outbox quarantine; no IB or Render network."""
import ast
import asyncio
from datetime import datetime
from pathlib import Path
from unittest import IsolatedAsyncioTestCase
from zoneinfo import ZoneInfo

SOURCE = Path(__file__).resolve().parents[1] / "bridge" / "ib_bridge_core.py"
AST = ast.parse(SOURCE.read_text(encoding="utf-8"))
FUNCTIONS = {n.name: n for n in AST.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
NAMES = ("render_outbox_item_due", "attempt_render_outbox_delivery")


class OutboxQuarantineTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.item = {"payload": {"event": "ENTRY_FILL"}, "attempts": 0}
        self.sent = []
        async def claim(_):
            return True
        async def release(_):
            return None
        async def forward(payload):
            self.sent.append(payload)
            return {"forwarded": False, "quarantine": True, "reason": "ownership_unverified"}
        def update(_id, **kwargs):
            self.item.update(kwargs)
            return True
        env = {
            "Dict": dict, "Any": object, "Optional": __import__("typing").Optional,
            "datetime": datetime, "ZoneInfo": ZoneInfo,
            "FORCE_EOD_FLATTEN_TIMEZONE": "America/New_York",
            "claim_render_outbox_delivery": claim,
            "release_render_outbox_delivery": release,
            "load_render_outbox": lambda: {"id": self.item},
            "render_outbox_item_due": None,
            "forward_to_render": forward,
            "render_delivery_succeeded": lambda _: False,
            "update_render_outbox_item": update,
        }
        module = ast.Module(body=[FUNCTIONS[n] for n in NAMES], type_ignores=[])
        exec(compile(module, str(SOURCE), "exec"), env)
        self.due = env["render_outbox_item_due"]
        self.attempt = env["attempt_render_outbox_delivery"]

    async def test_quarantine_persisted_and_not_retried_even_force(self):
        result = await self.attempt("id", force=True)
        self.assertEqual(result["reason"], "quarantined")
        self.assertTrue(self.item["quarantined"])
        self.assertFalse(self.due(self.item))
        result = await self.attempt("id", force=True)
        self.assertEqual(result["reason"], "quarantined")
        self.assertEqual(len(self.sent), 1)


if __name__ == "__main__":
    import unittest
    unittest.main()
