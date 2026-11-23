"""Broker-response regressions for the November 20 GOOGL double-buy incident."""
import copy
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from tests.test_vixale_edge_bridge_isolation import (
    ib_bridge as bridge, fake_trade, attach_exact_trade_fills,
)


class BrokerFixture:
    def __init__(self, side="SHORT"):
        self.side = side
        self.position = -110.0 if side == "SHORT" else 110.0
        self.row = {"symbol": "GOOGL", "strategy": "SHREK_1_4", "side": side,
                    "qty": 110, "entry": 272.94, "target": 265.62,
                    "last_payload": {"strategy": "SHREK_1_4"},
                    "target_order": {"order_id": 10, "perm_id": 1010,
                                     "order_ref": f"TVFVG_GOOGL_{side}_TP", "expected_qty": 110}}
        self.target = self.trade(10, 1010, f"TVFVG_GOOGL_{side}_TP", "Submitted", 0, 0)
        self.target_active = True
        self.target_visible = True
        self.target_completed_visible = True
        self.close = None
        self.cancel_mode = "cancel"
        self.close_mode = "fill"
        self.other_orders = []
        self.other_positions = []
        self.events = []
        self.saved = []
        self.fills = []

    def trade(self, order_id, perm_id, ref, status, filled, price):
        t = fake_trade(order_id=order_id, perm_id=perm_id, order_ref=ref,
                       action="BUY" if self.side == "SHORT" else "SELL", status=status,
                       filled=filled, price=price, symbol="GOOGL")
        t.order.clientId = 77
        t.order.account = "PAPER_TEST"
        t.order.totalQuantity = 110
        t.order.filledQuantity = filled
        t.contract.secType = "STK"
        return t

    def target_fill(self, qty):
        self.target.orderStatus.filled = qty
        self.target.order.filledQuantity = qty
        self.target.orderStatus.avgFillPrice = 265.62
        attach_exact_trade_fills(self.target, [("TARGET-EXEC", qty, 265.62)])
        self.fills = list(self.target.fills)
        self.position += qty if self.side == "SHORT" else -qty

    def cancel(self, order):
        self.events.append("cancel")
        if self.cancel_mode == "pending":
            self.target.orderStatus.status = "PendingCancel"
            return
        if self.cancel_mode == "fill":
            self.target_fill(110)
            self.target.orderStatus.status = "Filled"
        elif self.cancel_mode in ("partial", "partial_stale"):
            self.target_fill(20)
            if self.cancel_mode == "partial_stale":
                self.position = -110.0
            self.target.orderStatus.status = "Cancelled"
        else:
            self.target.orderStatus.status = "Cancelled"
        self.target_active = False

    def place(self, contract, order):
        self.events.append("place")
        self.assert_reserved = bool(self.saved and next(iter(self.saved[-1].values()))["order_submitted"])
        qty = order.totalQuantity
        self.close = self.trade(20, 2020, order.orderRef, "Filled", qty, 264.545)
        self.close.order.totalQuantity = qty
        self.close.order.action = order.action
        attach_exact_trade_fills(self.close, [("EOD-EXEC", qty, 264.545)])
        if self.close_mode == "pending":
            self.close.orderStatus.status = "Submitted"
            self.close.orderStatus.filled = 0
            self.close.fills = []
            return self.close
        self.position += qty if order.action == "BUY" else -qty
        self.fills += self.close.fills
        if self.close_mode == "reverse":
            self.position = 110.0
        if self.close_mode == "target_reappears":
            self.target_active = True
            self.target.orderStatus.status = "Submitted"
        if self.close_mode == "missing_exec":
            self.close.fills = []
            self.fills = []
        return self.close

    async def refresh(self, method, *args):
        self.events.append(method)
        if method == "reqAllOpenOrdersAsync":
            values = ([self.target] if self.target_visible and self.target_active else []) + self.other_orders
            if self.close and self.close.orderStatus.status == "Submitted":
                values = values + [self.close]
        elif method == "reqCompletedOrdersAsync":
            values = [self.target] if self.target_visible and self.target_completed_visible and not self.target_active else []
            if self.close and self.close.orderStatus.status == "Filled":
                values = values + [self.close]
        elif method == "reqExecutionsAsync":
            values = self.fills
        elif method == "reqPositionsAsync":
            values = [SimpleNamespace(contract=SimpleNamespace(symbol="GOOGL", secType="STK"),
                                      account="PAPER_TEST", position=self.position)] + self.other_positions
        else:
            raise AssertionError(method)
        return {"ok": True, "supported": True, "values": list(values), "error": ""}

    def patches(self):
        stack = ExitStack()
        for name in ("FORCE_EOD_CANCEL_VERIFY_SECONDS", "FORCE_EOD_POSITION_VERIFY_SECONDS", "FORCE_EOD_FILL_VERIFY_SECONDS"):
            stack.enter_context(patch.object(bridge, name, 0))
        stack.enter_context(patch.object(bridge, "DRY_RUN", False))
        stack.enter_context(patch.object(bridge, "is_us_stock_rth_now", return_value=True))
        stack.enter_context(patch.object(bridge.ib.client, "clientId", 77, create=True))
        stack.enter_context(patch.object(bridge, "bounded_ib_refresh_request", self.refresh))
        stack.enter_context(patch.object(bridge.asyncio, "sleep", AsyncMock()))
        stack.enter_context(patch.object(bridge, "qualify_contract", AsyncMock(return_value=self.target.contract)))
        self.place_mock = stack.enter_context(patch.object(bridge.ib, "placeOrder", side_effect=self.place))
        self.cancel_mock = stack.enter_context(patch.object(bridge.ib, "cancelOrder", side_effect=self.cancel, create=True))
        stack.enter_context(patch.object(bridge.ib, "openTrades", return_value=[]))
        stack.enter_context(patch.object(bridge, "save_force_eod_state", side_effect=lambda d: self.saved.append(copy.deepcopy(d))))
        self.clear = stack.enter_context(patch.object(bridge, "clear_managed_position"))
        self.deliver = stack.enter_context(patch.object(bridge, "deliver_confirmed_shrek_eod_callback", AsyncMock(return_value={"forwarded": True})))
        return stack

    async def run(self, state=None):
        return await bridge.flatten_one_shrek_position("2026-11-20", "GOOGL", self.row, "TEST", state if state is not None else {})


class ShrekEodSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_local_cache_refreshes_and_cancels_exact_broker_target(self):
        b = BrokerFixture()
        with b.patches():
            result = await b.run()
        self.assertEqual(result["status"], "confirmed_flat")
        self.assertEqual(b.position, 0)
        self.assertTrue(b.assert_reserved)
        b.cancel_mock.assert_called_once_with(b.target.order)
        self.assertLess(b.events.index("cancel"), b.events.index("place"))
        self.assertEqual(b.place_mock.call_args.args[1].totalQuantity, 110)
        self.assertEqual(b.place_mock.call_args.args[1].action, "BUY")
        self.assertEqual(b.saved[-1]["2026-11-20:GOOGL:SHREK_1_4"]["render_payload"]["execution_components"][0]["exec_id"], "EOD-EXEC")

    async def test_missing_target_never_treats_empty_open_orders_as_cancelled(self):
        b = BrokerFixture()
        b.target_visible = False
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_cancel_unconfirmed")
        b.place_mock.assert_not_called()
        b.clear.assert_not_called()

    async def test_pending_cancel_never_authorizes_market_order(self):
        b = BrokerFixture()
        b.cancel_mode = "pending"
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_cancel_unconfirmed")
        b.place_mock.assert_not_called()

    async def test_disappearance_without_completed_cancel_ack_is_ambiguous(self):
        b = BrokerFixture()
        b.target_completed_visible = False
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_cancel_unconfirmed")
        b.place_mock.assert_not_called()

    async def test_target_fills_during_cancel_no_second_buy(self):
        b = BrokerFixture()
        b.cancel_mode = "fill"
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_fill_race_flat")
        b.place_mock.assert_not_called()
        b.deliver.assert_not_awaited()

    async def test_partial_target_closes_only_remainder_and_publishes_weighted_full_exit(self):
        b = BrokerFixture()
        b.cancel_mode = "partial"
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "confirmed_flat")
        self.assertEqual(b.place_mock.call_args.args[1].totalQuantity, 90)
        payload = b.saved[-1]["2026-11-20:GOOGL:SHREK_1_4"]["render_payload"]
        self.assertEqual(payload["qty"], 110)
        self.assertEqual(payload["price"], round((20*265.62+90*264.545)/110, 2))
        self.assertEqual(len(payload["execution_components"]), 2)

    async def test_partial_fill_with_stale_position_never_overbuys(self):
        b = BrokerFixture()
        b.cancel_mode = "partial_stale"
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_cancel_unconfirmed")
        b.place_mock.assert_not_called()

    async def test_flat_position_still_cancels_leftover_target(self):
        b = BrokerFixture()
        b.position = 0
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_fill_race_flat")
        b.cancel_mock.assert_called_once()
        b.place_mock.assert_not_called()

    async def test_wrong_side_position_is_not_automatically_traded(self):
        b = BrokerFixture()
        b.position = 110
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_cancel_unconfirmed")
        b.place_mock.assert_not_called()

    async def test_long_position_closes_with_sell(self):
        b = BrokerFixture("LONG")
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "confirmed_flat")
        self.assertEqual(b.place_mock.call_args.args[1].action, "SELL")

    async def test_nonflat_missing_fills_working_order_or_reappearing_target_cannot_publish(self):
        for mode in ("reverse", "missing_exec", "pending", "target_reappears"):
            with self.subTest(mode=mode):
                b = BrokerFixture()
                b.close_mode = mode
                with b.patches(): result = await b.run()
                self.assertEqual(result["status"], "close_evidence_unconfirmed")
                b.clear.assert_not_called()
                b.deliver.assert_not_awaited()

    async def test_refresh_failure_never_mutates_broker(self):
        b = BrokerFixture()
        with b.patches(), patch.object(bridge, "bounded_ib_refresh_request", AsyncMock(return_value={"ok": False})):
            result = await b.run()
        self.assertEqual(result["status"], "target_cancel_unconfirmed")
        b.cancel_mock.assert_not_called()
        b.place_mock.assert_not_called()

    async def test_foreign_order_or_wrong_account_prevents_close(self):
        for mode in ("order", "account", "client", "identity"):
            with self.subTest(mode=mode):
                b = BrokerFixture()
                if mode == "order": b.other_orders = [b.trade(99, 9999, "MANUAL", "Submitted", 0, 0)]
                if mode == "account": b.target.order.account = "OTHER"
                if mode == "client": b.target.order.clientId = 88
                if mode == "identity": b.target.order.permId = 9999
                with b.patches(): result = await b.run()
                self.assertEqual(result["status"], "target_cancel_unconfirmed")
                b.cancel_mock.assert_not_called()
                b.place_mock.assert_not_called()

    async def test_crash_reservation_never_resubmits_missing_order(self):
        b = BrokerFixture()
        state = {"2026-11-20:GOOGL:SHREK_1_4": {"status": "submitting", "order_submitted": True,
                 "side": "SHORT", "qty": 110, "order_ref": "VIXALE_EOD_20261120_GOOGL_SHREK_1_4"}}
        with b.patches(): result = await b.run(state)
        self.assertEqual(result["status"], "ambiguous_prior_submission")
        b.place_mock.assert_not_called()

    async def test_retry_observes_same_close_without_second_order(self):
        b = BrokerFixture()
        b.close_mode = "missing_exec"
        state = {}
        with b.patches():
            first = await b.run(state)
            attach_exact_trade_fills(b.close, [("EOD-EXEC", 110, 264.545)])
            b.fills = list(b.close.fills)
            second = await b.run(state)
        self.assertEqual(first["status"], "close_evidence_unconfirmed")
        self.assertEqual(second["status"], "confirmed_flat")
        b.place_mock.assert_called_once()

    async def test_persistence_failure_prevents_submission(self):
        b = BrokerFixture()
        with b.patches(), patch.object(bridge, "save_force_eod_state", side_effect=OSError("disk full")):
            with self.assertRaises(OSError): await b.run()
        b.place_mock.assert_not_called()

    async def test_existing_same_reference_order_blocks_fresh_submission(self):
        b = BrokerFixture()
        b.other_orders = [b.trade(20, 2020, "VIXALE_EOD_20261120_GOOGL_SHREK_1_4", "Submitted", 0, 0)]
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "target_cancel_unconfirmed")
        b.cancel_mock.assert_not_called()
        b.place_mock.assert_not_called()

    async def test_legacy_target_identity_survives_restart_during_cancel(self):
        b = BrokerFixture()
        b.row["target_order"].pop("perm_id")
        b.cancel_mode = "pending"
        state = {}
        with b.patches():
            first = await b.run(state)
            self.assertEqual(state["2026-11-20:GOOGL:SHREK_1_4"]["target_order"]["perm_id"], 1010)
            b.target.order.orderId = 0
            b.target.order.clientId = 0
            b.target_active = False
            b.target.orderStatus.status = "Cancelled"
            second = await b.run(copy.deepcopy(state))
        self.assertEqual(first["status"], "target_cancel_unconfirmed")
        self.assertEqual(second["status"], "confirmed_flat")
        b.place_mock.assert_called_once()

    async def test_completed_order_without_status_quantities_uses_exact_executions(self):
        b = BrokerFixture()
        b.target_fill(20)
        b.target_active = False
        b.target.orderStatus.status = "Cancelled"
        b.target.orderStatus.filled = 0
        b.target.orderStatus.avgFillPrice = 0
        b.target.order.orderId = 0
        b.target.order.clientId = 0
        b.target.fills = []
        with b.patches(): result = await b.run()
        self.assertEqual(result["status"], "confirmed_flat")
        self.assertEqual(b.place_mock.call_args.args[1].totalQuantity, 90)

    async def test_dry_run_does_not_reserve_or_submit_close(self):
        b = BrokerFixture()
        b.target_active = False
        b.target.orderStatus.status = "Cancelled"
        state = {}
        with b.patches(), patch.object(bridge, "DRY_RUN", True):
            result = await b.run(state)
        self.assertEqual(result["status"], "dry_run_no_order")
        self.assertFalse(any(s.get("order_submitted") for s in state.values()))
        b.place_mock.assert_not_called()
        b.cancel_mock.assert_not_called()

    async def test_session_end_during_refresh_or_qualification_prevents_mutation(self):
        for checks, expected in (([False], "target_cancel_unconfirmed"),
                                 ([True, False], "blocked_close_outside_rth")):
            with self.subTest(checks=checks):
                b = BrokerFixture()
                with b.patches(), patch.object(bridge, "is_us_stock_rth_now", side_effect=checks):
                    result = await b.run()
                self.assertEqual(result["status"], expected)
                b.place_mock.assert_not_called()

    async def test_wrong_side_reservation_cannot_publish_or_resubmit(self):
        b = BrokerFixture()
        b.close_mode = "missing_exec"
        state = {}
        with b.patches():
            await b.run(state)
            state["2026-11-20:GOOGL:SHREK_1_4"]["side"] = "LONG"
            result = await b.run(state)
        self.assertEqual(result["status"], "invalid_close_quantity")
        b.place_mock.assert_called_once()
        b.deliver.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
