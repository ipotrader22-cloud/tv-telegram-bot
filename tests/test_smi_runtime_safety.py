import asyncio
import os
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from bridge import smi_forward_adapter as smi
from bridge import smi_runtime_safety as safety


class FakeApp:
    def on_event(self, _name):
        def decorator(fn):
            return fn
        return decorator


class FakeIB:
    def __init__(self):
        self.trades = []

    def openTrades(self):
        return list(self.trades)


def fake_trade(symbol, order_ref="TVFVG_TEST"):
    return SimpleNamespace(
        contract=SimpleNamespace(symbol=symbol),
        order=SimpleNamespace(orderRef=order_ref),
    )


class FakeCore:
    def __init__(self):
        self.app = FakeApp()
        self.ib_lock = asyncio.Lock()
        self.ib = FakeIB()
        self.managed = {}
        self.positions = {}
        self.handled = []
        self.background = []

    def load_managed_positions(self):
        return self.managed

    def managed_payload(self, row):
        payload = dict(row.get("last_payload") or {})
        for key in ("system_id", "strategy", "variant", "profile", "setup_id"):
            if row.get(key) not in (None, ""):
                payload[key] = row.get(key)
        return payload

    def classify_strategy_payload(self, data):
        system_id = str(data.get("system_id") or "").upper().strip()
        strategy = str(data.get("strategy") or "").upper().strip()
        if system_id == "VIXALE_EDGE":
            return "VIXALE_EDGE"
        if system_id == "VIXALE_PRIME" or "SHREK_1_4" in strategy:
            return "VIXALE_PRIME_OPPOSITE_FLIP"
        return "OTHER"

    async def ensure_ib_connected(self):
        return True

    async def get_position_size(self, symbol):
        return self.positions.get(symbol, 0.0)

    async def handle_ib_action(self, data):
        self.handled.append(dict(data))
        return {"status": "delegated", "source": data.get("source")}

    async def process_signal_background(self, data):
        self.background.append(dict(data))
        return await self.handle_ib_action(data)


def smi_payload(symbol="AAPL", **overrides):
    payload = {
        "source": "TradingView",
        "system_id": smi.SMI_SYSTEM_ID,
        "strategy": smi.SMI_STRATEGY_ID,
        "strategy_id": smi.SMI_STRATEGY_ID,
        "research_version": smi.SMI_RESEARCH_VERSION,
        "sec_type": "STK",
        "position_size_pct": 3,
        "qty_source": smi.SMI_QTY_SOURCE,
        "qty": 30,
        "signal": "BUY",
        "event": "SETUP",
        "symbol": symbol,
        "timeframe": "60",
        "side": "LONG",
        "signal_bar_time": 1788379200000,
        "setup_id": f"{smi.SMI_STRATEGY_ID}:{symbol}:60:LONG:1788379200000",
        "entry": 100,
        "target": 102,
        "entry_order_type": "MARKET",
        "target_tif": "GTC",
        "eod_close_enabled": True,
    }
    payload.update(overrides)
    return payload


def prime_payload(symbol="AAPL", **overrides):
    payload = {
        "source": "TradingView",
        "system_id": "VIXALE_PRIME",
        "strategy": "SHREK_1_4",
        "event": "SETUP",
        "symbol": symbol,
        "side": "LONG",
        "setup_id": f"PRIME:{symbol}:LONG",
    }
    payload.update(overrides)
    return payload


def edge_payload(symbol="AAPL", **overrides):
    payload = {
        "source": "TradingView",
        "system_id": "VIXALE_EDGE",
        "strategy": "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_V1",
        "event": "SETUP",
        "symbol": symbol,
        "side": "LONG",
        "setup_id": f"EDGE:{symbol}:LONG",
    }
    payload.update(overrides)
    return payload


