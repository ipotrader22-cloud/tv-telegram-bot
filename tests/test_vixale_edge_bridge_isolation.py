import copy
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

    async def asyncTearDown(self):
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

        return result, store, render_payloads, verify_flat

    async def test_immediate_edge_stop_fill_flat_publishes_once(self):
        result, store, render_payloads, verify_flat = (
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

    async def test_immediate_edge_stop_fill_nonflat_withholds_public_close(self):
        result, store, render_payloads, _verify_flat = (
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
