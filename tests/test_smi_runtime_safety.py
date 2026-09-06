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


class FakeCore:
    def __init__(self):
        self.app = FakeApp()
        self.managed = {}
        self.positions = {}
        self.handled = []
        self.background = []

    def load_managed_positions(self):
        return self.managed

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


async def run_tests():
    with patch.dict(os.environ, {"SMI_ALLOWED_SYMBOLS": "AAPL,MSFT"}, clear=False):
        allowed = safety.smi_symbol_policy_guard(smi_payload("AAPL"))
        blocked = safety.smi_symbol_policy_guard(smi_payload("KO"))
        prime = safety.smi_symbol_policy_guard({
            "system_id": "VIXALE_PRIME",
            "strategy": "SHREK_1_4",
            "event": "SETUP",
            "symbol": "KO",
        })
    assert allowed is None
    assert blocked["status"] == "smi_entry_blocked_symbol_not_allowlisted"
    assert prime is None, "Prime must never be changed by SMI allowlist policy"

    core = FakeCore()
    safety.install_smi_runtime_safety(core)
    result = await core.handle_ib_action({
        "system_id": "VIXALE_PRIME",
        "strategy": "SHREK_1_4",
        "event": "SETUP",
        "symbol": "MSFT",
        "side": "LONG",
    })
    assert result["status"] == "delegated"
    assert core.handled[-1]["system_id"] == "VIXALE_PRIME"

    core = FakeCore()
    safety.install_smi_runtime_safety(core)
    watchdog = smi_payload(
        source="IB_BRIDGE",
        event="EOD_CLOSE",
        signal="EOD_FLAT",
        broker_smi_eod_watchdog=True,
    )
    with patch.dict(os.environ, {"SMI_ALLOWED_SYMBOLS": "AAPL"}, clear=False):
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

    print("SMI runtime safety tests passed")


if __name__ == "__main__":
    asyncio.run(run_tests())
