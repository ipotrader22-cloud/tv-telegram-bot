import copy
import asyncio
import sys
import types
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


def install_import_stubs():
    if "requests" not in sys.modules:
        requests = types.ModuleType("requests")
        requests.post = lambda *_args, **_kwargs: None
        sys.modules["requests"] = requests

    if "dotenv" not in sys.modules:
        dotenv = types.ModuleType("dotenv")
        dotenv.load_dotenv = lambda: None
        sys.modules["dotenv"] = dotenv

    if "fastapi" not in sys.modules:
        fastapi = types.ModuleType("fastapi")

        class FastAPI:
            def get(self, _path):
                return lambda fn: fn

            def post(self, _path):
                return lambda fn: fn

            def on_event(self, _name):
                return lambda fn: fn

        fastapi.FastAPI = FastAPI
        fastapi.Request = object
        fastapi.BackgroundTasks = object
        sys.modules["fastapi"] = fastapi

    if "ib_async" not in sys.modules:
        ib_async = types.ModuleType("ib_async")

        class Order:
            def __init__(self, **kwargs):
                for key, value in kwargs.items():
                    setattr(self, key, value)
                self.orderId = getattr(self, "orderId", 0)
                self.permId = getattr(self, "permId", 0)
                self.orderRef = getattr(self, "orderRef", "")
                self.parentId = getattr(self, "parentId", 0)
                self.transmit = getattr(self, "transmit", True)

        class Contract:
            def __init__(self, symbol="", **kwargs):
                self.symbol = symbol
                for key, value in kwargs.items():
                    setattr(self, key, value)

        class IB:
            def __init__(self):
                self.client = SimpleNamespace(getReqId=lambda: 1)

            def isConnected(self):
                return True

            def trades(self):
                return []

            def fills(self):
                return []

            def openTrades(self):
                return []

            def positions(self):
                return []

            def placeOrder(self, _contract, _order):
                return None

        ib_async.IB = IB
        ib_async.Stock = Contract
        ib_async.Future = Contract
        ib_async.LimitOrder = lambda **kwargs: Order(**kwargs)
        ib_async.MarketOrder = lambda **kwargs: Order(**kwargs)
        sys.modules["ib_async"] = ib_async


install_import_stubs()

from bridge import ib_bridge


def edge_payload(setup_id="VIXALE_EDGE:AAPL:60:LONG:1", **overrides):
    payload = {
        "source": "TradingView",
        "payload_version": 2,
        "system_id": "VIXALE_EDGE",
        "setup_id": setup_id,
        "strategy": "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1",
        "variant": "FIONA_LIMIT_PULLBACK_ATR_TARGET",
        "event": "SETUP",
        "symbol": "AAPL",
        "side": "LONG",
        "entry": 100,
        "target": 105,
        "stop": 98,
        "qty": 10,
        "timeframe": "60",
        "target_tif": "GTC",
        "eod_policy": "NO_EOD_CLOSE",
    }
    payload.update(overrides)
    return payload


def managed_edge_row(setup_id="VIXALE_EDGE:AAPL:60:LONG:1"):
    payload = edge_payload(setup_id)
    return {
        "symbol": "AAPL",
        "side": "LONG",
        "qty": 10,
        "entry": 100,
        "target": 105,
        "stop": 98,
        "setup_id": setup_id,
        "system_id": "VIXALE_EDGE",
        "strategy": payload["strategy"],
        "variant": payload["variant"],
        "last_payload": payload,
        "entry_order": {
            "order_id": 100,
            "perm_id": 1100,
            "order_ref": "TVFVG_AAPL_LONG_ENTRY",
            "exec_ids": ["ENTRY-1"],
        },
        "target_order": {
            "order_id": 200,
            "perm_id": 2200,
            "order_ref": "TVFVG_AAPL_LONG_TP",
            "expected_qty": 10,
            "latest_status": "Submitted",
        },
    }


def fake_trade(
    *,
    order_id,
    perm_id,
    order_ref,
    action,
    status,
    filled,
    price,
    symbol="AAPL",
    exec_id="",
    execution_time=None,
):
    fills = []
    if exec_id:
        fills.append(SimpleNamespace(execution=SimpleNamespace(
            execId=exec_id,
            time=execution_time,
        )))
    return SimpleNamespace(
        contract=SimpleNamespace(symbol=symbol),
        order=SimpleNamespace(
            orderId=order_id,
            permId=perm_id,
            orderRef=order_ref,
            action=action,
            totalQuantity=filled,
        ),
        orderStatus=SimpleNamespace(
            status=status,
            filled=filled,
            avgFillPrice=price,
            lastFillPrice=price,
        ),
        fills=fills,
        log=[],
    )


def fake_fill(
    *,
    order_id,
    perm_id,
    exec_id,
    side,
    shares,
    price,
    order_ref="",
    symbol="AAPL",
    execution_time=None,
):
    return SimpleNamespace(
        contract=SimpleNamespace(symbol=symbol),
        execution=SimpleNamespace(
            orderId=order_id,
            permId=perm_id,
            execId=exec_id,
            side=side,
            shares=shares,
            price=price,
            orderRef=order_ref,
            time=execution_time,
        ),
    )


def attach_exact_trade_fills(trade, executions):
    trade.fills = [
        fake_fill(
            order_id=trade.order.orderId,
            perm_id=trade.order.permId,
            exec_id=exec_id,
            side="SLD" if trade.order.action == "SELL" else "BOT",
            shares=qty,
            price=price,
            order_ref=trade.order.orderRef,
            symbol=trade.contract.symbol,
        )
        for exec_id, qty, price in executions
    ]
    return trade


class EdgeClassificationTests(unittest.TestCase):
    def test_edge_precedes_generic_opposite_flip(self):
        self.assertEqual(ib_bridge.classify_strategy_payload(edge_payload()), "VIXALE_EDGE")
        self.assertTrue(ib_bridge.is_vixale_edge_payload(edge_payload()))
        self.assertFalse(ib_bridge.is_opposite_flip_payload(edge_payload()))
        for marker in (
            {"system_id": "VIXALE_EDGE"},
            {"variant": "FIONA_LIMIT_PULLBACK_ATR_TARGET"},
            {"strategy": "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1"},
            {"profile": "AAPL_60_FIONA_LIMIT"},
        ):
            with self.subTest(marker=marker):
                self.assertTrue(ib_bridge.is_vixale_edge_payload(marker))
                self.assertFalse(ib_bridge.is_opposite_flip_payload(marker))

    def test_prime_remains_opposite_flip_with_unchanged_reversal_math(self):
        prime = {"strategy": "SHREK_1_4"}
        self.assertEqual(
            ib_bridge.classify_strategy_payload(prime),
            "VIXALE_PRIME_OPPOSITE_FLIP",
        )
        self.assertTrue(ib_bridge.is_opposite_flip_payload(prime))
        self.assertEqual(
            ib_bridge.opposite_flip_delta_order("SHORT", 100, 100),
            ("SELL", 200, -100, 100),
        )

    def test_watchdog_scope_and_ids_remain_prime_only(self):
        self.assertEqual(ib_bridge.SHREK_EOD_STRATEGY_IDS, {"SHREK", "SHREK_1_4"})
        self.assertTrue(ib_bridge.is_shrek_managed_position({"strategy": "SHREK_1_4"}))
        self.assertFalse(ib_bridge.is_shrek_managed_position(managed_edge_row()))

    def test_edge_never_creates_reversal_close_callback(self):
        result = {
            "position_before_entry": 10,
            "entry_fill_price": 99,
            "order_id": 123,
            "desired_position_after_entry": -10,
        }
        self.assertIsNone(
            ib_bridge.make_reversal_close_fill_payload(
                edge_payload(side="SHORT"),
                result,
            )
        )


class EdgeEntrySafetyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_dry_run = ib_bridge.DRY_RUN
        self.original_monitor = ib_bridge.ENABLE_EXECUTION_FILL_MONITOR
        self.original_target_monitor = ib_bridge.ENABLE_TARGET_FILL_MONITOR
        self.original_rth_block = ib_bridge.BLOCK_MARKET_ENTRIES_OUTSIDE_RTH
        ib_bridge.DRY_RUN = False
        ib_bridge.ENABLE_EXECUTION_FILL_MONITOR = False
        ib_bridge.ENABLE_TARGET_FILL_MONITOR = False
        ib_bridge.BLOCK_MARKET_ENTRIES_OUTSIDE_RTH = False
        self.entry_timing_patcher = patch.object(
            ib_bridge,
            "validate_entry_timing",
            return_value=None,
        )
        self.entry_timing_patcher.start()

    async def asyncTearDown(self):
        self.entry_timing_patcher.stop()
        ib_bridge.DRY_RUN = self.original_dry_run
        ib_bridge.ENABLE_EXECUTION_FILL_MONITOR = self.original_monitor
        ib_bridge.ENABLE_TARGET_FILL_MONITOR = self.original_target_monitor
        ib_bridge.BLOCK_MARKET_ENTRIES_OUTSIDE_RTH = self.original_rth_block

    async def test_flat_edge_submits_market_entry_and_gtc_target(self):
        store = {}
        req_ids = iter([100, 200])
        entry_trade = fake_trade(
            order_id=100,
            perm_id=1100,
            order_ref="TVFVG_AAPL_LONG",
            action="BUY",
            status="Filled",
            filled=10,
            price=100.25,
            exec_id="ENTRY-1",
        )
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        placed_orders = []

        def place_order(_contract, order):
            placed_orders.append(order)
            return entry_trade if len(placed_orders) == 1 else target_trade

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=0.0)),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "wait_for_ib_confirmation", AsyncMock(return_value="")),
            patch.object(ib_bridge, "load_managed_positions", side_effect=lambda: copy.deepcopy(store)),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge, "cancel_open_orders_for_symbol", AsyncMock()) as cancel_orders,
            patch.object(ib_bridge.ib.client, "getReqId", side_effect=lambda: next(req_ids)),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
        ):
            result = await ib_bridge.place_entry_order(edge_payload())

        self.assertEqual(result["action"], "BUY")
        self.assertEqual(result["entry_order_type"], "MARKET")
        self.assertEqual(result["ib_order_qty"], 10)
        self.assertEqual(result["target_order_qty"], 10)
        self.assertEqual(result["target_tif"], "GTC")
        self.assertEqual(getattr(placed_orders[0], "orderType", "MKT"), "MKT")
        self.assertEqual(placed_orders[1].tif, "GTC")
        self.assertEqual(len(placed_orders), 2)
        cancel_orders.assert_not_awaited()
        self.assertEqual(store["AAPL"]["setup_id"], edge_payload()["setup_id"])
        self.assertEqual(store["AAPL"]["target_order"]["order_id"], 200)

    async def test_invalid_edge_target_returns_exact_pending_cancel_without_broker_action(self):
        invalid_payloads = (
            edge_payload(target=None),
            edge_payload(target=0),
            edge_payload(target=float("inf")),
            edge_payload(target=float("nan")),
            edge_payload(target=99),
            edge_payload(side="SHORT", target=101),
        )

        for payload in invalid_payloads:
            with self.subTest(side=payload["side"], target=payload["target"]):
                with (
                    patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
                    patch.object(ib_bridge, "get_position_size", AsyncMock()) as get_position,
                    patch.object(ib_bridge, "qualify_contract", AsyncMock()) as qualify,
                    patch.object(ib_bridge, "cancel_open_orders_for_symbol", AsyncMock()) as cancel_orders,
                    patch.object(ib_bridge.ib, "placeOrder") as place_order,
                ):
                    result = await ib_bridge.place_entry_order(payload)

                self.assertEqual(result["cancel_reason"], "EDGE_TARGET_REQUIRED")
                self.assertEqual(result["cancel_scope"], "PENDING_ONLY")
                self.assertEqual(result["setup_id"], payload["setup_id"])
                self.assertEqual(result["canceled_replaced_orders"], 0)
                cancel_payload = ib_bridge.make_cancel_payload(payload, result)
                self.assertEqual(cancel_payload["event"], "CANCEL")
                self.assertEqual(cancel_payload["reason"], "EDGE_TARGET_REQUIRED")
                self.assertEqual(cancel_payload["cancel_scope"], "PENDING_ONLY")
                self.assertEqual(cancel_payload["setup_id"], payload["setup_id"])
                get_position.assert_not_awaited()
                qualify.assert_not_awaited()
                cancel_orders.assert_not_awaited()
                place_order.assert_not_called()

    async def test_existing_position_blocks_without_order_or_target_cancel(self):
        store = {"AAPL": managed_edge_row("VIXALE_EDGE:AAPL:45:LONG:OLD")}
        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=10.0)),
            patch.object(ib_bridge, "load_managed_positions", return_value=copy.deepcopy(store)),
            patch.object(ib_bridge, "cancel_open_orders_for_symbol", AsyncMock()) as cancel_orders,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.place_entry_order(edge_payload())

        self.assertEqual(result["cancel_reason"], "EDGE_ENTRY_BLOCKED_EXISTING_POSITION")
        self.assertEqual(result["cancel_scope"], "PENDING_ONLY")
        self.assertEqual(result["canceled_replaced_orders"], 0)
        cancel_payload = ib_bridge.make_cancel_payload(edge_payload(), result)
        self.assertEqual(cancel_payload["event"], "CANCEL")
        self.assertEqual(cancel_payload["cancel_scope"], "PENDING_ONLY")
        self.assertEqual(cancel_payload["reason"], "EDGE_ENTRY_BLOCKED_EXISTING_POSITION")
        self.assertEqual(cancel_payload["setup_id"], edge_payload()["setup_id"])
        cancel_orders.assert_not_awaited()
        place_order.assert_not_called()

    async def test_duplicate_setup_blocks_without_order(self):
        payload = edge_payload()
        store = {"AAPL": managed_edge_row(payload["setup_id"])}
        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=10.0)),
            patch.object(ib_bridge, "load_managed_positions", return_value=copy.deepcopy(store)),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.place_entry_order(payload)

        self.assertEqual(result["cancel_reason"], "EDGE_DUPLICATE_ACTIVE_SETUP")
        self.assertEqual(result["setup_id"], payload["setup_id"])
        place_order.assert_not_called()

    async def test_edge_order_is_not_placed_when_identity_persistence_fails(self):
        req_ids = iter([100, 200])
        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=0.0)),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "load_managed_positions", return_value={}),
            patch.object(ib_bridge, "save_managed_positions", return_value=False),
            patch.object(ib_bridge.ib.client, "getReqId", side_effect=lambda: next(req_ids)),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.place_entry_order(edge_payload())

        self.assertEqual(result["cancel_reason"], "EDGE_ENTRY_STATE_PERSISTENCE_FAILED")
        place_order.assert_not_called()

    async def test_parent_submission_is_retained_when_target_placement_throws(self):
        store = {}
        req_ids = iter([100, 200])
        entry_trade = fake_trade(
            order_id=100,
            perm_id=1100,
            order_ref="TVFVG_AAPL_LONG",
            action="BUY",
            status="Submitted",
            filled=0,
            price=0,
        )
        placement_results = iter([entry_trade, RuntimeError("target placement failed")])

        def place_order(_contract, _order):
            result = next(placement_results)
            if isinstance(result, Exception):
                raise result
            return result

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=0.0)),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "load_managed_positions", side_effect=lambda: copy.deepcopy(store)),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge.ib.client, "getReqId", side_effect=lambda: next(req_ids)),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
        ):
            with self.assertRaisesRegex(RuntimeError, "target placement failed"):
                await ib_bridge.place_entry_order(edge_payload())

        self.assertEqual(store["AAPL"]["setup_id"], edge_payload()["setup_id"])
        self.assertEqual(store["AAPL"]["entry_order"]["order_id"], 100)
        self.assertEqual(
            store["AAPL"]["entry_submission_state"],
            "ENTRY_SUBMITTED_TARGET_PLACE_FAILED",
        )


class EdgeStopCloseSafetyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        ib_bridge._edge_stop_close_lock = asyncio.Lock()

    def close_trade(self, status="Filled", filled=10):
        return fake_trade(
            order_id=300,
            perm_id=3300,
            order_ref="TVFVG_CLOSE_AAPL",
            action="SELL",
            status=status,
            filled=filled,
            price=97.25 if filled else 0,
            exec_id="STOP-CLOSE-1" if filled else "",
        )

    async def run_immediate_edge_close(self, flat_result):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        render_payloads = []
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        async def forward(payload_to_render):
            render_payloads.append(copy.deepcopy(payload_to_render))
            return {"forwarded": True, "status_code": 200}

        def cancel_order(_order):
            target_trade.orderStatus.status = "Cancelled"

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "CANCEL_ORPHAN_TARGETS_AFTER_FLAT", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=10.0)),
            patch.object(ib_bridge, "cancel_open_orders_for_symbol", AsyncMock()) as broad_cancel,
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(ib_bridge, "wait_for_ib_confirmation", AsyncMock(return_value="")),
            patch.object(ib_bridge.ib, "trades", return_value=[target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=cancel_order,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder", return_value=self.close_trade()),
            patch.object(
                ib_bridge,
                "verify_position_flat",
                AsyncMock(return_value=flat_result),
            ) as verify_flat,
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
        ):
            result = await ib_bridge.close_position_market(payload)
            with patch.object(
                ib_bridge,
                "handle_ib_action",
                AsyncMock(return_value=result),
            ):
                await ib_bridge.process_signal_background(payload)

        return result, store, render_payloads, verify_flat, broad_cancel

    async def test_immediate_edge_stop_fill_flat_publishes_once(self):
        result, store, render_payloads, verify_flat, broad_cancel = (
            await self.run_immediate_edge_close((True, 0.0))
        )

        self.assertEqual(result["status"], "submitted")
        self.assertTrue(result["broker_confirmed_flat"])
        self.assertEqual(result["position_after_close"], 0.0)
        verify_flat.assert_awaited_once_with(
            "AAPL",
            ib_bridge.FORCE_EOD_POSITION_VERIFY_SECONDS,
        )
        self.assertEqual(len(render_payloads), 1)
        self.assertEqual(render_payloads[0]["event"], "CLOSE_STOP")
        self.assertTrue(render_payloads[0]["broker_confirmed_flat"])
        self.assertNotIn("AAPL", store)
        broad_cancel.assert_not_awaited()

    async def test_immediate_edge_stop_fill_nonflat_withholds_public_close(self):
        result, store, render_payloads, _verify_flat, broad_cancel = (
            await self.run_immediate_edge_close((False, 3.0))
        )

        self.assertEqual(result["status"], "EDGE_STOP_CLOSE_POSITION_NOT_FLAT")
        self.assertFalse(result["broker_confirmed_flat"])
        self.assertEqual(result["position_after_close"], 3.0)
        self.assertEqual(render_payloads, [])
        self.assertIn("AAPL", store)
        close_state = store["AAPL"]["bridge_close_order"]
        self.assertEqual(close_state["order_id"], 300)
        self.assertEqual(
            close_state["bridge_status"],
            "EDGE_STOP_CLOSE_POSITION_NOT_FLAT",
        )
        self.assertEqual(close_state["position_after_close"], 3.0)
        broad_cancel.assert_not_awaited()

    async def run_monitored_edge_close(self, flat_result):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        render_payloads = []
        base_result = {
            "dry_run": False,
            "status": "submitted_awaiting_close_fill",
            "action": "SELL",
            "symbol": "AAPL",
            "side": "LONG",
            "qty": 10,
            "position_before_close": 10,
            "order_ref": "TVFVG_CLOSE_AAPL",
            "order_id": 300,
            "close_filled": False,
        }

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        async def forward(payload_to_render):
            render_payloads.append(copy.deepcopy(payload_to_render))
            return {"forwarded": True, "status_code": 200}

        with (
            patch.object(ib_bridge, "CANCEL_ORPHAN_TARGETS_AFTER_FLAT", False),
            patch.object(
                ib_bridge,
                "verify_position_flat",
                AsyncMock(return_value=flat_result),
            ) as verify_flat,
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
        ):
            await ib_bridge.monitor_close_fill_confirmation(
                original_data=payload,
                close_trade=self.close_trade(),
                base_result=base_result,
                symbol="AAPL",
                side="LONG",
                expected_close_qty=10,
                fallback_price=98,
            )

        return store, render_payloads, verify_flat

    async def test_monitored_edge_stop_fill_flat_publishes_once(self):
        store, render_payloads, verify_flat = await self.run_monitored_edge_close(
            (True, 0.0)
        )

        verify_flat.assert_awaited_once_with(
            "AAPL",
            ib_bridge.FORCE_EOD_POSITION_VERIFY_SECONDS,
        )
        self.assertEqual(len(render_payloads), 1)
        self.assertEqual(render_payloads[0]["event"], "CLOSE_STOP")
        self.assertTrue(render_payloads[0]["broker_confirmed_flat"])
        self.assertEqual(render_payloads[0]["position_after_close"], 0.0)
        self.assertNotIn("AAPL", store)

    async def test_monitored_edge_stop_fill_nonflat_withholds_public_close(self):
        store, render_payloads, _verify_flat = await self.run_monitored_edge_close(
            (False, -2.0)
        )

        self.assertEqual(render_payloads, [])
        self.assertIn("AAPL", store)
        close_state = store["AAPL"]["bridge_close_order"]
        self.assertEqual(close_state["order_id"], 300)
        self.assertEqual(
            close_state["bridge_status"],
            "EDGE_STOP_CLOSE_POSITION_NOT_FLAT",
        )
        self.assertEqual(close_state["position_after_close"], -2.0)
        self.assertFalse(close_state["broker_confirmed_flat"])

    async def test_prime_close_behavior_does_not_require_edge_flat_gate(self):
        prime_payload = {
            "strategy": "SHREK_1_4",
            "event": "CLOSE_STOP",
            "symbol": "AAPL",
            "side": "LONG",
            "entry": 100,
            "qty": 10,
        }
        render_payloads = []

        async def forward(payload_to_render):
            render_payloads.append(copy.deepcopy(payload_to_render))
            return {"forwarded": True, "status_code": 200}

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "CANCEL_ORPHAN_TARGETS_AFTER_FLAT", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=10.0)),
            patch.object(ib_bridge, "cancel_open_orders_for_symbol", AsyncMock(return_value=1)),
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(ib_bridge, "wait_for_ib_confirmation", AsyncMock(return_value="")),
            patch.object(ib_bridge.ib, "placeOrder", return_value=self.close_trade()),
            patch.object(ib_bridge, "verify_position_flat", AsyncMock()) as verify_flat,
            patch.object(ib_bridge, "load_managed_positions", return_value={}),
            patch.object(ib_bridge, "save_managed_positions", return_value=True),
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
        ):
            result = await ib_bridge.close_position_market(prime_payload)
            with patch.object(
                ib_bridge,
                "handle_ib_action",
                AsyncMock(return_value=result),
            ):
                await ib_bridge.process_signal_background(prime_payload)

        self.assertEqual(result["status"], "submitted")
        self.assertNotIn("broker_confirmed_flat", result)
        verify_flat.assert_not_awaited()
        self.assertEqual(len(render_payloads), 1)
        self.assertEqual(render_payloads[0]["event"], "CLOSE_STOP")

    async def test_target_fill_during_cancel_submits_no_market_close_and_reconciles_tp(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        render_payloads = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def fill_during_cancel(_order):
            target_trade.orderStatus.status = "Filled"
            target_trade.orderStatus.filled = 10
            target_trade.orderStatus.avgFillPrice = 105.4
            target_trade.fills = [
                SimpleNamespace(
                    execution=SimpleNamespace(
                        execId="TARGET-RACE-1",
                        time=datetime(2026, 7, 28, 19, 30, tzinfo=timezone.utc),
                    )
                )
            ]

        async def forward(payload_to_render):
            render_payloads.append(copy.deepcopy(payload_to_render))
            return {"forwarded": True, "status_code": 200}

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=0.0)),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge.ib, "trades", return_value=[target_trade]),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=fill_during_cancel,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
            patch.object(ib_bridge, "cleanup_orphan_targets_if_flat", AsyncMock(return_value={})),
        ):
            close_result = await ib_bridge.close_position_market(payload)
            reconcile_result = await ib_bridge.reconcile_managed_target_fills_once()

        self.assertEqual(close_result["status"], "TARGET_FILLED_POSITION_FLAT")
        place_order.assert_not_called()
        self.assertEqual(reconcile_result["reported"], 1)
        self.assertEqual(len(render_payloads), 1)
        self.assertEqual(render_payloads[0]["event"], "TP")
        self.assertEqual(render_payloads[0]["price"], 105.4)

    async def test_target_cancel_unconfirmed_submits_no_market_close(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "FORCE_EOD_CANCEL_VERIFY_SECONDS", 0.10),
            patch.object(ib_bridge, "FORCE_EOD_VERIFY_POLL_SECONDS", 0.10),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge, "cancel_open_orders_for_symbol", AsyncMock()) as broad_cancel,
            patch.object(ib_bridge.ib, "trades", return_value=[target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(ib_bridge.ib, "cancelOrder", create=True),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
            patch.object(ib_bridge.asyncio, "sleep", AsyncMock()),
        ):
            result = await ib_bridge.close_position_market(payload)

        self.assertEqual(result["status"], "EDGE_STOP_TARGET_CANCEL_UNCONFIRMED")
        place_order.assert_not_called()
        broad_cancel.assert_not_awaited()
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "TARGET_CANCEL_UNCONFIRMED",
        )

    async def test_partial_target_fill_closes_only_remaining_broker_quantity(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
            exec_id="TARGET-PARTIAL-1",
        )
        close_trade = fake_trade(
            order_id=301,
            perm_id=3301,
            order_ref="TVFVG_CLOSE_AAPL_PARTIAL",
            action="SELL",
            status="Filled",
            filled=7,
            price=97.1,
            exec_id="STOP-PARTIAL-1",
        )
        placed_orders = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def partial_fill_then_cancel(_order):
            target_trade.orderStatus.status = "Cancelled"
            target_trade.orderStatus.filled = 3
            target_trade.orderStatus.avgFillPrice = 105.2

        def place_order(_contract, order):
            placed_orders.append(order)
            return close_trade

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "CANCEL_ORPHAN_TARGETS_AFTER_FLAT", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=7.0)),
            patch.object(ib_bridge, "verify_position_flat", AsyncMock(return_value=(True, 0.0))),
            patch.object(ib_bridge, "wait_for_ib_confirmation", AsyncMock(return_value="")),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge.ib, "trades", return_value=[target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=partial_fill_then_cancel,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
        ):
            result = await ib_bridge.close_position_market(payload)

        self.assertEqual(result["status"], "submitted")
        self.assertEqual(result["qty"], 7)
        self.assertEqual(result["position_before_close"], 7.0)
        self.assertEqual(len(placed_orders), 1)
        self.assertEqual(placed_orders[0].totalQuantity, 7)
        self.assertEqual(result["public_close_qty"], 10)
        self.assertEqual(result["public_close_price"], 99.53)
        self.assertEqual(
            result["reason"],
            "IB_STOP_CLOSE_WITH_PARTIAL_TARGET_EXECUTION_CONFIRMED",
        )
        self.assertEqual(
            result["mixed_exit_exec_ids"],
            ["STOP-PARTIAL-1", "TARGET-PARTIAL-1"],
        )

    async def test_partial_target_waits_for_position_sync_before_sizing_close(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
            exec_id="TARGET-PARTIAL-3",
        )
        close_trade = fake_trade(
            order_id=304,
            perm_id=3304,
            order_ref=ib_bridge.edge_stop_close_order_ref(
                "AAPL",
                payload["setup_id"],
            ),
            action="SELL",
            status="Filled",
            filled=7,
            price=98,
            exec_id="STOP-REMAINDER-7",
        )
        placed_orders = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def cancel_order(_order):
            target_trade.orderStatus.status = "Cancelled"
            target_trade.orderStatus.filled = 3
            target_trade.orderStatus.avgFillPrice = 105

        def place_order(_contract, order):
            placed_orders.append(order)
            return close_trade

        positions = AsyncMock(side_effect=[10.0, 7.0])
        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "CANCEL_ORPHAN_TARGETS_AFTER_FLAT", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(ib_bridge, "get_position_size", positions),
            patch.object(
                ib_bridge,
                "verify_position_flat",
                AsyncMock(return_value=(True, 0.0)),
            ),
            patch.object(
                ib_bridge,
                "wait_for_ib_confirmation",
                AsyncMock(return_value=""),
            ),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(ib_bridge.ib, "trades", return_value=[target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=cancel_order,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
            patch.object(ib_bridge.asyncio, "sleep", AsyncMock()),
        ):
            result = await ib_bridge.close_position_market(payload)

        self.assertEqual(result["status"], "submitted")
        self.assertEqual(result["expected_remaining_qty"], 7)
        self.assertEqual(result["confirmed_remaining_qty"], 7)
        self.assertEqual(result["qty"], 7)
        self.assertEqual(len(placed_orders), 1)
        self.assertEqual(placed_orders[0].totalQuantity, 7)
        self.assertEqual(positions.await_count, 2)
        self.assertEqual(result["public_close_qty"], 10)
        self.assertEqual(result["public_close_price"], 100.1)

    async def test_partial_target_stale_position_submits_no_close(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
            exec_id="TARGET-PARTIAL-STALE",
        )

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def cancel_order(_order):
            target_trade.orderStatus.status = "Cancelled"
            target_trade.orderStatus.filled = 3
            target_trade.orderStatus.avgFillPrice = 105

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "EDGE_STOP_POSITION_SYNC_SECONDS", 0.10),
            patch.object(ib_bridge, "FORCE_EOD_VERIFY_POLL_SECONDS", 0.10),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(
                ib_bridge,
                "get_position_size",
                AsyncMock(return_value=10.0),
            ),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(ib_bridge.ib, "trades", return_value=[target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=cancel_order,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
            patch.object(ib_bridge.asyncio, "sleep", AsyncMock()),
        ):
            result = await ib_bridge.close_position_market(payload)

        self.assertEqual(
            result["status"],
            "EDGE_STOP_POSITION_SYNC_UNCONFIRMED",
        )
        self.assertEqual(result["target_partial_filled_qty"], 3)
        self.assertEqual(result["expected_remaining_qty"], 7)
        self.assertEqual(result["confirmed_remaining_qty"], 10)
        place_order.assert_not_called()
        self.assertIn("AAPL", store)
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "POSITION_SYNC_UNCONFIRMED",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["attempt"],
            1,
            "a stale position consumes no broker close attempt",
        )

    async def test_stale_setup_id_mismatch_has_no_broker_activity(self):
        payload = edge_payload(
            setup_id="VIXALE_EDGE:AAPL:60:LONG:STALE",
            event="CLOSE_STOP",
        )
        store = {"AAPL": managed_edge_row("VIXALE_EDGE:AAPL:60:LONG:ACTIVE")}
        with (
            patch.object(ib_bridge, "load_managed_positions", return_value=copy.deepcopy(store)),
            patch.object(ib_bridge, "save_managed_positions") as save_managed,
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()) as ensure_connected,
            patch.object(ib_bridge, "qualify_contract", AsyncMock()) as qualify,
            patch.object(ib_bridge, "cancel_open_orders_for_symbol", AsyncMock()) as broad_cancel,
            patch.object(ib_bridge.ib, "cancelOrder", create=True) as cancel_order,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.close_position_market(payload)

        self.assertEqual(result["status"], "EDGE_STOP_SETUP_MISMATCH")
        ensure_connected.assert_not_awaited()
        qualify.assert_not_awaited()
        save_managed.assert_not_called()
        broad_cancel.assert_not_awaited()
        cancel_order.assert_not_called()
        place_order.assert_not_called()

    async def test_concurrent_duplicate_close_submits_one_market_order(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        close_trade = fake_trade(
            order_id=302,
            perm_id=3302,
            order_ref=ib_bridge.edge_stop_close_order_ref("AAPL", payload["setup_id"]),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        placed_orders = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def cancel_order(_order):
            target_trade.orderStatus.status = "Cancelled"

        def place_order(_contract, order):
            placed_orders.append(order)
            return close_trade

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "ENABLE_EXECUTION_FILL_MONITOR", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=10.0)),
            patch.object(ib_bridge, "wait_for_ib_confirmation", AsyncMock(return_value="")),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge.ib, "trades", side_effect=lambda: [target_trade, close_trade] if placed_orders else [target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=cancel_order,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
        ):
            first, second = await asyncio.gather(
                ib_bridge.handle_ib_action(payload),
                ib_bridge.handle_ib_action(payload),
            )

        self.assertEqual(len(placed_orders), 1)
        self.assertIn(first["status"], {"submitted_awaiting_close_fill", "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS"})
        self.assertIn(second["status"], {"submitted_awaiting_close_fill", "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS"})

    async def test_duplicate_after_restart_recovers_close_without_second_order(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        close_trade = fake_trade(
            order_id=303,
            perm_id=3303,
            order_ref=ib_bridge.edge_stop_close_order_ref("AAPL", payload["setup_id"]),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        placed_orders = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def cancel_order(_order):
            target_trade.orderStatus.status = "Cancelled"

        def place_order(_contract, order):
            placed_orders.append(order)
            return close_trade

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "ENABLE_EXECUTION_FILL_MONITOR", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=10.0)),
            patch.object(ib_bridge, "wait_for_ib_confirmation", AsyncMock(return_value="")),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge.ib, "trades", side_effect=lambda: [target_trade, close_trade] if placed_orders else [target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=cancel_order,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
        ):
            first = await ib_bridge.close_position_market(payload)
            second = await ib_bridge.close_position_market(payload)

        self.assertEqual(first["status"], "submitted_awaiting_close_fill")
        self.assertEqual(second["status"], "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS")
        self.assertEqual(len(placed_orders), 1)
        self.assertEqual(second["order_id"], 303)

    def recovery_store(self, state="CLOSE_SUBMISSION_PENDING"):
        payload = edge_payload(event="CLOSE_STOP")
        row = managed_edge_row()
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                payload["setup_id"],
            ),
            "setup_id": payload["setup_id"],
            "event": "CLOSE_STOP",
            "state": state,
            "order_ref": ib_bridge.edge_stop_close_order_ref(
                "AAPL",
                payload["setup_id"],
            ),
            "attempt": 1,
            "remaining_qty": 10,
            "position_before_close": 10,
        }
        return payload, {"AAPL": row}

    async def run_recovery_case(
        self,
        refresh_results,
        *,
        replacement_trade=None,
        retries=1,
        scheduler=False,
    ):
        payload, store = self.recovery_store()
        placed_orders = []
        refresh_mock = AsyncMock(side_effect=refresh_results)

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def place_order(_contract, order):
            placed_orders.append(order)
            return replacement_trade

        async def bounded(method_name, *_args):
            self.assertEqual(method_name, "reqPositionsAsync")
            return {
                "supported": True,
                "ok": True,
                "values": [
                    SimpleNamespace(
                        contract=SimpleNamespace(symbol="AAPL"),
                        position=10,
                    )
                ],
                "error": "",
            }

        results = []
        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", True),
            patch.object(ib_bridge, "is_us_stock_rth_now", return_value=True),
            patch.object(ib_bridge, "ENABLE_EXECUTION_FILL_MONITOR", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                refresh_mock,
            ),
            patch.object(
                ib_bridge,
                "bounded_ib_refresh_request",
                side_effect=bounded,
            ),
            patch.object(
                ib_bridge,
                "get_position_size",
                AsyncMock(return_value=10.0),
            ),
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(
                ib_bridge,
                "wait_for_ib_confirmation",
                AsyncMock(return_value=""),
            ),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
        ):
            for _index in range(retries):
                if scheduler:
                    results.append(
                        await ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )
                else:
                    results.append(
                        await ib_bridge.close_position_market(payload)
                    )

        return results, store, placed_orders

    async def test_pending_crash_recovers_with_one_authoritative_replacement(self):
        replacement = fake_trade(
            order_id=401,
            perm_id=4401,
            order_ref=ib_bridge.edge_stop_close_attempt_order_ref(
                "AAPL",
                edge_payload()["setup_id"],
                2,
            ),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        no_order = {
            "authoritative": True,
            "ambiguous": False,
            "trade": None,
            "execution": None,
            "position": 10,
            "position_authoritative": True,
            "matching_trade_count": 0,
            "errors": [],
        }
        accepted = {
            **no_order,
            "trade": replacement,
            "matching_trade_count": 1,
        }
        results, store, placed_orders = await self.run_recovery_case(
            [no_order, accepted],
            replacement_trade=replacement,
            retries=2,
            scheduler=True,
        )

        self.assertEqual(
            [result["status"] for result in results],
            [
                "submitted_awaiting_close_fill",
                "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
            ],
        )
        self.assertEqual(len(placed_orders), 1)
        self.assertEqual(placed_orders[0].totalQuantity, 10)
        self.assertEqual(
            store["AAPL"]["close_reservation"]["attempt"],
            2,
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["order_id"],
            401,
        )

    async def test_authoritative_recovery_refreshes_all_available_ib_sources(self):
        payload, store = self.recovery_store()
        row = store["AAPL"]
        reservation = row["close_reservation"]
        accepted_trade = fake_trade(
            order_id=405,
            perm_id=4405,
            order_ref=reservation["order_ref"],
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        positions = [
            SimpleNamespace(
                contract=SimpleNamespace(symbol="AAPL"),
                position=10,
            )
        ]

        with (
            patch.object(ib_bridge.ib, "trades", return_value=[]),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "reqAllOpenOrdersAsync",
                AsyncMock(return_value=[accepted_trade]),
                create=True,
            ) as open_orders,
            patch.object(
                ib_bridge.ib,
                "reqCompletedOrdersAsync",
                AsyncMock(return_value=[]),
                create=True,
            ) as completed_orders,
            patch.object(
                ib_bridge.ib,
                "reqExecutionsAsync",
                AsyncMock(return_value=[]),
                create=True,
            ) as executions,
            patch.object(
                ib_bridge.ib,
                "reqPositionsAsync",
                AsyncMock(return_value=positions),
                create=True,
            ) as refreshed_positions,
        ):
            refresh = await ib_bridge.authoritative_edge_close_refresh(
                row,
                reservation,
            )

        self.assertTrue(refresh["authoritative"])
        self.assertFalse(refresh["ambiguous"])
        self.assertIs(refresh["trade"], accepted_trade)
        self.assertEqual(refresh["position"], 10)
        open_orders.assert_awaited_once_with()
        completed_orders.assert_awaited_once_with(False)
        executions.assert_awaited_once_with()
        refreshed_positions.assert_awaited_once_with()

    async def test_accepted_close_before_crash_is_recovered_without_replacement(self):
        accepted_trade = fake_trade(
            order_id=402,
            perm_id=4402,
            order_ref=ib_bridge.edge_stop_close_order_ref(
                "AAPL",
                edge_payload()["setup_id"],
            ),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        refresh = {
            "authoritative": True,
            "ambiguous": False,
            "trade": accepted_trade,
            "execution": None,
            "position": 10,
            "position_authoritative": True,
            "matching_trade_count": 1,
            "errors": [],
        }
        results, store, placed_orders = await self.run_recovery_case(
            [refresh],
            scheduler=True,
        )

        self.assertEqual(
            results[0]["status"],
            "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
        )
        self.assertEqual(placed_orders, [])
        self.assertEqual(
            store["AAPL"]["close_reservation"]["order_id"],
            402,
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["perm_id"],
            4402,
        )

    async def test_close_submitted_filled_flat_moves_to_reconciliation(self):
        payload, store = self.recovery_store(state="CLOSE_SUBMITTED")
        reservation = store["AAPL"]["close_reservation"]
        close = fake_trade(
            order_id=421,
            perm_id=4421,
            order_ref=reservation["order_ref"],
            action="SELL",
            status="Filled",
            filled=10,
            price=97.85,
            exec_id="STOP-TERMINAL-FLAT",
        )

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value={
                    "authoritative": True,
                    "ambiguous": False,
                    "trade": close,
                    "execution": {
                        "qty": 10,
                        "price": 97.85,
                        "exec_ids": ["STOP-TERMINAL-FLAT"],
                    },
                    "position": 0,
                    "position_authoritative": True,
                    "matching_trade_count": 1,
                    "trades": [close],
                    "fills": [],
                    "errors": [],
                }),
            ),
            patch.object(
                ib_bridge,
                "submit_edge_stop_recovery_replacement",
                AsyncMock(),
            ) as replacement,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await (
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )

        self.assertEqual(
            result["status"],
            "POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["close_exec_ids"],
            ["STOP-TERMINAL-FLAT"],
        )
        replacement.assert_not_awaited()
        place_order.assert_not_called()

    async def test_close_submitted_filled_nonflat_arms_residual_recovery(self):
        payload, store = self.recovery_store(state="CLOSE_SUBMITTED")
        reservation = store["AAPL"]["close_reservation"]
        close = fake_trade(
            order_id=422,
            perm_id=4422,
            order_ref=reservation["order_ref"],
            action="SELL",
            status="Filled",
            filled=7,
            price=97.9,
            exec_id="STOP-TERMINAL-NONFLAT",
        )
        reservation.update({
            "remaining_qty": 7,
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_exec_ids": ["TARGET-TERMINAL-3"],
        })

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value={
                    "authoritative": True,
                    "ambiguous": False,
                    "trade": close,
                    "execution": {
                        "qty": 7,
                        "price": 97.9,
                        "exec_ids": ["STOP-TERMINAL-NONFLAT"],
                    },
                    "position": 2,
                    "position_authoritative": True,
                    "matching_trade_count": 1,
                    "trades": [close],
                    "fills": [],
                    "errors": [],
                }),
            ),
            patch.object(
                ib_bridge,
                "submit_edge_stop_recovery_replacement",
                AsyncMock(),
            ) as replacement,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await (
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )

        self.assertEqual(result["status"], "FILLED_POSITION_NOT_FLAT")
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "FILLED_POSITION_NOT_FLAT",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["close_exec_ids"],
            ["STOP-TERMINAL-NONFLAT"],
        )
        replacement.assert_not_awaited()
        place_order.assert_not_called()

    async def test_close_submitted_terminal_rejections_transition_read_only(self):
        for close_status in (
            "Rejected",
            "Cancelled",
            "ApiCancelled",
            "Inactive",
        ):
            with self.subTest(close_status=close_status):
                payload, store = self.recovery_store(
                    state="CLOSE_SUBMITTED"
                )
                reservation = store["AAPL"]["close_reservation"]
                close = fake_trade(
                    order_id=423,
                    perm_id=4423,
                    order_ref=reservation["order_ref"],
                    action="SELL",
                    status=close_status,
                    filled=0,
                    price=0,
                )

                def load_managed():
                    return copy.deepcopy(store)

                def save_managed(value):
                    store.clear()
                    store.update(copy.deepcopy(value))
                    return True

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "save_managed_positions",
                        side_effect=save_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "authoritative_edge_close_refresh",
                        AsyncMock(return_value={
                            "authoritative": True,
                            "ambiguous": False,
                            "trade": close,
                            "execution": None,
                            "position": 10,
                            "position_authoritative": True,
                            "matching_trade_count": 1,
                            "trades": [close],
                            "fills": [],
                            "errors": [],
                        }),
                    ),
                    patch.object(
                        ib_bridge,
                        "submit_edge_stop_recovery_replacement",
                        AsyncMock(),
                    ) as replacement,
                    patch.object(ib_bridge.ib, "placeOrder") as place_order,
                ):
                    result = await (
                        ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )

                self.assertEqual(
                    result["status"],
                    "EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN",
                )
                self.assertEqual(
                    store["AAPL"]["close_reservation"]["state"],
                    "EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN",
                )
                replacement.assert_not_awaited()
                place_order.assert_not_called()

    async def test_close_submitted_working_statuses_remain_in_progress(self):
        for close_status in (
            "Submitted",
            "PreSubmitted",
            "PendingSubmit",
        ):
            with self.subTest(close_status=close_status):
                payload, store = self.recovery_store(
                    state="CLOSE_SUBMITTED"
                )
                reservation = store["AAPL"]["close_reservation"]
                close = fake_trade(
                    order_id=424,
                    perm_id=4424,
                    order_ref=reservation["order_ref"],
                    action="SELL",
                    status=close_status,
                    filled=0,
                    price=0,
                )

                def load_managed():
                    return copy.deepcopy(store)

                def save_managed(value):
                    store.clear()
                    store.update(copy.deepcopy(value))
                    return True

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "save_managed_positions",
                        side_effect=save_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "authoritative_edge_close_refresh",
                        AsyncMock(return_value={
                            "authoritative": True,
                            "ambiguous": False,
                            "trade": close,
                            "execution": None,
                            "position": 10,
                            "position_authoritative": True,
                            "matching_trade_count": 1,
                            "trades": [close],
                            "fills": [],
                            "errors": [],
                        }),
                    ),
                    patch.object(ib_bridge.ib, "placeOrder") as place_order,
                ):
                    result = await (
                        ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )

                self.assertEqual(
                    result["status"],
                    "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
                )
                self.assertEqual(
                    store["AAPL"]["close_reservation"]["state"],
                    "CLOSE_SUBMITTED",
                )
                place_order.assert_not_called()

    async def test_close_submitted_unreliable_evidence_becomes_ambiguous(self):
        for authoritative, ambiguous in (
            (False, False),
            (True, True),
        ):
            with self.subTest(
                authoritative=authoritative,
                ambiguous=ambiguous,
            ):
                payload, store = self.recovery_store(
                    state="CLOSE_SUBMITTED"
                )

                def load_managed():
                    return copy.deepcopy(store)

                def save_managed(value):
                    store.clear()
                    store.update(copy.deepcopy(value))
                    return True

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "save_managed_positions",
                        side_effect=save_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "authoritative_edge_close_refresh",
                        AsyncMock(return_value={
                            "authoritative": authoritative,
                            "ambiguous": ambiguous,
                            "trade": None,
                            "execution": None,
                            "position": 10,
                            "position_authoritative": authoritative,
                            "matching_trade_count": 0,
                            "errors": ["history_unreliable"],
                        }),
                    ),
                    patch.object(ib_bridge.ib, "placeOrder") as place_order,
                ):
                    result = await (
                        ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )

                self.assertEqual(
                    result["status"],
                    "EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS",
                )
                self.assertEqual(
                    store["AAPL"]["close_reservation"]["state"],
                    "EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS",
                )
                place_order.assert_not_called()

    async def test_rejected_close_gets_only_one_controlled_replacement(self):
        rejected_trade = fake_trade(
            order_id=403,
            perm_id=4403,
            order_ref=ib_bridge.edge_stop_close_order_ref(
                "AAPL",
                edge_payload()["setup_id"],
            ),
            action="SELL",
            status="Rejected",
            filled=0,
            price=0,
        )
        replacement = fake_trade(
            order_id=404,
            perm_id=4404,
            order_ref=ib_bridge.edge_stop_close_attempt_order_ref(
                "AAPL",
                edge_payload()["setup_id"],
                2,
            ),
            action="SELL",
            status="Rejected",
            filled=0,
            price=0,
        )
        rejected_refresh = {
            "authoritative": True,
            "ambiguous": False,
            "trade": rejected_trade,
            "execution": None,
            "position": 10,
            "position_authoritative": True,
            "matching_trade_count": 1,
            "errors": [],
        }
        replacement_refresh = {
            **rejected_refresh,
            "trade": replacement,
        }
        results, store, placed_orders = await self.run_recovery_case(
            [rejected_refresh, replacement_refresh],
            replacement_trade=replacement,
            retries=2,
            scheduler=True,
        )

        self.assertEqual(
            results[0]["status"],
            "EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN",
        )
        self.assertEqual(
            results[1]["status"],
            "EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN",
        )
        self.assertEqual(len(placed_orders), 1)
        self.assertEqual(
            store["AAPL"]["close_reservation"]["attempt"],
            2,
        )
        self.assertEqual(
            [attempt["attempt"] for attempt in store["AAPL"]["close_attempts"]],
            [1, 2],
        )
        self.assertEqual(
            store["AAPL"]["close_attempts"][0]["status"],
            "Rejected",
        )

    async def test_ambiguous_recovery_submits_no_replacement(self):
        refresh = {
            "authoritative": False,
            "ambiguous": True,
            "trade": None,
            "execution": None,
            "position": 10,
            "position_authoritative": False,
            "matching_trade_count": 2,
            "errors": ["ambiguous"],
        }
        results, store, placed_orders = await self.run_recovery_case(
            [refresh],
            scheduler=True,
        )

        self.assertEqual(
            results[0]["status"],
            "EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS",
        )
        self.assertEqual(placed_orders, [])
        self.assertIn("AAPL", store)
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS",
        )

    async def test_scheduler_recovers_pending_reservation_without_new_alert(self):
        payload, store = self.recovery_store()
        placed_orders = []
        replacement = fake_trade(
            order_id=411,
            perm_id=4411,
            order_ref=ib_bridge.edge_stop_close_attempt_order_ref(
                "AAPL",
                payload["setup_id"],
                2,
            ),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        no_order = {
            "authoritative": True,
            "ambiguous": False,
            "trade": None,
            "execution": None,
            "position": 10,
            "position_authoritative": True,
            "matching_trade_count": 0,
            "errors": [],
        }
        accepted = {
            **no_order,
            "trade": replacement,
            "matching_trade_count": 1,
        }

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def place_order(_contract, order):
            placed_orders.append(order)
            return replacement

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", True),
            patch.object(ib_bridge, "is_us_stock_rth_now", return_value=True),
            patch.object(ib_bridge, "ENABLE_EXECUTION_FILL_MONITOR", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(side_effect=[no_order, accepted]),
            ),
            patch.object(
                ib_bridge,
                "get_position_size",
                AsyncMock(return_value=10.0),
            ),
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(
                ib_bridge,
                "wait_for_ib_confirmation",
                AsyncMock(return_value=""),
            ),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(ib_bridge.ib, "placeOrder", side_effect=place_order),
            patch.object(ib_bridge, "forward_to_render", AsyncMock()) as forward,
        ):
            first = await ib_bridge.reconcile_managed_target_fills_once()
            second = await ib_bridge.reconcile_managed_target_fills_once()

        self.assertEqual(len(placed_orders), 1)
        self.assertEqual(placed_orders[0].totalQuantity, 10)
        self.assertEqual(
            first["details"][0]["status"],
            "submitted_awaiting_close_fill",
        )
        self.assertEqual(
            second["details"][0]["status"],
            "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["order_id"],
            411,
        )
        forward.assert_not_awaited()

    async def test_partial_target_recovery_waits_for_confirmed_remaining_qty(self):
        payload, store = self.recovery_store(state="CLOSE_SUBMISSION_PENDING")
        store["AAPL"]["close_reservation"].update({
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-3"],
            "expected_remaining_qty": 7,
        })
        placed_orders = []
        replacement = fake_trade(
            order_id=412,
            perm_id=4412,
            order_ref=ib_bridge.edge_stop_close_attempt_order_ref(
                "AAPL",
                payload["setup_id"],
                2,
            ),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        refresh = {
            "authoritative": True,
            "ambiguous": False,
            "trade": None,
            "execution": None,
            "position": 10,
            "position_authoritative": True,
            "matching_trade_count": 0,
            "errors": [],
        }

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "ENABLE_EXECUTION_FILL_MONITOR", False),
            patch.object(ib_bridge, "EDGE_STOP_POSITION_SYNC_SECONDS", 0.20),
            patch.object(ib_bridge, "FORCE_EOD_VERIFY_POLL_SECONDS", 0.10),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value=refresh),
            ),
            patch.object(
                ib_bridge,
                "get_position_size",
                AsyncMock(side_effect=[10.0, 10.0, 7.0]),
            ),
            patch.object(ib_bridge.asyncio, "sleep", AsyncMock()),
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(
                ib_bridge,
                "wait_for_ib_confirmation",
                AsyncMock(return_value=""),
            ),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge.ib,
                "placeOrder",
                side_effect=lambda _contract, order: (
                    placed_orders.append(order) or replacement
                ),
            ),
        ):
            result = await ib_bridge.recover_reserved_edge_stop_close(
                payload,
                {
                    "row": copy.deepcopy(store["AAPL"]),
                    "reservation": copy.deepcopy(
                        store["AAPL"]["close_reservation"]
                    ),
                },
            )

        self.assertEqual(result["status"], "submitted_awaiting_close_fill")
        self.assertEqual(len(placed_orders), 1)
        self.assertEqual(placed_orders[0].totalQuantity, 7)

    async def test_partial_target_recovery_with_stale_position_submits_no_order(self):
        payload, store = self.recovery_store(state="CLOSE_SUBMISSION_PENDING")
        store["AAPL"]["close_reservation"].update({
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-3"],
            "expected_remaining_qty": 7,
        })
        refresh = {
            "authoritative": True,
            "ambiguous": False,
            "trade": None,
            "execution": None,
            "position": 10,
            "position_authoritative": True,
            "matching_trade_count": 0,
            "errors": [],
        }

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(ib_bridge, "EDGE_STOP_POSITION_SYNC_SECONDS", 0.10),
            patch.object(ib_bridge, "FORCE_EOD_VERIFY_POLL_SECONDS", 0.10),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value=refresh),
            ),
            patch.object(
                ib_bridge,
                "get_position_size",
                AsyncMock(return_value=10.0),
            ),
            patch.object(ib_bridge.asyncio, "sleep", AsyncMock()),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.recover_reserved_edge_stop_close(
                payload,
                {
                    "row": copy.deepcopy(store["AAPL"]),
                    "reservation": copy.deepcopy(
                        store["AAPL"]["close_reservation"]
                    ),
                },
            )

        self.assertEqual(
            result["status"],
            "EDGE_STOP_POSITION_SYNC_UNCONFIRMED",
        )
        place_order.assert_not_called()
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "POSITION_SYNC_UNCONFIRMED",
        )

    async def test_close_reservation_persistence_failure_has_no_broker_activity(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        with (
            patch.object(ib_bridge, "load_managed_positions", return_value=copy.deepcopy(store)),
            patch.object(ib_bridge, "save_managed_positions", return_value=False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()) as ensure_connected,
            patch.object(ib_bridge, "qualify_contract", AsyncMock()) as qualify,
            patch.object(ib_bridge.ib, "cancelOrder", create=True) as cancel_order,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.close_position_market(payload)

        self.assertEqual(result["status"], "EDGE_STOP_STATE_PERSISTENCE_FAILED")
        ensure_connected.assert_not_awaited()
        qualify.assert_not_awaited()
        cancel_order.assert_not_called()
        place_order.assert_not_called()

    async def test_close_identity_persistence_failure_withholds_render_callback(self):
        payload = edge_payload(event="CLOSE_STOP")
        store = {"AAPL": managed_edge_row()}
        target_trade = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        close_trade = self.close_trade()
        save_calls = 0
        render_payloads = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            nonlocal save_calls
            save_calls += 1
            candidate = value.get("AAPL", {})
            reservation = candidate.get("close_reservation", {})
            if reservation.get("state") == "CALLBACK_PENDING":
                return False
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        def cancel_order(_order):
            target_trade.orderStatus.status = "Cancelled"

        async def forward(payload_to_render):
            render_payloads.append(copy.deepcopy(payload_to_render))
            return {"forwarded": True, "status_code": 200}

        with (
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False),
            patch.object(ib_bridge, "CANCEL_ORPHAN_TARGETS_AFTER_FLAT", False),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "qualify_contract", AsyncMock(return_value=SimpleNamespace(symbol="AAPL"))),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=10.0)),
            patch.object(ib_bridge, "verify_position_flat", AsyncMock(return_value=(True, 0.0))),
            patch.object(ib_bridge, "wait_for_ib_confirmation", AsyncMock(return_value="")),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge.ib, "trades", return_value=[target_trade]),
            patch.object(ib_bridge.ib, "openTrades", return_value=[]),
            patch.object(
                ib_bridge.ib,
                "cancelOrder",
                side_effect=cancel_order,
                create=True,
            ),
            patch.object(ib_bridge.ib, "placeOrder", return_value=close_trade),
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
        ):
            result = await ib_bridge.close_position_market(payload)
            with patch.object(
                ib_bridge,
                "handle_ib_action",
                AsyncMock(return_value=result),
            ):
                await ib_bridge.process_signal_background(payload)

        self.assertEqual(result["status"], "EDGE_STOP_STATE_PERSISTENCE_FAILED")
        self.assertFalse(result["managed_state_persisted"])
        self.assertEqual(render_payloads, [])
        self.assertIn("AAPL", store)
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "CLOSE_SUBMISSION_PENDING",
        )


    async def test_scheduler_defers_broker_action_states_outside_rth(self):
        for state in ("RESERVED", "CLOSE_SUBMISSION_PENDING"):
            with self.subTest(state=state):
                payload, store = self.recovery_store(state=state)

                def load_managed():
                    return copy.deepcopy(store)

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "BLOCK_MARKET_CLOSES_OUTSIDE_RTH",
                        True,
                    ),
                    patch.object(
                        ib_bridge,
                        "is_us_stock_rth_now",
                        return_value=False,
                    ),
                    patch.object(
                        ib_bridge,
                        "authoritative_edge_close_refresh",
                        AsyncMock(return_value={
                            "authoritative": True,
                            "ambiguous": False,
                            "trade": None,
                            "execution": None,
                            "position": 10,
                            "position_authoritative": True,
                            "matching_trade_count": 0,
                            "errors": [],
                        }),
                    ),
                    patch.object(
                        ib_bridge,
                        "execute_edge_v2_stop_close",
                        AsyncMock(),
                    ) as execute_close,
                    patch.object(
                        ib_bridge,
                        "recover_reserved_edge_stop_close",
                        AsyncMock(),
                    ) as recover_close,
                    patch.object(
                        ib_bridge,
                        "cancel_and_verify_edge_target",
                        AsyncMock(),
                    ) as cancel_target,
                    patch.object(ib_bridge.ib, "placeOrder") as place_order,
                ):
                    result = await (
                        ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )

                self.assertEqual(
                    result["status"],
                    "EDGE_STOP_RECOVERY_DEFERRED_OUTSIDE_RTH",
                )
                self.assertEqual(
                    store["AAPL"]["close_reservation"]["state"],
                    state,
                )
                execute_close.assert_not_awaited()
                recover_close.assert_not_awaited()
                cancel_target.assert_not_awaited()
                place_order.assert_not_called()

    async def test_filled_close_reconciles_outside_rth_without_broker_mutation(self):
        payload, store = self.recovery_store(
            state="CLOSE_SUBMISSION_PENDING",
        )
        store["AAPL"]["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        close = fake_trade(
            order_id=471,
            perm_id=4471,
            order_ref=ib_bridge.edge_stop_close_order_ref(
                "AAPL",
                payload["setup_id"],
            ),
            action="SELL",
            status="Filled",
            filled=10,
            price=98,
            exec_id="STOP-OUTSIDE-RTH-10",
            execution_time=datetime(
                2026,
                7,
                28,
                15,
                0,
                tzinfo=timezone.utc,
            ),
        )
        delivered = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        async def forward(render_payload):
            delivered.append(copy.deepcopy(render_payload))
            return {"forwarded": True, "status_code": 200}

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "BLOCK_MARKET_CLOSES_OUTSIDE_RTH",
                True,
            ),
            patch.object(
                ib_bridge,
                "is_us_stock_rth_now",
                return_value=False,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value={
                    "authoritative": True,
                    "ambiguous": False,
                    "trade": close,
                    "execution": None,
                    "position": 0,
                    "position_authoritative": True,
                    "matching_trade_count": 1,
                    "trades": [close],
                    "fills": [],
                    "errors": [],
                }),
            ),
            patch.object(
                ib_bridge,
                "get_position_size",
                AsyncMock(return_value=0),
            ),
            patch.object(
                ib_bridge,
                "forward_to_render",
                side_effect=forward,
            ),
            patch.object(
                ib_bridge,
                "cleanup_orphan_targets_if_flat",
                AsyncMock(return_value={}),
            ),
            patch.object(ib_bridge.ib, "trades", return_value=[close]),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
            patch.object(
                ib_bridge,
                "cancel_and_verify_edge_target",
                AsyncMock(),
            ) as cancel_target,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.reconcile_managed_target_fills_once()

        self.assertEqual(result["reported"], 1)
        self.assertEqual(store, {})
        self.assertEqual(delivered[0]["event"], "CLOSE_STOP")
        self.assertEqual(
            delivered[0]["exit_execution_id"],
            "EXEC:STOP-OUTSIDE-RTH-10",
        )
        cancel_target.assert_not_awaited()
        place_order.assert_not_called()

    async def test_publication_only_states_never_mutate_broker(self):
        publication_states = (
            "CALLBACK_PENDING",
            "MIXED_EXIT_EVIDENCE_INCOMPLETE",
            "POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION",
        )
        for state in publication_states:
            with self.subTest(state=state):
                payload, store = self.recovery_store(state=state)

                def load_managed():
                    return copy.deepcopy(store)

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "authoritative_edge_close_refresh",
                        AsyncMock(return_value={
                            "authoritative": True,
                            "ambiguous": False,
                            "trade": None,
                            "execution": None,
                            "position": 0,
                            "position_authoritative": True,
                            "matching_trade_count": 0,
                            "errors": [],
                        }),
                    ),
                    patch.object(
                        ib_bridge,
                        "cancel_and_verify_edge_target",
                        AsyncMock(),
                    ) as cancel_target,
                    patch.object(
                        ib_bridge,
                        "submit_edge_stop_recovery_replacement",
                        AsyncMock(),
                    ) as replacement,
                    patch.object(ib_bridge.ib, "placeOrder") as place_order,
                ):
                    result = await (
                        ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )

                self.assertEqual(result["status"], "EDGE_STOP_RECOVERY_READ_ONLY")
                cancel_target.assert_not_awaited()
                replacement.assert_not_awaited()
                place_order.assert_not_called()

    async def test_publication_only_nonflat_becomes_position_conflict(self):
        payload, store = self.recovery_store(state="CALLBACK_PENDING")

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value={
                    "authoritative": True,
                    "ambiguous": False,
                    "trade": None,
                    "execution": None,
                    "position": 2,
                    "position_authoritative": True,
                    "matching_trade_count": 0,
                    "errors": [],
                }),
            ),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await (
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )

        self.assertEqual(
            result["status"],
            "EDGE_STOP_POST_CLOSE_POSITION_CONFLICT",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "EDGE_STOP_POST_CLOSE_POSITION_CONFLICT",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["prior_state"],
            "CALLBACK_PENDING",
        )
        place_order.assert_not_called()

    async def test_residual_recovery_stops_when_history_persistence_fails(self):
        payload, store = self.recovery_store(
            state="FILLED_POSITION_NOT_FLAT"
        )
        reservation = store["AAPL"]["close_reservation"]
        reservation.update({
            "order_id": 460,
            "perm_id": 4460,
            "order_ref": "TVFVG_CLOSE_AAPL_RESIDUAL",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_exec_ids": ["TARGET-RESIDUAL-3"],
            "remaining_qty": 7,
        })
        close = attach_exact_trade_fills(
            fake_trade(
                order_id=460,
                perm_id=4460,
                order_ref="TVFVG_CLOSE_AAPL_RESIDUAL",
                action="SELL",
                status="Cancelled",
                filled=4,
                price=98,
            ),
            [("STOP-RESIDUAL-4", 4, 98)],
        )
        original = copy.deepcopy(store)

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=lambda: copy.deepcopy(store),
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                return_value=False,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value={
                    "authoritative": True,
                    "ambiguous": False,
                    "trade": close,
                    "execution": {
                        "qty": 4,
                        "price": 98,
                        "exec_ids": ["STOP-RESIDUAL-4"],
                    },
                    "position": 3,
                    "position_authoritative": True,
                    "matching_trade_count": 1,
                    "trades": [close],
                    "fills": [],
                    "errors": [],
                }),
            ),
            patch.object(
                ib_bridge,
                "submit_edge_stop_recovery_replacement",
                AsyncMock(),
            ) as replacement,
            patch.object(
                ib_bridge,
                "execute_edge_v2_stop_close",
                AsyncMock(),
            ) as initial_close,
            patch.object(
                ib_bridge,
                "recover_reserved_edge_stop_close",
                AsyncMock(),
            ) as generic_recovery,
            patch.object(
                ib_bridge,
                "cancel_and_verify_edge_target",
                AsyncMock(),
            ) as cancel_target,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await (
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )

        self.assertEqual(
            result["status"],
            "EDGE_STOP_STATE_PERSISTENCE_FAILED",
        )
        self.assertEqual(store, original)
        replacement.assert_not_awaited()
        initial_close.assert_not_awaited()
        generic_recovery.assert_not_awaited()
        cancel_target.assert_not_awaited()
        place_order.assert_not_called()

    async def test_persisted_residual_evidence_allows_one_rth_close(self):
        payload, store = self.recovery_store(
            state="FILLED_POSITION_NOT_FLAT"
        )
        reservation = store["AAPL"]["close_reservation"]
        reservation.update({
            "order_id": 461,
            "perm_id": 4461,
            "order_ref": "TVFVG_CLOSE_AAPL_RESIDUAL_OK",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_exec_ids": ["TARGET-RESIDUAL-3"],
            "remaining_qty": 7,
        })
        close = attach_exact_trade_fills(
            fake_trade(
                order_id=461,
                perm_id=4461,
                order_ref="TVFVG_CLOSE_AAPL_RESIDUAL_OK",
                action="SELL",
                status="Cancelled",
                filled=4,
                price=98,
            ),
            [("STOP-RESIDUAL-OK-4", 4, 98)],
        )

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        replacement_result = {
            "status": "submitted_awaiting_close_fill",
            "qty": 3,
        }
        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "BLOCK_MARKET_CLOSES_OUTSIDE_RTH",
                True,
            ),
            patch.object(
                ib_bridge,
                "is_us_stock_rth_now",
                return_value=True,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value={
                    "authoritative": True,
                    "ambiguous": False,
                    "trade": close,
                    "execution": {
                        "qty": 4,
                        "price": 98,
                        "exec_ids": ["STOP-RESIDUAL-OK-4"],
                    },
                    "position": 3,
                    "position_authoritative": True,
                    "matching_trade_count": 1,
                    "trades": [close],
                    "fills": [],
                    "errors": [],
                }),
            ),
            patch.object(
                ib_bridge,
                "submit_edge_stop_recovery_replacement",
                AsyncMock(return_value=replacement_result),
            ) as replacement,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await (
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )

        self.assertEqual(result, replacement_result)
        replacement.assert_awaited_once()
        self.assertEqual(replacement.await_args.args[3], 3)
        self.assertEqual(
            store["AAPL"]["close_attempts"][0]["exec_ids"],
            ["STOP-RESIDUAL-OK-4"],
        )
        place_order.assert_not_called()

    async def test_scheduler_and_webhook_share_one_close_lifecycle(self):
        payload, store = self.recovery_store(state="RESERVED")
        action_started = asyncio.Event()
        release_action = asyncio.Event()
        action_calls = []
        target_cancels = []
        close_orders = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        async def execute_once(data, _reserved):
            action_calls.append(data["setup_id"])
            target_cancels.append(data["setup_id"])
            close_orders.append(data["setup_id"])
            action_started.set()
            await release_action.wait()
            store["AAPL"]["close_reservation"]["state"] = "CLOSE_SUBMITTED"
            return {"status": "submitted_awaiting_close_fill"}

        accepted_close = fake_trade(
            order_id=470,
            perm_id=4470,
            order_ref=ib_bridge.edge_stop_close_order_ref(
                "AAPL",
                payload["setup_id"],
            ),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "BLOCK_MARKET_CLOSES_OUTSIDE_RTH",
                True,
            ),
            patch.object(
                ib_bridge,
                "is_us_stock_rth_now",
                return_value=True,
            ),
            patch.object(
                ib_bridge,
                "execute_edge_v2_stop_close",
                side_effect=execute_once,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value={
                    "authoritative": True,
                    "ambiguous": False,
                    "trade": accepted_close,
                    "execution": None,
                    "position": 10,
                    "position_authoritative": True,
                    "matching_trade_count": 1,
                    "errors": [],
                }),
            ),
        ):
            scheduler_task = asyncio.create_task(
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )
            await action_started.wait()
            webhook_task = asyncio.create_task(
                ib_bridge.close_position_market(payload)
            )
            await asyncio.sleep(0)
            release_action.set()
            scheduler_result, webhook_result = await asyncio.gather(
                scheduler_task,
                webhook_task,
            )

        self.assertEqual(len(action_calls), 1)
        self.assertEqual(len(target_cancels), 1)
        self.assertEqual(len(close_orders), 1)
        self.assertEqual(
            scheduler_result["status"],
            "submitted_awaiting_close_fill",
        )
        self.assertEqual(
            webhook_result["status"],
            "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
        )

    async def test_overlapping_scheduler_passes_submit_once(self):
        payload, store = self.recovery_store(state="RESERVED")
        entered = asyncio.Event()
        release = asyncio.Event()
        action_calls = []
        close_orders = []

        def load_managed():
            return copy.deepcopy(store)

        async def execute_once(data, _reserved):
            action_calls.append(data["setup_id"])
            close_orders.append(data["setup_id"])
            entered.set()
            await release.wait()
            store["AAPL"]["close_reservation"]["state"] = "CLOSE_SUBMITTED"
            return {"status": "submitted_awaiting_close_fill"}

        accepted_close = fake_trade(
            order_id=471,
            perm_id=4471,
            order_ref=ib_bridge.edge_stop_close_order_ref(
                "AAPL",
                payload["setup_id"],
            ),
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        async def refresh_after_submission(_row, _reservation):
            return {
                "authoritative": True,
                "ambiguous": False,
                "trade": accepted_close,
                "execution": None,
                "position": 10,
                "position_authoritative": True,
                "matching_trade_count": 1,
                "errors": [],
            }

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "BLOCK_MARKET_CLOSES_OUTSIDE_RTH",
                True,
            ),
            patch.object(
                ib_bridge,
                "is_us_stock_rth_now",
                return_value=True,
            ),
            patch.object(
                ib_bridge,
                "execute_edge_v2_stop_close",
                side_effect=execute_once,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                side_effect=refresh_after_submission,
            ),
        ):
            first = asyncio.create_task(
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )
            await entered.wait()
            second = asyncio.create_task(
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )
            release.set()
            results = await asyncio.gather(first, second)

        self.assertEqual(len(action_calls), 1)
        self.assertEqual(len(close_orders), 1)
        self.assertEqual(
            [result["status"] for result in results],
            [
                "submitted_awaiting_close_fill",
                "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
            ],
        )

    async def test_scheduler_reloads_setup_after_waiting_for_lock(self):
        payload, store = self.recovery_store(state="RESERVED")

        def load_managed():
            return copy.deepcopy(store)

        await ib_bridge._edge_stop_close_lock.acquire()
        try:
            with (
                patch.object(
                    ib_bridge,
                    "load_managed_positions",
                    side_effect=load_managed,
                ),
                patch.object(
                    ib_bridge,
                    "execute_edge_v2_stop_close",
                    AsyncMock(),
                ) as execute_close,
            ):
                task = asyncio.create_task(
                    ib_bridge.recover_edge_stop_reservation_from_scheduler(
                        copy.deepcopy(store["AAPL"])
                    )
                )
                await asyncio.sleep(0)
                replacement = managed_edge_row(
                    "VIXALE_EDGE:AAPL:60:LONG:NEW"
                )
                store["AAPL"] = replacement
                ib_bridge._edge_stop_close_lock.release()
                result = await task
        finally:
            if ib_bridge._edge_stop_close_lock.locked():
                ib_bridge._edge_stop_close_lock.release()

        self.assertEqual(result["status"], "EDGE_STOP_SETUP_MISMATCH")
        execute_close.assert_not_awaited()