def managed_row(symbol="AAPL", created_at="2026-09-08T12:00:00-04:00", **overrides):
    row = {
        "system_id": smi.SMI_SYSTEM_ID,
        "strategy": smi.SMI_STRATEGY_ID,
        "strategy_id": smi.SMI_STRATEGY_ID,
        "symbol": symbol,
        "side": "LONG",
        "qty": 30,
        "setup_id": f"{smi.SMI_STRATEGY_ID}:{symbol}:60:LONG:1788379200000",
        "created_at": created_at,
        "last_payload": smi_payload(symbol),
    }
    row.update(overrides)
    return row


def managed_prime_row(symbol="AAPL"):
    payload = prime_payload(symbol)
    return {
        "system_id": "VIXALE_PRIME",
        "strategy": "SHREK_1_4",
        "symbol": symbol,
        "side": "LONG",
        "qty": 100,
        "setup_id": payload["setup_id"],
        "last_payload": payload,
    }


def managed_edge_row(symbol="AAPL"):
    payload = edge_payload(symbol)
    return {
        "system_id": "VIXALE_EDGE",
        "strategy": payload["strategy"],
        "symbol": symbol,
        "side": "LONG",
        "qty": 100,
        "setup_id": payload["setup_id"],
        "last_payload": payload,
    }


class ConcurrentFirstOwnerCore(FakeCore):
    def __init__(self):
        super().__init__()
        self.entry_started = asyncio.Event()
        self.entry_release = asyncio.Event()

    async def handle_ib_action(self, data):
        self.handled.append(dict(data))
        if str(data.get("event") or "").upper() == "SETUP":
            self.entry_started.set()
            await self.entry_release.wait()
            self.ib.trades = [fake_trade(data["symbol"], "TVFVG_AAPL_LONG")]
            return {"status": "submitted_awaiting_entry_fill", "source": data.get("source")}
        return {"status": "delegated", "source": data.get("source")}


