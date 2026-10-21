"""Real adapter control flow with a non-network broker fixture."""
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import time
from types import SimpleNamespace as N
import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from unittest.mock import patch

from bridge.smio_demo_adapter import DemoLifecycle, digest, send_callback
from bridge.smio_demo_contract import CONTRACT


def signal(side="LONG", mode="ATR"):
    end = int(time.time() * 1000) - 100
    start = end - 45 * 60000
    cfg = "PINE01:20:5:5:2:true:true:8:21:200:" + ("RSI 80/20" if mode == "RSI_80_20" else "First of either" if mode == "FirstOfEither" else "ATR") + ":1:Stocks RTH:true"
    setup = f"SMIO_RSI_RESEARCH:{cfg}:NASDAQ:APA:45:{side}:{start}"
    target = None if mode == "RSI_80_20" else 110 if side == "LONG" else 90
    name = "BUY" if side == "LONG" else "SELL"
    return {"source": "TradingView", "system_id": "TRADING_LAB_SMIO_RSI_PAPER", "strategy_id": "SMIO_RSI_RESEARCH",
            "experimental_contract": CONTRACT,
            "mode": "PAPER", "paper_contract_version": 1, "research_version": "PINE_0.1", "sec_type": "STK",
            "symbol": "APA", "tickerid": "NASDAQ:APA", "timeframe": "45", "configuration_id": cfg,
            "setup_id": setup, "event_id": f"{setup}:{name}:{end}:RSI_ENTRY", "signal": name, "event": "SETUP",
            "side": side, "reason": "RSI_ENTRY", "signal_bar_time": start, "signal_bar_close": end,
            "qty": 10, "qty_source": "TV Strategy Properties", "initial_capital": 1000000,
            "entry": 100, "price": 100, "entry_order_type": "MARKET", "target_mode": mode,
            "target": target, "target_price": target, "session_timezone": "America/New_York"}


def close_signal(data, reason="RSI_STOP"):
    p = {**data, "signal": "CLOSE", "event": "CLOSE_POSITION", "reason": reason}
    p["event_id"] = f"{p['setup_id']}:CLOSE:{p['signal_bar_close']}:{reason}"
    return p


class Order:
    def __init__(self, action, totalQuantity, lmtPrice=None, **kwargs):
        self.action, self.totalQuantity, self.lmtPrice = action, totalQuantity, lmtPrice
        self.orderId, self.orderRef, self.transmit = 0, "", True
        self.__dict__.update(kwargs)


class Broker:
    def __init__(self):
        self.history, self.executions, self.mutations, self.cancels = [], [], [], []
        self.position, self.counter, self.accounts, self.cancel_fill = 0, 100, ["DEMO"], 0
        self.client = N(getReqId=self.id)

    def id(self):
        self.counter += 1
        return self.counter

    def managedAccounts(self): return self.accounts
    def trades(self): return self.history
    def fills(self): return self.executions
    def openTrades(self): return [t for t in self.history if t.orderStatus.status in ("Submitted", "PreSubmitted")]
    async def reqPositionsAsync(self): pass
    async def reqOpenOrdersAsync(self): pass
    async def reqExecutionsAsync(self): return self.executions
    async def reqCompletedOrdersAsync(self, api_only): return self.history
    async def reqContractDetailsAsync(self, contract): return [N(minTick=0.01)]

    def placeOrder(self, contract, order):
        self.mutations.append(order.orderRef)
        old = next((t for t in self.history if t.order.orderId == order.orderId), None)
        if old: return old
        trade = N(contract=contract, order=order, orderStatus=N(status="Submitted"), fills=[])
        self.history.append(trade)
        if order.orderRef.startswith("SMIOC_"):
            self.fill(trade, order.totalQuantity, 105)
        return trade

    def fill(self, trade, qty, price):
        trade.orderStatus.status = "Filled"
        delta = qty if trade.order.action == "BUY" else -qty
        self.position += delta
        e = N(acctNumber="DEMO", orderId=trade.order.orderId, orderRef=trade.order.orderRef,
              side="BOT" if delta > 0 else "SLD", shares=qty, price=price,
              time=datetime.now(timezone.utc),
              execId=f"execution-{len(self.executions) + 1}")
        fill = N(contract=trade.contract, execution=e)
        trade.fills.append(fill)
        self.executions.append(fill)

    def cancelOrder(self, order):
        self.cancels.append(order.orderRef)
        trade = next(t for t in self.history if t.order.orderId == order.orderId)
        if self.cancel_fill:
            self.fill(trade, self.cancel_fill, 110)
        trade.orderStatus.status = "Filled" if self.cancel_fill == order.totalQuantity else "Cancelled"