class EdgeNextRthQueueTests(unittest.IsolatedAsyncioTestCase):
    def queued_payload(self, **overrides):
        return edge_payload(
            event="CLOSE_STOP",
            close_execution_policy="NEXT_RTH_OPEN",
            signal_at_rth_close=True,
            signal_session_date="2026-07-28",
            signal_bar_time=1785279600000,
            reason="STOP_LOSS_SIGNAL_AT_RTH_CLOSE",
            **overrides,
        )

    def store(self):
        return {"AAPL": managed_edge_row()}

    async def queue_into_store(self, store, payload=None):
        payload = payload or self.queued_payload()

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
        ):
            result = await ib_bridge.close_position_market(payload)
        return result

    async def recover_queued_store(
        self,
        store,
        refresh,
        *,
        session_confirmed=True,
        target_trade=None,
    ):
        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        if target_trade is None:
            target_trade = fake_trade(
                order_id=200,
                perm_id=2200,
                order_ref="TVFVG_AAPL_LONG_TP",
                action="SELL",
                status="Submitted",
                filled=0,
                price=0,
            )
        execute_result = {
            "status": "submitted_awaiting_close_fill",
            "close_order_qty": abs(ib_bridge.to_float(refresh.get("position"))),
        }
        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value=refresh),
            ),
            patch.object(
                ib_bridge,
                "confirm_edge_next_rth_session",
                AsyncMock(return_value={
                    "confirmed": session_confirmed,
                    "status": (
                        "EDGE_STOP_NEXT_RTH_SESSION_CONFIRMED"
                        if session_confirmed
                        else "EDGE_STOP_QUEUED_NEXT_RTH_OPEN"
                    ),
                    "reason": (
                        ""
                        if session_confirmed
                        else "next_new_york_date_not_reached"
                    ),
                    "liquid_hours": "20260729:0930-20260729:1600",
                    "time_zone_id": "US/Eastern",
                }),
            ) as confirm_session,
            patch.object(
                ib_bridge,
                "find_exact_managed_target_trade",
                return_value=target_trade,
            ),
            patch.object(
                ib_bridge,
                "execute_edge_v2_stop_close",
                AsyncMock(return_value=execute_result),
            ) as execute_close,
            patch.object(
                ib_bridge,
                "cancel_and_verify_edge_target",
                AsyncMock(),
            ) as cancel_target,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.recover_edge_stop_reservation_from_scheduler(
                copy.deepcopy(store["AAPL"])
            )
        return {
            "result": result,
            "execute_close": execute_close,
            "confirm_session": confirm_session,
            "cancel_target": cancel_target,
            "place_order": place_order,
        }

    def authoritative_refresh(self, position, fills=None, trades=None, **overrides):
        result = {
            "authoritative": True,
            "execution_history_authoritative": True,
            "ambiguous": False,
            "trade": None,
            "execution": None,
            "position": position,
            "position_authoritative": True,
            "matching_trade_count": 0,
            "trades": list(trades or []),
            "fills": list(fills or []),
            "errors": [],
        }
        result.update(overrides)
        return result

    def post_signal_fill(
        self,
        *,
        exec_id,
        shares,
        side,
        order_id,
        perm_id,
        order_ref,
        minute=1,
    ):
        return fake_fill(
            order_id=order_id,
            perm_id=perm_id,
            exec_id=exec_id,
            side=side,
            shares=shares,
            price=99,
            order_ref=order_ref,
            execution_time=datetime(
                2026,
                7,
                28,
                23,
                minute,
                tzinfo=ib_bridge.ZoneInfo("UTC"),
            ),
        )

    async def test_queue_is_persistent_publication_silent_and_idempotent(self):
        payload = self.queued_payload()
        store = self.store()

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "ensure_ib_connected",
                AsyncMock(),
            ) as connect,
            patch.object(
                ib_bridge,
                "cancel_and_verify_edge_target",
                AsyncMock(),
            ) as cancel_target,
            patch.object(
                ib_bridge,
                "forward_to_render",
                AsyncMock(),
            ) as forward,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            first = await ib_bridge.close_position_market(payload)
            second = await ib_bridge.close_position_market(payload)
            await ib_bridge.process_signal_background(payload)

        self.assertEqual(first["status"], "EDGE_STOP_QUEUED_NEXT_RTH_OPEN")
        self.assertFalse(first["duplicate"])
        self.assertEqual(second["status"], "EDGE_STOP_QUEUED_NEXT_RTH_OPEN")
        self.assertTrue(second["duplicate"])
        reservation = store["AAPL"]["close_reservation"]
        self.assertEqual(reservation["state"], "QUEUED_NEXT_RTH_OPEN")
        self.assertEqual(reservation["attempt"], 0)
        self.assertEqual(reservation["setup_id"], payload["setup_id"])
        self.assertEqual(
            reservation["reservation_id"],
            f"{payload['setup_id']}:CLOSE_STOP",
        )
        self.assertEqual(
            reservation["signal_session_date"],
            payload["signal_session_date"],
        )
        self.assertEqual(
            reservation["signal_bar_time"],
            payload["signal_bar_time"],
        )
        self.assertEqual(
            reservation["original_payload"]["close_execution_policy"],
            "NEXT_RTH_OPEN",
        )
        self.assertEqual(
            reservation["target_identity"]["perm_id"],
            2200,
        )
        self.assertEqual(reservation["managed_side"], "LONG")
        self.assertEqual(reservation["original_managed_qty"], 10)
        self.assertEqual(reservation["original_position_qty"], 10)
        self.assertEqual(reservation["entry_identity"]["perm_id"], 1100)
        self.assertEqual(reservation["entry_exec_ids"], ["ENTRY-1"])
        self.assertEqual(reservation["queued_target_identity"]["perm_id"], 2200)
        connect.assert_not_awaited()
        cancel_target.assert_not_awaited()
        forward.assert_not_awaited()
        place_order.assert_not_called()

    async def test_manual_close_reopen_and_quantity_changes_break_ownership(self):
        scenarios = (
            (
                "manual_full_close_same_side_reopen",
                10,
                [
                    self.post_signal_fill(
                        exec_id="MANUAL-CLOSE-10",
                        shares=10,
                        side="SLD",
                        order_id=901,
                        perm_id=9901,
                        order_ref="MANUAL",
                    ),
                    self.post_signal_fill(
                        exec_id="MANUAL-REOPEN-10",
                        shares=10,
                        side="BOT",
                        order_id=902,
                        perm_id=9902,
                        order_ref="MANUAL",
                        minute=2,
                    ),
                ],
            ),
            (
                "manual_partial_close_smaller_remainder",
                7,
                [
                    self.post_signal_fill(
                        exec_id="MANUAL-CLOSE-3",
                        shares=3,
                        side="SLD",
                        order_id=903,
                        perm_id=9903,
                        order_ref="MANUAL",
                    ),
                ],
            ),
            (
                "same_side_open_increases_quantity",
                12,
                [
                    self.post_signal_fill(
                        exec_id="MANUAL-ADD-2",
                        shares=2,
                        side="BOT",
                        order_id=904,
                        perm_id=9904,
                        order_ref="MANUAL",
                    ),
                ],
            ),
        )
        for name, position, fills in scenarios:
            with self.subTest(name=name):
                store = self.store()
                await self.queue_into_store(store)
                outcome = await self.recover_queued_store(
                    store,
                    self.authoritative_refresh(position, fills=fills),
                )

                self.assertEqual(
                    outcome["result"]["status"],
                    "EDGE_STOP_NEXT_RTH_OWNERSHIP_CONFLICT",
                )
                self.assertEqual(
                    store["AAPL"]["close_reservation"]["state"],
                    "EDGE_STOP_NEXT_RTH_OWNERSHIP_CONFLICT",
                )
                outcome["execute_close"].assert_not_awaited()
                outcome["confirm_session"].assert_not_awaited()
                outcome["cancel_target"].assert_not_awaited()
                outcome["place_order"].assert_not_called()

    async def test_changed_target_without_authorized_evidence_breaks_ownership(self):
        store = self.store()
        await self.queue_into_store(store)
        store["AAPL"]["target_order"] = {
            **store["AAPL"]["target_order"],
            "order_id": 300,
            "perm_id": 3300,
            "order_ref": "TVFVG_AAPL_LONG_TP_REPLACED",
        }

        outcome = await self.recover_queued_store(
            store,
            self.authoritative_refresh(10),
        )

        self.assertEqual(
            outcome["result"]["status"],
            "EDGE_STOP_NEXT_RTH_OWNERSHIP_CONFLICT",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["critical_reason"],
            "queued_target_identity_changed",
        )
        outcome["execute_close"].assert_not_awaited()
        outcome["cancel_target"].assert_not_awaited()
        outcome["place_order"].assert_not_called()

    async def test_exact_target_partial_preserves_ownership_and_promotes_only_remainder(self):
        store = self.store()
        await self.queue_into_store(store)
        target_fill = self.post_signal_fill(
            exec_id="TARGET-PARTIAL-3",
            shares=3,
            side="SLD",
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
        )

        outcome = await self.recover_queued_store(
            store,
            self.authoritative_refresh(7, fills=[target_fill]),
        )

        self.assertEqual(
            outcome["result"]["status"],
            "submitted_awaiting_close_fill",
        )
        self.assertEqual(outcome["result"]["close_order_qty"], 7)
        outcome["execute_close"].assert_awaited_once()
        reserved = outcome["execute_close"].await_args.args[1]
        self.assertEqual(
            reserved["reservation"]["target_partial_filled_qty"],
            3,
        )
        self.assertEqual(
            reserved["reservation"]["target_partial_exec_ids"],
            ["TARGET-PARTIAL-3"],
        )

    async def test_exact_target_full_uses_existing_flat_reconciliation(self):
        store = self.store()
        await self.queue_into_store(store)
        target_fill = self.post_signal_fill(
            exec_id="TARGET-FULL-10",
            shares=10,
            side="SLD",
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
        )

        outcome = await self.recover_queued_store(
            store,
            self.authoritative_refresh(0, fills=[target_fill]),
        )

        self.assertEqual(
            outcome["result"]["status"],
            "EDGE_STOP_POSITION_FLAT_RECOVERY",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION",
        )
        outcome["execute_close"].assert_not_awaited()
        outcome["cancel_target"].assert_not_awaited()
        outcome["place_order"].assert_not_called()

    async def test_restart_with_incomplete_execution_history_fails_closed(self):
        store = self.store()
        await self.queue_into_store(store)

        outcome = await self.recover_queued_store(
            store,
            self.authoritative_refresh(
                10,
                execution_history_authoritative=False,
                errors=["execution_history_unavailable_after_restart"],
            ),
        )

        self.assertEqual(
            outcome["result"]["status"],
            "EDGE_STOP_NEXT_RTH_SESSION_UNCONFIRMED",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "QUEUED_NEXT_RTH_OPEN",
        )
        outcome["execute_close"].assert_not_awaited()
        outcome["cancel_target"].assert_not_awaited()
        outcome["place_order"].assert_not_called()

    async def test_duplicate_queued_webhook_and_scheduler_are_serialized(self):
        payload = self.queued_payload()
        store = self.store()
        await self.queue_into_store(store, payload)
        entered = asyncio.Event()
        release = asyncio.Event()
        calls = []

        def load_managed():
            return copy.deepcopy(store)

        async def block_scheduler(*_args):
            calls.append("scheduler_entered")
            entered.set()
            await release.wait()
            calls.append("scheduler_released")
            return {"status": "EDGE_STOP_QUEUED_NEXT_RTH_OPEN"}

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "recover_queued_edge_stop_next_rth",
                side_effect=block_scheduler,
            ),
            patch.object(
                ib_bridge,
                "cancel_and_verify_edge_target",
                AsyncMock(),
            ) as cancel_target,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            scheduler = asyncio.create_task(
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )
            await entered.wait()
            duplicate = asyncio.create_task(
                ib_bridge.close_position_market(payload)
            )
            await asyncio.sleep(0)
            self.assertFalse(duplicate.done())
            release.set()
            scheduler_result, duplicate_result = await asyncio.gather(
                scheduler,
                duplicate,
            )

        self.assertEqual(
            scheduler_result["status"],
            "EDGE_STOP_QUEUED_NEXT_RTH_OPEN",
        )
        self.assertEqual(
            duplicate_result["status"],
            "EDGE_STOP_QUEUED_NEXT_RTH_OPEN",
        )
        self.assertTrue(duplicate_result["duplicate"])
        self.assertEqual(calls, ["scheduler_entered", "scheduler_released"])
        cancel_target.assert_not_awaited()
        place_order.assert_not_called()

    async def test_queue_rejects_stale_or_incomplete_identity_without_broker_action(self):
        stale = self.queued_payload(
            setup_id="VIXALE_EDGE:AAPL:60:LONG:STALE",
        )
        invalid = self.queued_payload()
        invalid["signal_at_rth_close"] = False
        store = self.store()
        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                return_value=copy.deepcopy(store),
            ),
            patch.object(
                ib_bridge,
                "cancel_and_verify_edge_target",
                AsyncMock(),
            ) as cancel_target,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            stale_result = await ib_bridge.close_position_market(stale)
            invalid_result = await ib_bridge.close_position_market(invalid)

        self.assertEqual(stale_result["status"], "EDGE_STOP_SETUP_MISMATCH")
        self.assertEqual(
            invalid_result["status"],
            "EDGE_STOP_NEXT_RTH_POLICY_INVALID",
        )
        cancel_target.assert_not_awaited()
        place_order.assert_not_called()

    async def test_ib_session_confirmation_is_next_date_and_liquid_hours_only(self):
        payload = self.queued_payload()
        details = SimpleNamespace(
            timeZoneId="US/Eastern",
            liquidHours=(
                "20260728:0930-20260728:1600;"
                "20260729:0930-20260729:1600"
            ),
        )
        next_rth = datetime(
            2026,
            7,
            29,
            9,
            31,
            tzinfo=ib_bridge.ZoneInfo("America/New_York"),
        )
        same_day = datetime(
            2026,
            7,
            28,
            15,
            59,
            tzinfo=ib_bridge.ZoneInfo("America/New_York"),
        )
        with (
            patch.object(
                ib_bridge,
                "is_us_stock_rth_now",
                return_value=True,
            ),
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(
                ib_bridge,
                "qualify_contract",
                AsyncMock(return_value=SimpleNamespace(symbol="AAPL")),
            ),
            patch.object(
                ib_bridge,
                "bounded_ib_refresh_request",
                AsyncMock(return_value={
                    "supported": True,
                    "ok": True,
                    "values": [details],
                    "error": "",
                }),
            ),
        ):
            same_day_result = await ib_bridge.confirm_edge_next_rth_session(
                payload,
                same_day,
            )
            next_day_result = await ib_bridge.confirm_edge_next_rth_session(
                payload,
                next_rth,
            )

        self.assertEqual(
            same_day_result["status"],
            "EDGE_STOP_QUEUED_NEXT_RTH_OPEN",
        )
        self.assertTrue(next_day_result["confirmed"])
        self.assertTrue(
            ib_bridge.ib_contract_session_contains(details, next_rth)
        )
        holiday = SimpleNamespace(
            timeZoneId="US/Eastern",
            liquidHours="20260729:CLOSED",
        )
        self.assertFalse(
            ib_bridge.ib_contract_session_contains(holiday, next_rth)
        )

    async def test_scheduler_waits_then_promotes_once_into_part3a_sequence(self):
        payload = self.queued_payload()
        store = self.store()

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        target = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
        ):
            await ib_bridge.close_position_market(payload)

        refresh = {
            "authoritative": True,
            "ambiguous": False,
            "trade": None,
            "execution": None,
            "position": 10,
            "position_authoritative": True,
            "matching_trade_count": 0,
            "errors": [],
        }
        execute_result = {"status": "submitted_awaiting_close_fill"}
        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value=refresh),
            ),
            patch.object(
                ib_bridge,
                "confirm_edge_next_rth_session",
                AsyncMock(return_value={
                    "confirmed": False,
                    "status": "EDGE_STOP_QUEUED_NEXT_RTH_OPEN",
                    "reason": "next_new_york_date_not_reached",
                }),
            ),
            patch.object(
                ib_bridge,
                "find_exact_managed_target_trade",
                return_value=target,
            ),
            patch.object(
                ib_bridge,
                "execute_edge_v2_stop_close",
                AsyncMock(return_value=execute_result),
            ) as execute_close,
            patch.object(
                ib_bridge,
                "cancel_and_verify_edge_target",
                AsyncMock(),
            ) as cancel_target,
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            deferred = await (
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )

        self.assertEqual(
            deferred["status"],
            "EDGE_STOP_QUEUED_NEXT_RTH_OPEN",
        )
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "QUEUED_NEXT_RTH_OPEN",
        )
        self.assertEqual(store["AAPL"]["close_reservation"]["attempt"], 0)
        execute_close.assert_not_awaited()
        cancel_target.assert_not_awaited()
        place_order.assert_not_called()

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(
                ib_bridge,
                "authoritative_edge_close_refresh",
                AsyncMock(return_value=refresh),
            ),
            patch.object(
                ib_bridge,
                "confirm_edge_next_rth_session",
                AsyncMock(return_value={
                    "confirmed": True,
                    "status": "EDGE_STOP_NEXT_RTH_SESSION_CONFIRMED",
                    "liquid_hours": "20260729:0930-20260729:1600",
                    "time_zone_id": "US/Eastern",
                }),
            ),
            patch.object(
                ib_bridge,
                "find_exact_managed_target_trade",
                return_value=target,
            ),
            patch.object(
                ib_bridge,
                "execute_edge_v2_stop_close",
                AsyncMock(return_value=execute_result),
            ) as execute_close,
        ):
            executed = await (
                ib_bridge.recover_edge_stop_reservation_from_scheduler(
                    copy.deepcopy(store["AAPL"])
                )
            )

        self.assertEqual(executed, execute_result)
        execute_close.assert_awaited_once()
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "RESERVED",
        )
        self.assertEqual(store["AAPL"]["close_reservation"]["attempt"], 1)

    async def test_unconfirmed_contract_session_and_ambiguous_evidence_fail_closed(self):
        payload = self.queued_payload()
        for scenario, refresh, confirmation in (
            (
                "holiday",
                {
                    "authoritative": True,
                    "ambiguous": False,
                    "position": 10,
                    "position_authoritative": True,
                    "errors": [],
                },
                {
                    "confirmed": False,
                    "status": "EDGE_STOP_NEXT_RTH_SESSION_UNCONFIRMED",
                    "reason": "ib_liquid_hours_missing_closed_or_ambiguous",
                },
            ),
            (
                "ambiguous_history",
                {
                    "authoritative": False,
                    "ambiguous": True,
                    "position": 10,
                    "position_authoritative": True,
                    "errors": ["history_ambiguous"],
                },
                None,
            ),
        ):
            with self.subTest(scenario=scenario):
                store = self.store()

                def load_managed():
                    return copy.deepcopy(store)

                def save_managed(value):
                    store.clear()
                    store.update(copy.deepcopy(value))
                    return True

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "save_managed_positions",
                        side_effect=save_managed,
                    ),
                ):
                    await ib_bridge.close_position_market(payload)

                patches = [
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "save_managed_positions",
                        side_effect=save_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "authoritative_edge_close_refresh",
                        AsyncMock(return_value=refresh),
                    ),
                    patch.object(
                        ib_bridge,
                        "cancel_and_verify_edge_target",
                        AsyncMock(),
                    ),
                    patch.object(ib_bridge.ib, "placeOrder"),
                ]
                if confirmation is not None:
                    patches.append(patch.object(
                        ib_bridge,
                        "confirm_edge_next_rth_session",
                        AsyncMock(return_value=confirmation),
                    ))
                entered = [item.start() for item in patches]
                try:
                    result = await (
                        ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )
                finally:
                    for item in reversed(patches):
                        item.stop()

                self.assertEqual(
                    result["status"],
                    "EDGE_STOP_NEXT_RTH_SESSION_UNCONFIRMED",
                )
                self.assertEqual(
                    store["AAPL"]["close_reservation"]["state"],
                    "QUEUED_NEXT_RTH_OPEN",
                )
                entered[3].assert_not_awaited()
                entered[4].assert_not_called()

    async def test_overnight_flat_transitions_to_existing_reconciliation_without_order(self):
        payload = self.queued_payload()
        for outcome in ("target_fill", "manual_flat"):
            with self.subTest(outcome=outcome):
                store = self.store()

                def load_managed():
                    return copy.deepcopy(store)

                def save_managed(value):
                    store.clear()
                    store.update(copy.deepcopy(value))
                    return True

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "save_managed_positions",
                        side_effect=save_managed,
                    ),
                ):
                    await ib_bridge.close_position_market(payload)

                with (
                    patch.object(
                        ib_bridge,
                        "load_managed_positions",
                        side_effect=load_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "save_managed_positions",
                        side_effect=save_managed,
                    ),
                    patch.object(
                        ib_bridge,
                        "authoritative_edge_close_refresh",
                        AsyncMock(return_value={
                            "authoritative": True,
                            "ambiguous": False,
                            "trade": None,
                            "execution": None,
                            "position": 0,
                            "position_authoritative": True,
                            "matching_trade_count": 0,
                            "errors": [],
                        }),
                    ),
                    patch.object(
                        ib_bridge,
                        "cancel_and_verify_edge_target",
                        AsyncMock(),
                    ) as cancel_target,
                    patch.object(ib_bridge.ib, "placeOrder") as place_order,
                ):
                    result = await (
                        ib_bridge.recover_edge_stop_reservation_from_scheduler(
                            copy.deepcopy(store["AAPL"])
                        )
                    )

                self.assertEqual(
                    result["status"],
                    "EDGE_STOP_POSITION_FLAT_RECOVERY",
                )
                self.assertEqual(
                    store["AAPL"]["close_reservation"]["state"],
                    "POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION",
                )
                cancel_target.assert_not_awaited()
                place_order.assert_not_called()