async def run_tests():
    # The old SMI allowlist environment variables are intentionally ignored.
    # Every symbol is eligible; ownership, not symbol membership, is the gate.
    core = FakeCore()
    safety.install_smi_runtime_safety(core)
    with patch.dict(
        os.environ,
        {
            "SMI_ALLOWED_SYMBOLS": "AAPL",
            "SMI_REQUIRE_EXPLICIT_SYMBOL_ALLOWLIST": "true",
        },
        clear=False,
    ):
        result = await core.handle_ib_action(smi_payload("KO"))
    assert result["status"] == "delegated"
    assert core.handled[-1]["symbol"] == "KO"

    # A free symbol remains available to Prime and Edge too.
    core = FakeCore()
    safety.install_smi_runtime_safety(core)
    result = await core.handle_ib_action(prime_payload("MSFT"))
    assert result["status"] == "delegated"
    assert core.handled[-1]["system_id"] == "VIXALE_PRIME"

    # Durable managed ownership blocks a different system from entering.
    core = FakeCore()
    core.managed["AAPL"] = managed_edge_row()
    safety.install_smi_runtime_safety(core)
    result = await core.handle_ib_action(prime_payload("AAPL"))
    assert result["status"] == "entry_blocked_symbol_owned_by_other_system"
    assert result["owner_family"] == "VIXALE_EDGE"
    assert core.handled == []

    # Same-owner Prime SETUP is delegated so existing Prime reversal behavior is
    # preserved; the ownership guard does not reinterpret strategy behavior.
    core = FakeCore()
    core.managed["AAPL"] = managed_prime_row()
    core.positions["AAPL"] = 100.0
    core.ib.trades = [fake_trade("AAPL", "TVFVG_AAPL_LONG_TP")]
    safety.install_smi_runtime_safety(core)
    result = await core.handle_ib_action(prime_payload("AAPL", side="SHORT"))
    assert result["status"] == "delegated"
    assert len(core.handled) == 1

    # A foreign exit/cancel mutation is blocked, not only a foreign entry.
    core = FakeCore()
    core.managed["AAPL"] = managed_row()
    safety.install_smi_runtime_safety(core)
    result = await core.handle_ib_action(prime_payload("AAPL", event="CLOSE_STOP"))
    assert result["status"] == "symbol_mutation_blocked_by_owner"
    assert result["owner_family"] == smi.SMI_SYSTEM_ID
    assert core.handled == []

    # No managed owner + live broker position is ambiguous, so fail closed.
    core = FakeCore()
    core.positions["AAPL"] = 25.0
    safety.install_smi_runtime_safety(core)
    result = await core.handle_ib_action(edge_payload("AAPL"))
    assert result["status"] == "entry_blocked_unmanaged_broker_position"
    assert core.handled == []

    # No managed owner + working order is also ambiguous and must not be swept
    # by another system's entry logic.
    core = FakeCore()
    core.ib.trades = [fake_trade("AAPL", "TVFVG_AAPL_LONG")]
    safety.install_smi_runtime_safety(core)
    result = await core.handle_ib_action(smi_payload("AAPL"))
    assert result["status"] == "entry_blocked_unmanaged_working_orders"
    assert core.handled == []

    # Simultaneous alerts are serialized. The first accepted Prime order creates
    # broker ownership evidence before Edge gets its ownership decision.
    core = ConcurrentFirstOwnerCore()
    safety.install_smi_runtime_safety(core)
    first_task = asyncio.create_task(core.handle_ib_action(prime_payload("AAPL")))
    await core.entry_started.wait()
    second_task = asyncio.create_task(core.handle_ib_action(edge_payload("AAPL")))
    await asyncio.sleep(0)
    assert not second_task.done(), "second system must wait for the first ownership decision"
    core.entry_release.set()
    first = await first_task
    second = await second_task
    assert first["status"] == "submitted_awaiting_entry_fill"
    assert second["status"] == "entry_blocked_unmanaged_working_orders"
    assert len(core.handled) == 1, "only the first system may reach broker submission"

    # SMI broker EOD watchdog still reuses the validated SMI path while keeping
    # its original IB_BRIDGE source outside the delegated transport copy.
    core = FakeCore()
    safety.install_smi_runtime_safety(core)
    watchdog = smi_payload(
        source="IB_BRIDGE",
        event="EOD_CLOSE",
        signal="EOD_FLAT",
        broker_smi_eod_watchdog=True,
    )
    result = await core.handle_ib_action(watchdog)
    assert result["status"] == "delegated"
    assert core.handled[-1]["source"] == "TradingView", "internal watchdog copy must reuse existing validated SMI path"
    assert watchdog["source"] == "IB_BRIDGE", "watchdog payload origin must remain truthful for publication"

    core = FakeCore()
    core.managed["AAPL"] = managed_row()
    core.positions["AAPL"] = 30.0
    now = datetime(2026, 9, 8, 15, 59, 55, tzinfo=ZoneInfo("America/New_York"))
    result = await safety.run_smi_eod_fail_safe_once(core, now)
    assert result["checked"] == 1
    assert result["details"][0]["status"] == "failsafe_dispatched"
    assert core.background[-1]["event"] == "EOD_CLOSE"
    assert core.background[-1]["signal"] == "EOD_FLAT"
    assert core.background[-1]["source"] == "IB_BRIDGE"
    assert core.background[-1]["setup_id"] == core.managed["AAPL"]["setup_id"]

    core = FakeCore()
    core.managed["AAPL"] = managed_row()
    core.positions["AAPL"] = 29.0
    result = await safety.run_smi_eod_fail_safe_once(core, now)
    assert result["details"][0]["status"] == "blocked_position_qty_mismatch"
    assert core.background == [], "failsafe must fail closed on broker/managed quantity mismatch"

    core = FakeCore()
    core.managed["AAPL"] = managed_row(created_at="2026-09-04T12:00:00-04:00")
    core.positions["AAPL"] = 30.0
    result = await safety.run_smi_eod_fail_safe_once(core, now)
    assert result["details"][0]["status"] == "skipped_not_opened_today"
    assert core.background == [], "stale prior-day rows are never auto-flattened by the same-day safety loop"

    print("SMI runtime safety and cross-system ownership tests passed")


if __name__ == "__main__":
    asyncio.run(run_tests())
