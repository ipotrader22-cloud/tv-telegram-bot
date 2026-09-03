import asyncio
import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from bridge import operator_manual_close_adapter as adapter


class FakeIB:
    def __init__(self, trades=None):
        self._trades = list(trades or [])

    def openTrades(self):
        return list(self._trades)

    def placeOrder(self, *_args, **_kwargs):
        raise AssertionError("operator external-close ack must never place orders")

    def cancelOrder(self, *_args, **_kwargs):
        raise AssertionError("operator external-close ack must never cancel orders")


class FakeCore:
    def __init__(self, managed, position=0.0, trades=None):
        self.store = copy.deepcopy(managed)
        self.position = position
        self.ib = FakeIB(trades)
        self.ib_lock = asyncio.Lock()
        self.ensure_ib_connected = AsyncMock()
        self.logger = SimpleNamespace(warning=lambda *_args, **_kwargs: None)

    async def get_position_size(self, _symbol):
        return self.position

    def load_managed_positions(self):
        return copy.deepcopy(self.store)

    def clear_managed_position(self, symbol):
        self.store.pop(symbol, None)


def managed_row(setup_id="VIXALE_EDGE:NVDA:15:SHORT:1787760000000"):
    return {
        "symbol": "NVDA",
        "side": "SHORT",
        "qty": 95,
        "entry": 210.32,
        "target": 209.07,
        "stop": 213.18,
        "setup_id": setup_id,
        "system_id": "VIXALE_EDGE",
        "strategy": "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1",
    }


def working_trade(symbol="NVDA", ref="TVFVG_NVDA_SHORT_TP"):
    return SimpleNamespace(
        contract=SimpleNamespace(symbol=symbol),
        order=SimpleNamespace(
            orderId=2527,
            permId=57598159,
            orderRef=ref,
            action="BUY",
            orderType="LMT",
            totalQuantity=95,
        ),
        orderStatus=SimpleNamespace(status="Submitted"),
    )


class RequestGuardTests(unittest.TestCase):
    def test_direct_localhost_is_allowed(self):
        request = SimpleNamespace(
            headers={"host": "127.0.0.1:8000"},
            client=SimpleNamespace(host="127.0.0.1"),
        )
        self.assertTrue(adapter.request_is_direct_local(request))

    def test_forwarded_request_is_rejected(self):
        request = SimpleNamespace(
            headers={
                "host": "127.0.0.1:8000",
                "x-forwarded-for": "203.0.113.5",
            },
            client=SimpleNamespace(host="127.0.0.1"),
        )
        self.assertFalse(adapter.request_is_direct_local(request))

    def test_ngrok_host_is_rejected(self):
        request = SimpleNamespace(
            headers={"host": "example.ngrok-free.dev"},
            client=SimpleNamespace(host="127.0.0.1"),
        )
        self.assertFalse(adapter.request_is_direct_local(request))