class EdgeTargetMonitorTests(unittest.IsolatedAsyncioTestCase):
    def filled_target(self):
        return fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Filled",
            filled=10,
            price=105.37,
            exec_id="TARGET-MONITOR-1",
        )

    async def test_filled_target_with_nonflat_broker_position_sends_no_callback(self):
        store = {"AAPL": managed_edge_row()}
        with (
            patch.object(ib_bridge, "ENABLE_TARGET_FILL_MONITOR", True),
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "claim_target_report", AsyncMock(return_value=True)),
            patch.object(ib_bridge, "release_target_report_claim", AsyncMock()),
            patch.object(
                ib_bridge,
                "verify_position_flat",
                AsyncMock(return_value=(False, 10.0)),
            ) as verify_flat,
            patch.object(ib_bridge, "load_managed_positions", return_value=copy.deepcopy(store)),
            patch.object(ib_bridge, "save_managed_positions") as save_managed,
            patch.object(ib_bridge, "forward_to_render", AsyncMock()) as forward,
            patch.object(ib_bridge, "clear_managed_position") as clear_managed,
        ):
            await ib_bridge.monitor_target_fill(
                edge_payload(),
                self.filled_target(),
                "AAPL",
                "LONG",
                10,
                100.25,
                105,
            )

        verify_flat.assert_awaited_once_with(
            "AAPL",
            ib_bridge.FORCE_EOD_POSITION_VERIFY_SECONDS,
        )
        forward.assert_not_awaited()
        save_managed.assert_not_called()
        clear_managed.assert_not_called()
        self.assertIn("AAPL", store)

    async def test_filled_target_with_confirmed_flat_publishes_actual_tp(self):
        store = {"AAPL": managed_edge_row()}
        render_payloads = []

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        async def forward(payload):
            render_payloads.append(copy.deepcopy(payload))
            return {"forwarded": True, "status_code": 200}

        def clear_managed(symbol):
            store.pop(symbol, None)

        with (
            patch.object(ib_bridge, "ENABLE_TARGET_FILL_MONITOR", True),
            patch.object(ib_bridge, "DRY_RUN", False),
            patch.object(ib_bridge, "claim_target_report", AsyncMock(return_value=True)),
            patch.object(ib_bridge, "release_target_report_claim", AsyncMock()),
            patch.object(
                ib_bridge,
                "verify_position_flat",
                AsyncMock(return_value=(True, 0.0)),
            ),
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=lambda: copy.deepcopy(store),
            ),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
            patch.object(ib_bridge, "clear_managed_position", side_effect=clear_managed),
            patch.object(
                ib_bridge,
                "cleanup_orphan_targets_if_flat",
                AsyncMock(return_value={}),
            ),
        ):
            await ib_bridge.monitor_target_fill(
                edge_payload(),
                self.filled_target(),
                "AAPL",
                "LONG",
                10,
                100.25,
                105,
            )

        self.assertEqual(len(render_payloads), 1)
        self.assertEqual(render_payloads[0]["event"], "TP")
        self.assertEqual(render_payloads[0]["price"], 105.37)
        self.assertEqual(render_payloads[0]["qty"], 10)
        self.assertTrue(render_payloads[0]["broker_confirmed_flat"])
        self.assertEqual(
            render_payloads[0]["reason"],
            "IB_TARGET_EXECUTION_CONFIRMED",
        )
        self.assertNotIn("AAPL", store)