class Core:
    RENDER_WEBHOOK_URL = "https://example.test/tv"
    BRIDGE_PROCESS_INSTANCE_ID = "fake-process"
    _ib_connection_generation = 1
    history_covered = True
    DRY_RUN = False
    BLOCK_MARKET_CLOSES_OUTSIDE_RTH = False
    MarketOrder = LimitOrder = Order
    def __init__(self):
        self.ib, self.ib_lock, self.outbox, self.managed = Broker(), asyncio.Lock(), {}, {}
        self.rth = True
    async def ensure_ib_connected(self): pass
    async def get_position_size(self, symbol): return self.ib.position
    async def qualify_contract(self, data): return N(symbol=data["symbol"])
    async def bounded_ib_refresh_request(self, method, contract):
        return {"ok": True, "values": [N(
            timeZoneId="America/New_York",
            liquidHours="20261022:0930-20261022:1600"
        )]}
    def ib_session_timezone(self, name): return ZoneInfo("America/New_York")
    def parse_ib_session_stamp(self, value, default_day, zone):
        try:
            date, clock = value.split(":")
            return datetime.strptime(date + clock, "%Y%m%d%H%M").replace(tzinfo=zone)
        except Exception:
            return None
    def validate_pretrade_risk(self, *args): pass
    def validate_entry_timing(self, *args): pass
    def is_us_stock_rth_now(self): return self.rth
    def load_managed_positions(self): return self.managed
    def load_render_outbox(self): return self.outbox
    def render_quote_update_url(self): return "https://example.test/bridge/quotes?key=fixture"
    def comparable_execution_time(self, value):
        return datetime.fromisoformat(value) if isinstance(value, str) else value
    def execution_history_coverage_metadata(self, *args):
        return {"execution_history_covers_signal": self.history_covered, "coverage_reason": "fixture"}
    def enqueue_render_outbox(self, payload):
        key = payload["bridge_delivery_id"]
        self.outbox[key] = payload
        return key, True


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.core = Core()
        self.engine = DemoLifecycle(self.core, self.root / "config.json", self.root / "journal.json")
        self.config = {"experimental_contract": CONTRACT, "simulated_ui_verified": True,
                       "account": "DEMO", "uam_snapshot_directory": str(self.root)}
        self.engine.config_path.write_text(json.dumps(self.config))

    def tearDown(self): self.tmp.cleanup()

    def snapshot(self, data):
        p = self.root / f"APA_45_{digest(data['configuration_id'])[:16]}.json"
        p.write_text(json.dumps({k: data[k] for k in ("symbol", "timeframe", "configuration_id")} |
                               {"experimental_contract": CONTRACT, "properties_verified": True, "status": "PREPARED"}))

    async def open_position(self, data, qty=10):
        self.snapshot(data)
        result = await self.engine.handle(data)
        self.assertEqual(result["status"], "smio_demo_accepted", result)
        self.core.ib.fill(self.core.ib.history[0], qty, 100)
        if qty < data["qty"]:
            self.core.ib.history[0].orderStatus.status = "Cancelled"
        await self.engine.reconcile()
        if qty < 10:
            await self.engine.reconcile()  # exact target repair then fill publication
        self.assertEqual(len(self.core.outbox), 1)
        self.core.outbox.clear()  # fake Render acknowledged OPEN publication

    async def test_scheduler_eod_full_broker_fixture_to_flat_callback(self):
        """Scheduler -> validated CLOSE -> exact target cancel -> filled flat -> callback."""
        data = signal()
        await self.open_position(data)
        with patch.dict("os.environ", {"SMIO_DEMO_EOD_FAILSAFE_ENABLED": "true"}), \
             patch("bridge.smio_eod_policy.eod_due", return_value=True):
            await self.engine.eod_failsafe_pass(datetime(2026,10,22,15,55,tzinfo=ZoneInfo('America/New_York')))
            self.assertEqual(self.core.ib.position, 0)
            self.assertEqual(len(self.core.ib.cancels), 1)
            self.assertEqual(len([x for x in self.core.ib.mutations if x.startswith("SMIOC_")]), 1)
            await self.engine.reconcile()
            callback = next(iter(self.core.outbox.values()))
            self.assertEqual(callback["event"], "EOD_CLOSE")
            self.assertTrue(callback["broker_confirmed_flat"])
            self.assertEqual(callback["position_after_close"], 0)
            await self.engine.eod_failsafe_pass()
            self.assertEqual(len([x for x in self.core.ib.mutations if x.startswith("SMIOC_")]), 1)

    async def test_scheduler_disabled_or_outside_rth_mutates_nothing(self):
        data = signal()
        await self.open_position(data)
        before = list(self.core.ib.mutations)
        with patch.dict("os.environ", {"SMIO_DEMO_EOD_FAILSAFE_ENABLED": ""}), \
             patch("bridge.smio_eod_policy.eod_due", return_value=False):
            await self.engine.eod_failsafe_pass()
        self.assertEqual(self.core.ib.mutations, before)
        self.core.rth = False
        with patch.dict("os.environ", {"SMIO_DEMO_EOD_FAILSAFE_ENABLED": "true"}), \
             patch("bridge.smio_eod_policy.eod_due", return_value=True):
            await self.engine.eod_failsafe_pass()
        self.assertEqual(self.core.ib.mutations, before)
        self.assertEqual(self.core.ib.cancels, [])

    async def test_scheduler_unproven_history_blocks_without_cancel(self):
        data = signal()
        await self.open_position(data)
        self.core.history_covered = False
        with patch.dict("os.environ", {"SMIO_DEMO_EOD_FAILSAFE_ENABLED": "true"}), \
             patch("bridge.smio_eod_policy.eod_due", return_value=True):
            await self.engine.eod_failsafe_pass()
        self.assertEqual(self.core.ib.cancels, [])
        self.assertEqual(self.core.ib.position, 10)
        self.assertFalse(any(x.startswith("SMIOC_") for x in self.core.ib.mutations))

    async def test_buy_sell_and_rsi_only_close(self):
        for side in ("LONG", "SHORT"):
            with self.subTest(side=side):
                self.core = Core()
                self.engine = DemoLifecycle(self.core, self.root / "config.json", self.root / f"journal-{side}.json")
                data = signal(side, "RSI_80_20")
                await self.open_position(data)
                result = await self.engine.handle(close_signal(data))
                self.assertEqual(result["status"], "smio_demo_accepted", result)
                await self.engine.reconcile()
                exit = next(iter(self.core.outbox.values()))
                self.assertEqual(exit["event"], "CLOSE_STOP")
                self.assertEqual(exit["position_after_close"], 0)
                self.assertEqual(exit["qty"], 10)
                self.assertEqual(self.core.ib.cancels, [])

    async def test_duplicate_conflict_stale_and_no_quantity_fallback(self):
        data = signal()
        self.snapshot(data)
        for qty in (None, 0, -1, 1.5, True):
            self.assertEqual((await self.engine.handle({**data, "qty": qty}))["status"], "smio_demo_blocked")
        self.assertEqual(self.core.ib.mutations, [])
        self.assertEqual((await self.engine.handle(data))["status"], "smio_demo_accepted")
        self.assertEqual((await self.engine.handle(data))["status"], "smio_duplicate")
        self.assertEqual((await self.engine.handle({**data, "qty": 20}))["status"], "smio_demo_blocked")
        self.assertEqual(len(self.core.ib.mutations), 2)
        restart = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        self.assertEqual((await restart.handle(data))["status"], "smio_duplicate")
        self.assertEqual(len(self.core.ib.mutations), 2)

    async def test_no_foreign_orders_or_state_writes_on_failed_proof(self):
        data = signal()
        self.snapshot(data)
        self.core.ib.accounts = ["LIVE"]
        self.assertEqual((await self.engine.handle(data))["status"], "smio_demo_blocked")
        self.core.ib.accounts = ["DEMO"]
        self.core.managed["APA"] = {"system_id": "VIXALE_EDGE"}
        self.assertEqual((await self.engine.handle(data))["status"], "smio_demo_blocked")
        self.core.managed.clear()
        with patch.object(self.engine, "save", side_effect=OSError("disk full")):
            self.assertEqual((await self.engine.handle(data))["status"], "smio_demo_blocked")
        self.assertEqual(self.core.ib.mutations, [])
        self.assertEqual(self.core.ib.cancels, [])

    async def test_atr_target_wins_close_race(self):
        data = signal(mode="FirstOfEither")
        await self.open_position(data)
        self.core.ib.cancel_fill = 10
        result = await self.engine.handle(close_signal(data, "RSI_PROFIT"))
        self.assertEqual(result["status"], "smio_demo_accepted", result)
        self.assertFalse(any(x.startswith("SMIOC_") for x in self.core.ib.mutations))
        await self.engine.reconcile()
        callback = next(iter(self.core.outbox.values()))
        self.assertEqual(callback["event"], "TP")
        self.assertEqual(callback["price"], 110)

    async def test_partial_target_then_remaining_market_close(self):
        data = signal(mode="FirstOfEither")
        await self.open_position(data)
        self.core.ib.cancel_fill = 3
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result["status"], "smio_demo_accepted", result)
        self.assertEqual(self.core.ib.history[-1].order.totalQuantity, 7)
        await self.engine.reconcile()
        callback = next(iter(self.core.outbox.values()))
        self.assertEqual(callback["qty"], 10)
        self.assertEqual(callback["price"], 106.5)
        self.assertEqual(len(callback["execution_components"]), 2)

    async def test_partial_terminal_entry_repairs_exact_target(self):
        data = signal()
        await self.open_position(data, 4)
        self.assertEqual(self.core.ib.history[1].order.totalQuantity, 4)

    async def test_outside_rth_retains_target_and_eod_does_not_fake_close(self):
        data = signal()
        await self.open_position(data)
        # Global legacy block is disabled; the SMIO demo still queues outside RTH.
        self.assertFalse(self.core.BLOCK_MARKET_CLOSES_OUTSIDE_RTH)
        self.core.rth = False
        self.assertEqual((await self.engine.handle(close_signal(data, "RTH_EOD")))["status"], "smio_demo_blocked")
        await self.engine.reconcile()  # recovery must not bypass the RTH gate
        self.assertEqual(self.core.ib.cancels, [])
        self.assertEqual(self.core.ib.position, 10)
        self.assertEqual(self.core.outbox, {})
        self.assertFalse(any(ref.startswith("SMIOC_") for ref in self.core.ib.mutations))
        self.core.rth = True
        await self.engine.reconcile()  # the queued close resumes only inside RTH
        self.assertTrue(any(ref.startswith("SMIOC_") for ref in self.core.ib.mutations))

    async def test_manual_same_side_close_reopen_is_not_our_position(self):
        data = signal()
        await self.open_position(data)
        foreign = Order("SELL", 10, account="DEMO")
        foreign.orderId, foreign.orderRef = 501, "MANUAL"
        t = self.core.ib.placeOrder(N(symbol="APA"), foreign)
        self.core.ib.fill(t, 10, 101)
        foreign = Order("BUY", 10, account="DEMO")
        foreign.orderId, foreign.orderRef = 502, "MANUAL_REOPEN"
        t = self.core.ib.placeOrder(N(symbol="APA"), foreign)
        self.core.ib.fill(t, 10, 102)
        before = list(self.core.ib.mutations)
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result["status"], "smio_demo_blocked")
        self.assertEqual(self.core.ib.mutations, before)
        self.assertEqual(self.core.ib.cancels, [])

    async def test_unproven_restart_history_never_cancels_or_closes(self):
        data = signal()
        await self.open_position(data)
        self.core.history_covered = False
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result["status"], "smio_demo_blocked")
        self.assertEqual(self.core.ib.cancels, [])

    async def test_partial_working_parent_cancel_then_exact_repair(self):
        data = signal()
        self.snapshot(data)
        await self.engine.handle(data)
        parent = self.core.ib.history[0]
        self.core.ib.fill(parent, 4, 100)
        parent.orderStatus.status = "Submitted"
        self.core.PARTIAL_FILL_GRACE_SECONDS = 0
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.cancels, [parent.order.orderRef])
        self.assertFalse(self.core.outbox)
        await self.engine.reconcile()
        await self.engine.reconcile()
        self.assertEqual(next(iter(self.core.outbox.values()))["qty"], 4)
        self.assertEqual(self.core.ib.history[1].order.totalQuantity, 4)

    async def test_cancelled_parent_child_replaced_without_duplicate_entry(self):
        data = signal()
        self.snapshot(data)
        await self.engine.handle(data)
        self.core.ib.fill(self.core.ib.history[0], 4, 100)
        self.core.ib.history[0].orderStatus.status = "Cancelled"
        self.core.ib.history[1].orderStatus.status = "Cancelled"
        await self.engine.reconcile()
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.history[-1].order.totalQuantity, 4)
        self.assertEqual(len([r for r in self.core.ib.mutations if r.startswith("SMIOE_")]), 1)
        self.assertEqual(next(iter(self.core.outbox.values()))["qty"], 4)

    async def test_no_fill_rejection_releases_without_callback(self):
        data = signal()
        self.snapshot(data)
        await self.engine.handle(data)
        self.core.ib.history[0].orderStatus.status = "Inactive"
        await self.engine.reconcile()
        self.assertEqual(self.engine.load()["setups"][data["setup_id"]]["state"], "CLOSED")
        self.assertFalse(self.core.outbox)

    async def test_foreign_execution_cancels_only_stale_owned_target(self):
        data = signal()
        await self.open_position(data)
        foreign = Order("SELL", 10, account="DEMO")
        foreign.orderId, foreign.orderRef = 501, "MANUAL"
        trade = self.core.ib.placeOrder(N(symbol="APA"), foreign)
        self.core.ib.fill(trade, 10, 101)
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.cancels, [self.core.ib.history[1].order.orderRef])
        self.assertEqual(self.engine.load()["setups"][data["setup_id"]]["state"], "OWNERSHIP_LOST")
        self.assertFalse(self.core.outbox)

    async def test_callback_key_in_header_only_missing_key_blocks(self):
        post = N()
        core = N(render_quote_update_url=lambda: "https://example.test/bridge/quotes?key=fixture-secret",
                 RENDER_WEBHOOK_URL="https://example.test/tv", requests=post)
        from unittest.mock import Mock
        post.post = Mock(return_value=N(status_code=200, text="OK"))
        data = {"source": "IB_BRIDGE"}
        self.assertTrue(send_callback(core, data)["forwarded"])
        self.assertEqual(post.post.call_args.kwargs["headers"], {"X-Vixale-Quote-Key": "fixture-secret"})
        self.assertNotIn("fixture-secret", json.dumps(data))
        core.render_quote_update_url = lambda: "https://example.test/bridge/quotes"
        self.assertFalse(send_callback(core, data)["forwarded"])
        self.assertEqual(post.post.call_count, 1)

    async def test_invalid_target_tick_rejected_before_market_parent(self):
        data = {**signal(), "target": 110.00000001, "target_price": 110.00000001}
        self.snapshot(data)
        result = await self.engine.handle(data)
        self.assertEqual(result["status"], "smio_demo_blocked")
        self.assertIn("broker tick", result["reason"])
        self.assertFalse(self.core.ib.mutations)


if __name__ == "__main__": unittest.main()