class ExternalCloseAckTests(unittest.IsolatedAsyncioTestCase):
    async def test_preview_safe_when_flat_and_no_orders(self):
        core = FakeCore({"NVDA": managed_row()}, position=0.0)
        async with core.ib_lock:
            result = await adapter.inspect_external_close_locked(core, "nvda")
        self.assertTrue(result["ok"])
        self.assertTrue(result["safe_to_clear"])
        self.assertEqual(result["status"], "safe_to_ack_external_close")
        self.assertEqual(result["working_order_count"], 0)

    async def test_ack_blocks_if_broker_position_is_not_flat(self):
        core = FakeCore({"NVDA": managed_row()}, position=-95.0)
        async with core.ib_lock:
            result = await adapter.acknowledge_external_close_locked(core, {
                "symbol": "NVDA",
                "managed_identity": managed_row()["setup_id"],
                "confirm": adapter.CONFIRM_EXTERNAL_CLOSE,
            })
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "blocked_broker_position_not_flat")
        self.assertIn("NVDA", core.store)

    async def test_ack_blocks_if_any_working_order_remains_for_symbol(self):
        core = FakeCore(
            {"NVDA": managed_row()},
            position=0.0,
            trades=[working_trade()],
        )
        async with core.ib_lock:
            result = await adapter.acknowledge_external_close_locked(core, {
                "symbol": "NVDA",
                "managed_identity": managed_row()["setup_id"],
                "confirm": adapter.CONFIRM_EXTERNAL_CLOSE,
            })
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "blocked_working_orders_present")
        self.assertEqual(result["working_order_count"], 1)
        self.assertIn("NVDA", core.store)

    async def test_ack_blocks_stale_identity(self):
        core = FakeCore({"NVDA": managed_row()}, position=0.0)
        async with core.ib_lock:
            result = await adapter.acknowledge_external_close_locked(core, {
                "symbol": "NVDA",
                "managed_identity": "VIXALE_EDGE:NVDA:15:SHORT:OLD",
                "confirm": adapter.CONFIRM_EXTERNAL_CLOSE,
            })
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "managed_identity_mismatch")
        self.assertIn("NVDA", core.store)

    async def test_ack_requires_explicit_confirmation(self):
        core = FakeCore({"NVDA": managed_row()}, position=0.0)
        async with core.ib_lock:
            result = await adapter.acknowledge_external_close_locked(core, {
                "symbol": "NVDA",
                "managed_identity": managed_row()["setup_id"],
                "confirm": "YES",
            })
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "confirmation_required")
        self.assertIn("NVDA", core.store)

    async def test_ack_clears_only_after_flat_no_orders_and_exact_identity(self):
        core = FakeCore(
            {"NVDA": managed_row(), "AAPL": {"symbol": "AAPL", "side": "LONG", "setup_id": "AAPL-1"}},
            position=0.0,
            trades=[working_trade(symbol="AAPL", ref="TVFVG_AAPL_LONG_TP")],
        )
        async with core.ib_lock:
            result = await adapter.acknowledge_external_close_locked(core, {
                "symbol": "NVDA",
                "managed_identity": managed_row()["setup_id"],
                "confirm": adapter.CONFIRM_EXTERNAL_CLOSE,
            })
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "managed_state_cleared_after_external_close")
        self.assertTrue(result["cleared"])
        self.assertEqual(result["broker_orders_submitted"], 0)
        self.assertEqual(result["broker_orders_canceled"], 0)
        self.assertNotIn("NVDA", core.store)
        self.assertIn("AAPL", core.store)

    async def test_trade_id_is_accepted_as_stable_identity(self):
        row = {
            "symbol": "TEAM",
            "side": "LONG",
            "trade_id": "TEAM_LONG_20260903_1",
            "system_id": "VIXALE_PRIME",
        }
        core = FakeCore({"TEAM": row}, position=0.0)
        async with core.ib_lock:
            result = await adapter.acknowledge_external_close_locked(core, {
                "symbol": "TEAM",
                "managed_identity": row["trade_id"],
                "confirm": adapter.CONFIRM_EXTERNAL_CLOSE,
            })
        self.assertTrue(result["ok"])
        self.assertNotIn("TEAM", core.store)

    async def test_row_without_stable_identity_is_blocked(self):
        row = {
            "symbol": "TEAM",
            "side": "LONG",
            "system_id": "VIXALE_PRIME",
        }
        core = FakeCore({"TEAM": row}, position=0.0)
        async with core.ib_lock:
            preview = await adapter.inspect_external_close_locked(core, "TEAM")
            result = await adapter.acknowledge_external_close_locked(core, {
                "symbol": "TEAM",
                "managed_identity": "TEAM_LONG",
                "confirm": adapter.CONFIRM_EXTERNAL_CLOSE,
            })
        self.assertFalse(preview["safe_to_clear"])
        self.assertEqual(preview["status"], "blocked_managed_identity_missing")
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "blocked_managed_identity_missing")
        self.assertIn("TEAM", core.store)


if __name__ == "__main__":
    unittest.main()