class EdgeReconciliationTests(unittest.IsolatedAsyncioTestCase):
    async def classify_once(
        self,
        row,
        trades=None,
        fills=None,
        render_ok=True,
        persist_ok=True,
    ):
        store = {"AAPL": copy.deepcopy(row)}
        render_payloads = []

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            if not persist_ok:
                return False
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        async def forward(payload):
            render_payloads.append(copy.deepcopy(payload))
            return {"forwarded": True, "status_code": 200 if render_ok else 503}

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=0.0)),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
            patch.object(ib_bridge, "cleanup_orphan_targets_if_flat", AsyncMock(return_value={})),
            patch.object(ib_bridge.ib, "trades", return_value=trades or []),
            patch.object(ib_bridge.ib, "fills", return_value=fills or []),
        ):
            result = await ib_bridge.reconcile_managed_target_fills_once()
        return result, store, render_payloads

    async def test_exact_target_execution_is_tp_at_actual_fill(self):
        target = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Filled",
            filled=10,
            price=105.37,
            exec_id="TARGET-EXEC-1",
        )
        result, store, payloads = await self.classify_once(managed_edge_row(), trades=[target])
        self.assertEqual(payloads[0]["event"], "TP")
        self.assertEqual(payloads[0]["price"], 105.37)
        self.assertEqual(payloads[0]["qty"], 10)
        self.assertEqual(payloads[0]["reason"], "IB_TARGET_EXECUTION_CONFIRMED")
        self.assertEqual(store, {})
        self.assertEqual(result["reported"], 1)

    async def test_exact_perm_id_target_execution_remains_tp(self):
        target = fake_trade(
            order_id=999,
            perm_id=2200,
            order_ref="DIFFERENT_REF",
            action="SELL",
            status="Filled",
            filled=10,
            price=105.41,
            exec_id="TARGET-PERM-1",
        )
        _result, _store, payloads = await self.classify_once(
            managed_edge_row(),
            trades=[target],
        )
        self.assertEqual(payloads[0]["event"], "TP")
        self.assertEqual(payloads[0]["price"], 105.41)

    async def test_mismatched_strong_ids_reject_same_historical_order_ref(self):
        historical = fake_trade(
            order_id=999,
            perm_id=9999,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Filled",
            filled=10,
            price=105.22,
            exec_id="HISTORICAL-TARGET-1",
        )
        _result, _store, payloads = await self.classify_once(
            managed_edge_row(),
            trades=[historical],
        )
        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertNotEqual(payloads[0]["event"], "TP")

    async def test_legacy_order_ref_only_requires_post_entry_execution_time(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        row["target_order"]["order_id"] = ""
        row["target_order"]["perm_id"] = ""
        row["ib_target_order_id"] = ""
        row["ib_target_perm_id"] = ""

        before_entry = fake_trade(
            order_id=801,
            perm_id=8801,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Filled",
            filled=10,
            price=104.9,
            exec_id="LEGACY-BEFORE-1",
            execution_time=datetime(2026, 7, 28, 13, 59, tzinfo=timezone.utc),
        )
        _result, _store, before_payloads = await self.classify_once(
            row,
            trades=[before_entry],
        )
        self.assertEqual(before_payloads[0]["event"], "EXTERNAL_CLOSE")

        after_entry = fake_trade(
            order_id=802,
            perm_id=8802,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Filled",
            filled=10,
            price=105.18,
            exec_id="LEGACY-AFTER-1",
            execution_time=datetime(2026, 7, 28, 14, 1, tzinfo=timezone.utc),
        )
        _result, _store, after_payloads = await self.classify_once(
            row,
            trades=[after_entry],
        )
        self.assertEqual(after_payloads[0]["event"], "TP")
        self.assertEqual(after_payloads[0]["price"], 105.18)

    async def test_legacy_order_ref_only_ambiguous_executions_are_not_tp(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        row["target_order"]["order_id"] = ""
        row["target_order"]["perm_id"] = ""
        row["ib_target_order_id"] = ""
        row["ib_target_perm_id"] = ""
        execution_time = datetime(2026, 7, 28, 14, 1, tzinfo=timezone.utc)
        matches = [
            fake_trade(
                order_id=810 + index,
                perm_id=8810 + index,
                order_ref="TVFVG_AAPL_LONG_TP",
                action="SELL",
                status="Filled",
                filled=10,
                price=105.1 + index,
                exec_id=f"LEGACY-AMBIGUOUS-{index}",
                execution_time=execution_time,
            )
            for index in range(2)
        ]

        _result, _store, payloads = await self.classify_once(
            row,
            trades=matches,
        )
        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")

    async def test_submitted_but_unfilled_edge_entry_is_not_reconciled_as_close(self):
        row = managed_edge_row()
        row["entry_submission_state"] = "SUBMITTED"
        store = {"AAPL": copy.deepcopy(row)}
        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "load_managed_positions", return_value=copy.deepcopy(store)),
            patch.object(ib_bridge, "get_position_size", AsyncMock()) as get_position,
            patch.object(ib_bridge, "forward_to_render", AsyncMock()) as forward,
        ):
            result = await ib_bridge.reconcile_managed_target_fills_once()
        self.assertEqual(result["details"][0]["status"], "awaiting_edge_entry_fill")
        get_position.assert_not_awaited()
        forward.assert_not_awaited()

    async def test_manual_execution_without_entry_timestamp_has_no_price_or_qty(self):
        target = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Submitted",
            filled=0,
            price=0,
        )
        manual = fake_fill(
            order_id=900,
            perm_id=9900,
            exec_id="MANUAL-1",
            side="SLD",
            shares=10,
            price=101.75,
            order_ref="MANUAL_TWS",
            execution_time="2026-07-28T14:01:00Z",
        )
        _result, _store, payloads = await self.classify_once(
            managed_edge_row(),
            trades=[target],
            fills=[manual],
        )
        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertEqual(payloads[0]["price"], "")
        self.assertFalse(payloads[0]["exit_price_available"])
        self.assertEqual(payloads[0]["qty"], "")
        self.assertFalse(payloads[0]["exit_quantity_available"])
        self.assertEqual(payloads[0]["reason"], "IB_POSITION_FLAT_EXTERNAL_EXECUTION")

    async def test_post_entry_manual_execution_supplies_actual_price_and_qty(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        manual = fake_fill(
            order_id=902,
            perm_id=9902,
            exec_id="MANUAL-POST-ENTRY",
            side="SLD",
            shares=10,
            price=101.75,
            order_ref="MANUAL_TWS",
            execution_time="2026-07-28T14:01:00Z",
        )

        _result, _store, payloads = await self.classify_once(row, fills=[manual])

        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertEqual(payloads[0]["price"], 101.75)
        self.assertTrue(payloads[0]["exit_price_available"])
        self.assertEqual(payloads[0]["qty"], 10)
        self.assertTrue(payloads[0]["exit_quantity_available"])

    async def test_pre_entry_manual_execution_has_no_price_or_qty(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        manual = fake_fill(
            order_id=903,
            perm_id=9903,
            exec_id="MANUAL-PRE-ENTRY",
            side="SLD",
            shares=10,
            price=99.25,
            order_ref="MANUAL_TWS",
            execution_time=datetime(2026, 7, 28, 13, 59, tzinfo=timezone.utc),
        )

        _result, _store, payloads = await self.classify_once(row, fills=[manual])

        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertEqual(payloads[0]["price"], "")
        self.assertFalse(payloads[0]["exit_price_available"])
        self.assertEqual(payloads[0]["qty"], "")
        self.assertFalse(payloads[0]["exit_quantity_available"])

    def test_zero_execution_ids_fall_through_to_valid_identity(self):
        self.assertEqual(
            ib_bridge.execution_identity_text(
                perm_id=0,
                order_id="0",
                order_ref_value="TVFVG_MANUAL_AAPL",
            ),
            "REF:TVFVG_MANUAL_AAPL",
        )
        self.assertEqual(
            ib_bridge.execution_identity_text(
                perm_id="0",
                order_id=902,
                order_ref_value="TVFVG_MANUAL_AAPL",
            ),
            "ORDER:902",
        )

    async def test_canceled_target_then_manual_close_is_external(self):
        target = fake_trade(
            order_id=200,
            perm_id=2200,
            order_ref="TVFVG_AAPL_LONG_TP",
            action="SELL",
            status="Cancelled",
            filled=0,
            price=0,
        )
        manual = fake_fill(
            order_id=901,
            perm_id=9901,
            exec_id="MANUAL-2",
            side="SLD",
            shares=10,
            price=99.5,
        )
        _result, _store, payloads = await self.classify_once(
            managed_edge_row(),
            trades=[target],
            fills=[manual],
        )
        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertNotEqual(payloads[0]["event"], "TP")

    async def test_ambiguous_flat_is_external_without_fabricated_price(self):
        _result, _store, payloads = await self.classify_once(managed_edge_row())
        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertEqual(payloads[0]["price"], "")
        self.assertFalse(payloads[0]["exit_price_available"])
        self.assertEqual(payloads[0]["qty"], "")
        self.assertNotEqual(payloads[0].get("price"), 105)

    async def test_confirmed_bridge_stop_execution_has_stop_precedence(self):
        row = managed_edge_row()
        row["bridge_close_order"] = {
            "order_id": 300,
            "perm_id": 3300,
            "order_ref": "TVFVG_CLOSE_AAPL",
            "filled_qty": 10,
        }
        close = fake_trade(
            order_id=300,
            perm_id=3300,
            order_ref="TVFVG_CLOSE_AAPL",
            action="SELL",
            status="Filled",
            filled=10,
            price=97.25,
            exec_id="STOP-EXEC-1",
        )
        _result, _store, payloads = await self.classify_once(row, trades=[close])
        self.assertEqual(payloads[0]["event"], "CLOSE_STOP")
        self.assertEqual(payloads[0]["price"], 97.25)
        self.assertEqual(payloads[0]["reason"], "IB_STOP_CLOSE_EXECUTION_CONFIRMED")

    def test_multi_execution_attempt_uses_exact_trade_fills(self):
        row = managed_edge_row()
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 304,
            "perm_id": 3304,
            "order_ref": "TVFVG_CLOSE_AAPL_EXACT_MULTI",
            "order_qty": 7,
        }]
        close = attach_exact_trade_fills(
            fake_trade(
                order_id=304,
                perm_id=3304,
                order_ref="TVFVG_CLOSE_AAPL_EXACT_MULTI",
                action="SELL",
                status="Filled",
                filled=7,
                price=(3 * 98 + 4 * 97.9) / 7,
            ),
            [
                ("EXEC-1", 3, 98),
                ("EXEC-2", 4, 97.9),
            ],
        )

        evidence = ib_bridge.edge_close_attempt_execution_aggregate(
            row,
            [close],
            [],
        )

        self.assertIsNotNone(evidence)
        self.assertEqual(evidence["qty"], 7)
        self.assertEqual(evidence["price"], 97.94)
        self.assertEqual(evidence["exec_ids"], ["EXEC-1", "EXEC-2"])
        self.assertEqual(len(evidence["execution_components"]), 2)

    def test_trade_and_execution_history_duplicates_count_once(self):
        row = managed_edge_row()
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 305,
            "perm_id": 3305,
            "order_ref": "TVFVG_CLOSE_AAPL_DUPLICATE",
            "order_qty": 7,
        }]
        close = attach_exact_trade_fills(
            fake_trade(
                order_id=305,
                perm_id=3305,
                order_ref="TVFVG_CLOSE_AAPL_DUPLICATE",
                action="SELL",
                status="Filled",
                filled=7,
                price=(3 * 98 + 4 * 97.9) / 7,
            ),
            [
                ("EXEC-DUP-1", 3, 98),
                ("EXEC-DUP-2", 4, 97.9),
            ],
        )
        execution_history = [
            fake_fill(
                order_id=305,
                perm_id=3305,
                exec_id="EXEC-DUP-1",
                side="SLD",
                shares=3,
                price=98,
                order_ref="TVFVG_CLOSE_AAPL_DUPLICATE",
            ),
            fake_fill(
                order_id=305,
                perm_id=3305,
                exec_id="EXEC-DUP-2",
                side="SLD",
                shares=4,
                price=97.9,
                order_ref="TVFVG_CLOSE_AAPL_DUPLICATE",
            ),
        ]

        evidence = ib_bridge.edge_close_attempt_execution_aggregate(
            row,
            [close],
            execution_history,
        )

        self.assertIsNotNone(evidence)
        self.assertEqual(evidence["qty"], 7)
        self.assertEqual(
            evidence["exec_ids"],
            ["EXEC-DUP-1", "EXEC-DUP-2"],
        )

    def test_conflicting_duplicate_execution_blocks_publication(self):
        row = managed_edge_row()
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 306,
            "perm_id": 3306,
            "order_ref": "TVFVG_CLOSE_AAPL_CONFLICT",
            "order_qty": 7,
        }]
        close = attach_exact_trade_fills(
            fake_trade(
                order_id=306,
                perm_id=3306,
                order_ref="TVFVG_CLOSE_AAPL_CONFLICT",
                action="SELL",
                status="Filled",
                filled=7,
                price=97.9,
            ),
            [("EXEC-CONFLICT", 7, 97.9)],
        )
        conflicting_history = [fake_fill(
            order_id=306,
            perm_id=3306,
            exec_id="EXEC-CONFLICT",
            side="SLD",
            shares=7,
            price=98.1,
            order_ref="TVFVG_CLOSE_AAPL_CONFLICT",
        )]

        evidence = ib_bridge.edge_close_attempt_execution_aggregate(
            row,
            [close],
            conflicting_history,
        )

        self.assertIsNone(evidence)

    def test_restart_history_persists_multi_execution_partial_target(self):
        payload = edge_payload(event="CLOSE_STOP")
        row = managed_edge_row()
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "setup_id": row["setup_id"],
            "state": "CLOSE_SUBMITTED",
            "attempt": 1,
            "order_id": 307,
            "perm_id": 3307,
            "order_ref": "TVFVG_CLOSE_AAPL_RESTART",
            "remaining_qty": 7,
            "original_position_qty": 10,
        }
        target = attach_exact_trade_fills(
            fake_trade(
                order_id=200,
                perm_id=2200,
                order_ref="TVFVG_AAPL_LONG_TP",
                action="SELL",
                status="Cancelled",
                filled=3,
                price=(1 * 105 + 2 * 105.1) / 3,
            ),
            [
                ("TARGET-RESTART-1", 1, 105),
                ("TARGET-RESTART-2", 2, 105.1),
            ],
        )
        close = attach_exact_trade_fills(
            fake_trade(
                order_id=307,
                perm_id=3307,
                order_ref="TVFVG_CLOSE_AAPL_RESTART",
                action="SELL",
                status="Filled",
                filled=7,
                price=98,
            ),
            [("STOP-RESTART-7", 7, 98)],
        )
        store = {"AAPL": copy.deepcopy(row)}

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
        ):
            persisted = ib_bridge.persist_edge_close_attempt_history(
                payload,
                {
                    "trades": [target, close],
                    "fills": [],
                },
            )
            latest = copy.deepcopy(store["AAPL"])
            close_evidence = (
                ib_bridge.edge_close_attempt_execution_aggregate(
                    latest,
                    [close],
                    [],
                )
            )
            mixed = ib_bridge.edge_mixed_exit_reconciliation_evidence(
                latest,
                close_evidence,
            )

        self.assertTrue(persisted)
        reservation = latest["close_reservation"]
        self.assertEqual(
            reservation["target_partial_exec_ids"],
            ["TARGET-RESTART-1", "TARGET-RESTART-2"],
        )
        self.assertEqual(reservation["target_partial_filled_qty"], 3)
        self.assertEqual(
            len(reservation["target_partial_execution_components"]),
            2,
        )
        self.assertIsNotNone(mixed)
        self.assertEqual(mixed["qty"], 10)
        self.assertEqual(
            mixed["exec_ids"],
            [
                "STOP-RESTART-7",
                "TARGET-RESTART-1",
                "TARGET-RESTART-2",
            ],
        )

    async def test_partial_target_and_stop_reconcile_as_one_weighted_close(self):
        row = managed_edge_row()
        row["bridge_close_order"] = {
            "order_id": 305,
            "perm_id": 3305,
            "order_ref": "TVFVG_CLOSE_AAPL_MIXED",
            "filled_qty": 7,
        }
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "MIXED_EXIT_EVIDENCE_INCOMPLETE",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-MIXED-3"],
            "expected_remaining_qty": 7,
            "confirmed_remaining_qty": 7,
            "remaining_qty": 7,
        }
        close = fake_trade(
            order_id=305,
            perm_id=3305,
            order_ref="TVFVG_CLOSE_AAPL_MIXED",
            action="SELL",
            status="Filled",
            filled=7,
            price=98,
            exec_id="STOP-MIXED-7",
        )

        result, store, payloads = await self.classify_once(
            row,
            trades=[close],
        )

        self.assertEqual(result["reported"], 1)
        self.assertEqual(store, {})
        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]["event"], "CLOSE_STOP")
        self.assertEqual(payloads[0]["qty"], 10)
        self.assertEqual(payloads[0]["price"], 100.1)
        self.assertEqual(
            payloads[0]["reason"],
            "IB_STOP_CLOSE_WITH_PARTIAL_TARGET_EXECUTION_CONFIRMED",
        )
        self.assertEqual(
            payloads[0]["mixed_exit_exec_ids"],
            ["STOP-MIXED-7", "TARGET-MIXED-3"],
        )
        self.assertTrue(payloads[0]["mixed_exit_evidence_complete"])

    async def test_partial_target_and_multiple_stop_attempts_aggregate_once(self):
        row = managed_edge_row()
        row["close_attempts"] = [
            {
                "attempt": 1,
                "order_id": 307,
                "perm_id": 3307,
                "order_ref": "TVFVG_CLOSE_AAPL_MULTI",
                "order_qty": 7,
            },
            {
                "attempt": 2,
                "order_id": 308,
                "perm_id": 3308,
                "order_ref": "TVFVG_CLOSE_AAPL_MULTI_2",
                "order_qty": 5,
            },
        ]
        row["bridge_close_order"] = {
            "order_id": 308,
            "perm_id": 3308,
            "order_ref": "TVFVG_CLOSE_AAPL_MULTI_2",
            "filled_qty": 5,
        }
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "CALLBACK_PENDING",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-MULTI-3"],
            "expected_remaining_qty": 7,
            "confirmed_remaining_qty": 5,
            "remaining_qty": 5,
            "attempt": 2,
        }
        attempts = [
            fake_trade(
                order_id=307,
                perm_id=3307,
                order_ref="TVFVG_CLOSE_AAPL_MULTI",
                action="SELL",
                status="Filled",
                filled=2,
                price=98,
                exec_id="STOP-MULTI-2",
            ),
            fake_trade(
                order_id=308,
                perm_id=3308,
                order_ref="TVFVG_CLOSE_AAPL_MULTI_2",
                action="SELL",
                status="Filled",
                filled=5,
                price=97,
                exec_id="STOP-MULTI-5",
            ),
        ]

        result, store, payloads = await self.classify_once(
            row,
            trades=attempts,
        )

        self.assertEqual(result["reported"], 1)
        self.assertEqual(store, {})
        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]["event"], "CLOSE_STOP")
        self.assertEqual(payloads[0]["qty"], 10)
        self.assertEqual(payloads[0]["price"], 99.6)
        self.assertEqual(
            payloads[0]["mixed_exit_exec_ids"],
            ["STOP-MULTI-2", "STOP-MULTI-5", "TARGET-MULTI-3"],
        )
        self.assertEqual(len(payloads[0]["close_attempts"]), 2)
        for exec_id in (
            "TARGET-MULTI-3",
            "STOP-MULTI-2",
            "STOP-MULTI-5",
        ):
            self.assertIn(exec_id, payloads[0]["reconciliation_id"])

    def test_partial_stop_and_replacement_are_append_preserved_and_aggregated(self):
        row = managed_edge_row()
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "setup_id": row["setup_id"],
            "state": "CLOSE_SUBMITTED",
            "attempt": 1,
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-PERSIST-3"],
            "expected_remaining_qty": 7,
            "remaining_qty": 7,
        }
        store = {"AAPL": copy.deepcopy(row)}

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        first = {
            "status": "EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN",
            "attempt": 1,
            "qty": 7,
            "order_id": 319,
            "order_perm_id": 3319,
            "order_ref": "TVFVG_CLOSE_AAPL_PERSIST",
            "close_status": "Cancelled",
            "close_filled": False,
            "close_filled_qty": 2,
            "close_fill_price": 98,
            "close_exec_ids": ["STOP-PERSIST-2"],
        }
        second = {
            "status": "EDGE_STOP_MIXED_EXIT_EVIDENCE_INCOMPLETE",
            "attempt": 2,
            "qty": 5,
            "order_id": 320,
            "order_perm_id": 3320,
            "order_ref": "TVFVG_CLOSE_AAPL_PERSIST_2",
            "close_status": "Filled",
            "close_filled": True,
            "close_filled_qty": 5,
            "close_fill_price": 97,
            "close_exec_ids": ["STOP-PERSIST-5"],
            "broker_confirmed_flat": True,
        }

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
        ):
            self.assertTrue(
                ib_bridge.mark_managed_bridge_close(
                    edge_payload(event="CLOSE_STOP"),
                    first,
                )
            )
            self.assertTrue(
                ib_bridge.mark_managed_bridge_close(
                    edge_payload(event="CLOSE_STOP"),
                    second,
                )
            )

        self.assertEqual(
            [attempt["attempt"] for attempt in store["AAPL"]["close_attempts"]],
            [1, 2],
        )
        self.assertEqual(
            store["AAPL"]["close_attempts"][0]["filled_qty"],
            2,
        )
        self.assertEqual(
            store["AAPL"]["close_attempts"][1]["filled_qty"],
            5,
        )
        self.assertEqual(
            store["AAPL"]["bridge_close_order"]["filled_qty"],
            5,
            "the latest-order compatibility field does not inherit attempt 1",
        )

        with (
            patch.object(ib_bridge.ib, "trades", return_value=[]),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
        ):
            payload, _reconciliation_id = (
                ib_bridge.edge_reconciliation_payload(store["AAPL"])
            )
        self.assertEqual(payload["event"], "CLOSE_STOP")
        self.assertEqual(payload["qty"], 10)
        self.assertEqual(payload["price"], 99.6)

    def test_restart_reconstructs_all_stop_attempts_from_execution_history(self):
        row = managed_edge_row()
        row["close_attempts"] = [
            {
                "attempt": 1,
                "order_id": 317,
                "perm_id": 3317,
                "order_ref": "TVFVG_CLOSE_AAPL_HISTORY",
                "order_qty": 7,
            },
            {
                "attempt": 2,
                "order_id": 318,
                "perm_id": 3318,
                "order_ref": "TVFVG_CLOSE_AAPL_HISTORY_2",
                "order_qty": 5,
            },
        ]
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "CALLBACK_PENDING",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-HISTORY-3"],
            "expected_remaining_qty": 7,
            "remaining_qty": 5,
            "attempt": 2,
        }
        store = {"AAPL": copy.deepcopy(row)}
        history = [
            fake_trade(
                order_id=317,
                perm_id=3317,
                order_ref="TVFVG_CLOSE_AAPL_HISTORY",
                action="SELL",
                status="Filled",
                filled=2,
                price=98,
                exec_id="STOP-HISTORY-2",
            ),
            fake_trade(
                order_id=318,
                perm_id=3318,
                order_ref="TVFVG_CLOSE_AAPL_HISTORY_2",
                action="SELL",
                status="Filled",
                filled=5,
                price=97,
                exec_id="STOP-HISTORY-5",
            ),
        ]

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
        ):
            persisted = ib_bridge.persist_edge_close_attempt_history(
                edge_payload(event="CLOSE_STOP"),
                {"trades": history, "fills": []},
            )
        self.assertTrue(persisted)

        with (
            patch.object(ib_bridge.ib, "trades", return_value=[]),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
        ):
            payload, reconciliation_id = (
                ib_bridge.edge_reconciliation_payload(store["AAPL"])
            )
        self.assertEqual(payload["event"], "CLOSE_STOP")
        self.assertEqual(payload["qty"], 10)
        self.assertEqual(payload["price"], 99.6)
        self.assertIn("STOP-HISTORY-2", reconciliation_id)
        self.assertIn("STOP-HISTORY-5", reconciliation_id)

    async def test_partial_target_and_manual_remainder_publish_one_manual_close(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "MIXED_EXIT_EVIDENCE_INCOMPLETE",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-MANUAL-3"],
            "expected_remaining_qty": 7,
        }
        manual = fake_fill(
            order_id=910,
            perm_id=9910,
            exec_id="MANUAL-REMAINDER-7",
            side="SLD",
            shares=7,
            price=99,
            order_ref="MANUAL_TWS",
            execution_time="2026-07-28T14:01:00Z",
        )

        result, store, payloads = await self.classify_once(
            row,
            fills=[manual],
        )

        self.assertEqual(result["reported"], 1)
        self.assertEqual(store, {})
        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertEqual(payloads[0]["qty"], 10)
        self.assertEqual(payloads[0]["price"], 100.8)
        self.assertEqual(
            payloads[0]["reason"],
            "IB_MANUAL_CLOSE_WITH_PARTIAL_TARGET_EXECUTION_CONFIRMED",
        )
        self.assertEqual(payloads[0]["external_close_filled_qty"], 7)
        self.assertEqual(
            payloads[0]["mixed_exit_exec_ids"],
            ["MANUAL-REMAINDER-7", "TARGET-MANUAL-3"],
        )

    def test_restart_retains_manual_remainder_from_execution_history(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "MIXED_EXIT_EVIDENCE_INCOMPLETE",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-MANUAL-HISTORY-3"],
            "expected_remaining_qty": 7,
        }
        store = {"AAPL": copy.deepcopy(row)}
        manual = fake_fill(
            order_id=911,
            perm_id=9911,
            exec_id="MANUAL-HISTORY-7",
            side="SLD",
            shares=7,
            price=99,
            order_ref="MANUAL_TWS",
            execution_time="2026-07-28T14:01:00Z",
        )

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        with (
            patch.object(
                ib_bridge,
                "load_managed_positions",
                side_effect=load_managed,
            ),
            patch.object(
                ib_bridge,
                "save_managed_positions",
                side_effect=save_managed,
            ),
        ):
            persisted = ib_bridge.persist_edge_close_attempt_history(
                edge_payload(event="CLOSE_STOP"),
                {"trades": [], "fills": [manual]},
            )
        self.assertTrue(persisted)

        with (
            patch.object(ib_bridge.ib, "trades", return_value=[]),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
        ):
            payload, reconciliation_id = (
                ib_bridge.edge_reconciliation_payload(store["AAPL"])
            )
        self.assertEqual(payload["event"], "EXTERNAL_CLOSE")
        self.assertEqual(payload["qty"], 10)
        self.assertEqual(payload["price"], 100.8)
        self.assertIn("MANUAL-HISTORY-7", reconciliation_id)

    async def test_incomplete_mixed_exit_evidence_withholds_reconciliation(self):
        row = managed_edge_row()
        row["bridge_close_order"] = {
            "order_id": 306,
            "perm_id": 3306,
            "order_ref": "TVFVG_CLOSE_AAPL_MIXED_MISSING",
            "filled_qty": 7,
        }
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "CALLBACK_PENDING",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": [],
            "remaining_qty": 7,
        }
        close = fake_trade(
            order_id=306,
            perm_id=3306,
            order_ref="TVFVG_CLOSE_AAPL_MIXED_MISSING",
            action="SELL",
            status="Filled",
            filled=7,
            price=98,
            exec_id="STOP-MIXED-MISSING",
        )

        result, store, payloads = await self.classify_once(
            row,
            trades=[close],
        )

        self.assertEqual(result["reported"], 0)
        self.assertEqual(
            result["details"][0]["status"],
            "EDGE_STOP_MIXED_EXIT_EVIDENCE_INCOMPLETE",
        )
        self.assertEqual(payloads, [])
        self.assertIn("AAPL", store)
        self.assertEqual(
            store["AAPL"]["close_reservation"]["state"],
            "MIXED_EXIT_EVIDENCE_INCOMPLETE",
        )

    async def test_stop_component_without_exec_id_never_publishes(self):
        row = managed_edge_row()
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 360,
            "perm_id": 3360,
            "order_ref": "TVFVG_CLOSE_AAPL_NO_EXEC",
            "order_qty": 7,
        }]
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "CALLBACK_PENDING",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-EXACT-3"],
            "remaining_qty": 7,
        }
        close = fake_trade(
            order_id=360,
            perm_id=3360,
            order_ref="TVFVG_CLOSE_AAPL_NO_EXEC",
            action="SELL",
            status="Filled",
            filled=7,
            price=98,
            exec_id="",
        )

        result, store, payloads = await self.classify_once(
            row,
            trades=[close],
        )

        self.assertEqual(result["reported"], 0)
        self.assertEqual(payloads, [])
        self.assertEqual(
            result["details"][0]["status"],
            "EDGE_STOP_MIXED_EXIT_EVIDENCE_INCOMPLETE",
        )
        self.assertIn("AAPL", store)

    def test_duplicate_exec_id_is_counted_once(self):
        row = managed_edge_row()
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 361,
            "perm_id": 3361,
            "order_ref": "TVFVG_CLOSE_AAPL_DUP",
            "order_qty": 7,
            "filled_qty": 7,
            "avg_fill_price": 98,
            "exec_ids": ["STOP-DUP-7"],
        }]
        duplicate = fake_fill(
            order_id=361,
            perm_id=3361,
            exec_id="STOP-DUP-7",
            side="SLD",
            shares=7,
            price=98,
            order_ref="TVFVG_CLOSE_AAPL_DUP",
        )

        evidence = ib_bridge.edge_close_attempt_execution_aggregate(
            row,
            trades=[],
            fills=[duplicate, copy.deepcopy(duplicate)],
        )

        self.assertEqual(evidence["qty"], 7)
        self.assertEqual(evidence["price"], 98)
        self.assertEqual(evidence["exec_ids"], ["STOP-DUP-7"])

    def test_overlapping_exec_ids_keep_nonoverlapping_attempt_fill(self):
        row = managed_edge_row()
        row["close_attempts"] = [
            {
                "attempt": 1,
                "order_id": 364,
                "perm_id": 3364,
                "order_ref": "TVFVG_CLOSE_AAPL_OVERLAP_1",
                "filled_qty": 2,
                "avg_fill_price": 98,
                "exec_ids": ["STOP-OVERLAP-2"],
            },
            {
                "attempt": 2,
                "order_id": 365,
                "perm_id": 3365,
                "order_ref": "TVFVG_CLOSE_AAPL_OVERLAP_2",
                "filled_qty": 2,
                "avg_fill_price": 98,
                "exec_ids": ["STOP-OVERLAP-2"],
            },
            {
                "attempt": 3,
                "order_id": 366,
                "perm_id": 3366,
                "order_ref": "TVFVG_CLOSE_AAPL_OVERLAP_3",
                "filled_qty": 5,
                "avg_fill_price": 97,
                "exec_ids": ["STOP-UNIQUE-5"],
            },
        ]

        evidence = ib_bridge.edge_close_attempt_execution_aggregate(
            row,
            trades=[],
            fills=[],
        )

        self.assertEqual(evidence["qty"], 7)
        self.assertEqual(evidence["exec_ids"], [
            "STOP-OVERLAP-2",
            "STOP-UNIQUE-5",
        ])

    async def test_multi_exec_target_and_stop_publish_unique_weighted_fill(self):
        row = managed_edge_row()
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 367,
            "perm_id": 3367,
            "order_ref": "TVFVG_CLOSE_AAPL_TARGET_MULTI",
            "filled_qty": 7,
            "avg_fill_price": 98,
            "exec_ids": ["STOP-TARGET-MULTI-7"],
        }]
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "CALLBACK_PENDING",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105.67,
            "target_partial_exec_ids": ["TARGET-MULTI-1", "TARGET-MULTI-2"],
            "target_partial_execution_components": [
                {"exec_id": "TARGET-MULTI-1", "qty": 1, "price": 105},
                {"exec_id": "TARGET-MULTI-2", "qty": 2, "price": 106},
            ],
            "remaining_qty": 7,
        }

        result, store, payloads = await self.classify_once(row)

        self.assertEqual(result["reported"], 1)
        self.assertEqual(store, {})
        self.assertEqual(payloads[0]["event"], "CLOSE_STOP")
        self.assertEqual(payloads[0]["price"], 100.3)
        self.assertEqual(payloads[0]["mixed_exit_exec_ids"], [
            "STOP-TARGET-MULTI-7",
            "TARGET-MULTI-1",
            "TARGET-MULTI-2",
        ])

    async def test_conflicting_duplicate_exec_id_withholds_publication(self):
        row = managed_edge_row()
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 362,
            "perm_id": 3362,
            "order_ref": "TVFVG_CLOSE_AAPL_CONFLICT",
            "order_qty": 7,
            "filled_qty": 7,
            "avg_fill_price": 98,
            "exec_ids": ["STOP-CONFLICT"],
        }]
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "CALLBACK_PENDING",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-CONFLICT-3"],
            "remaining_qty": 7,
        }
        fills = [
            fake_fill(
                order_id=362,
                perm_id=3362,
                exec_id="STOP-CONFLICT",
                side="SLD",
                shares=7,
                price=98,
                order_ref="TVFVG_CLOSE_AAPL_CONFLICT",
            ),
            fake_fill(
                order_id=362,
                perm_id=3362,
                exec_id="STOP-CONFLICT",
                side="SLD",
                shares=6,
                price=97,
                order_ref="TVFVG_CLOSE_AAPL_CONFLICT",
            ),
        ]

        result, store, payloads = await self.classify_once(
            row,
            fills=fills,
        )

        self.assertEqual(result["reported"], 0)
        self.assertEqual(payloads, [])
        self.assertEqual(
            result["details"][0]["status"],
            "EDGE_STOP_MIXED_EXIT_EVIDENCE_INCOMPLETE",
        )
        self.assertIn("AAPL", store)

    async def test_partial_target_and_manual_require_both_exec_ids(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "MIXED_EXIT_EVIDENCE_INCOMPLETE",
            "original_position_qty": 10,
            "target_partial_filled_qty": 3,
            "target_partial_fill_price": 105,
            "target_partial_exec_ids": ["TARGET-MANUAL-EXACT-3"],
            "expected_remaining_qty": 7,
        }
        manual_without_exec_id = fake_fill(
            order_id=920,
            perm_id=9920,
            exec_id="",
            side="SLD",
            shares=7,
            price=99,
            order_ref="MANUAL_TWS",
            execution_time="2026-07-28T14:01:00Z",
        )

        result, store, payloads = await self.classify_once(
            row,
            fills=[manual_without_exec_id],
        )

        self.assertEqual(result["reported"], 0)
        self.assertEqual(payloads, [])
        self.assertEqual(
            result["details"][0]["status"],
            "EDGE_STOP_MIXED_EXIT_EVIDENCE_INCOMPLETE",
        )
        self.assertIn("AAPL", store)

    async def test_partial_stop_and_manual_use_complete_exec_id_set(self):
        row = managed_edge_row()
        row["entry_filled_at"] = "2026-07-28T10:00:00-04:00"
        row["close_attempts"] = [{
            "attempt": 1,
            "order_id": 363,
            "perm_id": 3363,
            "order_ref": "TVFVG_CLOSE_AAPL_STOP_MANUAL",
            "order_qty": 10,
            "filled_qty": 4,
            "avg_fill_price": 98,
            "exec_ids": ["STOP-MANUAL-4"],
        }]
        row["close_reservation"] = {
            "reservation_id": ib_bridge.edge_stop_close_reservation_id(
                row["setup_id"],
            ),
            "state": "MIXED_EXIT_EVIDENCE_INCOMPLETE",
            "original_position_qty": 10,
            "target_partial_filled_qty": 0,
            "remaining_qty": 6,
        }
        manual = fake_fill(
            order_id=921,
            perm_id=9921,
            exec_id="MANUAL-STOP-6",
            side="SLD",
            shares=6,
            price=99,
            order_ref="MANUAL_TWS",
            execution_time="2026-07-28T14:01:00Z",
        )

        result, store, payloads = await self.classify_once(
            row,
            fills=[manual],
        )

        self.assertEqual(result["reported"], 1)
        self.assertEqual(store, {})
        self.assertEqual(payloads[0]["event"], "EXTERNAL_CLOSE")
        self.assertEqual(payloads[0]["qty"], 10)
        self.assertEqual(payloads[0]["price"], 98.6)
        self.assertEqual(
            payloads[0]["mixed_exit_exec_ids"],
            ["MANUAL-STOP-6", "STOP-MANUAL-4"],
        )
        self.assertIn(
            "EXEC:MANUAL-STOP-6,STOP-MANUAL-4",
            payloads[0]["reconciliation_id"],
        )

    async def test_claim_persistence_failure_withholds_render_callback(self):
        result, store, render_payloads = await self.classify_once(
            managed_edge_row(),
            persist_ok=False,
        )

        self.assertEqual(
            result["details"][0]["status"],
            "reconciliation_claim_persistence_failed",
        )
        self.assertEqual(render_payloads, [])
        self.assertIn("AAPL", store)

    async def test_failed_render_retains_claim_and_success_clears_once(self):
        row = managed_edge_row()
        store = {"AAPL": copy.deepcopy(row)}
        payloads = []
        render_results = iter([503, 200])

        def load_managed():
            return copy.deepcopy(store)

        def save_managed(value):
            store.clear()
            store.update(copy.deepcopy(value))
            return True

        async def forward(payload):
            payloads.append(copy.deepcopy(payload))
            return {"forwarded": True, "status_code": next(render_results)}

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=0.0)),
            patch.object(ib_bridge, "load_managed_positions", side_effect=load_managed),
            patch.object(ib_bridge, "save_managed_positions", side_effect=save_managed),
            patch.object(ib_bridge, "forward_to_render", side_effect=forward),
            patch.object(ib_bridge, "cleanup_orphan_targets_if_flat", AsyncMock(return_value={})),
            patch.object(ib_bridge.ib, "trades", return_value=[]),
            patch.object(ib_bridge.ib, "fills", return_value=[]),
        ):
            failed = await ib_bridge.reconcile_managed_target_fills_once()
            self.assertIn("AAPL", store)
            self.assertIn("reconciliation_claim", store["AAPL"])
            succeeded = await ib_bridge.reconcile_managed_target_fills_once()
            self.assertEqual(store, {})
            third = await ib_bridge.reconcile_managed_target_fills_once()

        self.assertEqual(failed["details"][0]["status"], "render_delivery_failed_retry_retained")
        self.assertEqual(succeeded["reported"], 1)
        self.assertEqual(third["checked"], 0)
        self.assertEqual(len(payloads), 2)
        self.assertEqual(payloads[0], payloads[1])


if __name__ == "__main__":
    unittest.main()
