import asyncio
from types import SimpleNamespace

from bridge import smi_forward_adapter as smi


class FakeIB:
    def __init__(self):
        self.trades = []

    def openTrades(self):
        return list(self.trades)


class FakeCore:
    BLOCK_MARKET_CLOSES_OUTSIDE_RTH = False

    def __init__(self):
        self.ib_lock = asyncio.Lock()
        self.managed = {}
        self.positions = {}
        self.ib = FakeIB()
        self.original_calls = []
        self.exact_target = None
        self.target_resolution = {
            "ok": True,
            "status": "target_cancelled",
            "target_filled_qty": 0,
            "canceled_targets": 1,
        }

    def load_managed_positions(self):
        return self.managed

    async def get_position_size(self, symbol):
        return self.positions.get(symbol, 0)

    async def ensure_ib_connected(self):
        return True

    async def place_entry_order(self, data):
        self.original_calls.append(dict(data))
        return {
            "status": "delegated",
            "symbol": data.get("symbol"),
            "event": data.get("event"),
            "close_filled": False,
        }

    async def close_position_market(self, data):
        self.original_calls.append(dict(data))
        return {
            "status": "delegated",
            "symbol": data.get("symbol"),
            "event": data.get("event"),
            "close_filled": data.get("event") in {"CLOSE_STOP", "EOD_CLOSE"},
        }

    async def handle_ib_action(self, data):
        self.original_calls.append(dict(data))
        return {
            "status": "delegated",
            "symbol": data.get("symbol"),
            "event": data.get("event"),
            "close_filled": data.get("event") in {"CLOSE_STOP", "EOD_CLOSE"},
        }

    def find_exact_managed_target_trade(self, _row):
        return self.exact_target

    async def cancel_and_verify_edge_target(self, _row):
        return dict(self.target_resolution)

    async def wait_for_edge_partial_position_sync(self, _symbol, _side, remaining):
        return {"confirmed": True, "confirmed_remaining_qty": remaining}

    def mark_managed_bridge_close(self, _data, _result):
        return True


def smi_entry(**overrides):
    payload = {
        "source": "TradingView",
        "system_id": "VIXALE_SMI_FWD",
        "strategy": "SMI_HISTOGRAM_V0_4_FWD",
        "strategy_id": "SMI_HISTOGRAM_V0_4_FWD",
        "research_version": "0.4-FWD",
        "sec_type": "STK",
        "position_size_pct": 3,
        "qty_source": "TV Strategy Properties",
        "qty": 30,
        "signal": "BUY",
        "event": "SETUP",
        "symbol": "AAPL",
        "timeframe": "60",
        "side": "LONG",
        "signal_bar_time": 1788379200000,
        "setup_id": "SMI_HISTOGRAM_V0_4_FWD:AAPL:60:LONG:1788379200000",
        "entry": 100,
        "target": 102,
        "entry_order_type": "MARKET",
        "target_tif": "GTC",
    }
    payload.update(overrides)
    return payload


def managed_smi_row(**overrides):
    row = {
        "system_id": "VIXALE_SMI_FWD",
        "strategy_id": "SMI_HISTOGRAM_V0_4_FWD",
        "strategy": "SMI_HISTOGRAM_V0_4_FWD",
        "setup_id": "SMI_HISTOGRAM_V0_4_FWD:AAPL:60:LONG:1788379200000",
        "symbol": "AAPL",
        "side": "LONG",
        "qty": 30,
        "last_payload": smi_entry(),
    }
    row.update(overrides)
    return row


def exact_target_trade(symbol="AAPL", order_id=501, perm_id=601, order_ref="SMI_TARGET"):
    return SimpleNamespace(
        contract=SimpleNamespace(symbol=symbol),
        order=SimpleNamespace(orderId=order_id, permId=perm_id, orderRef=order_ref),
    )


async def run_tests():
    assert smi.is_smi_forward_payload(smi_entry())
    assert not smi.is_smi_forward_payload({"system_id": "VIXALE_EDGE"})
    assert smi.validate_smi_transport_contract(smi_entry()) is None
    assert smi.validate_smi_transport_contract(smi_entry(position_size_pct=4))["status"] == "smi_contract_position_size_pct_mismatch"
    assert smi.validate_smi_transport_contract(smi_entry(qty_source="Render BRIDGE_DEFAULT_QTY"))["status"] == "smi_contract_qty_source_mismatch"
    assert smi.validate_smi_transport_contract(smi_entry(qty=0))["status"] == "smi_contract_invalid_qty"
    assert smi.validate_smi_transport_contract(smi_entry(qty=30.5))["status"] == "smi_contract_invalid_qty"
    assert smi.validate_smi_transport_contract(smi_entry(qty="30.5"))["status"] == "smi_contract_invalid_qty"

    core = FakeCore()
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action({
        "system_id": "VIXALE_PRIME",
        "strategy": "SHREK_1_4",
        "event": "SETUP",
        "symbol": "MSFT",
        "side": "LONG",
    })
    assert result["status"] == "delegated"
    assert len(core.original_calls) == 1, "ordinary Prime path must delegate unchanged"

    core = FakeCore()
    core.managed["AAPL"] = managed_smi_row()
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action({
        "system_id": "VIXALE_EDGE",
        "strategy": "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1",
        "event": "CLOSE_STOP",
        "symbol": "AAPL",
        "side": "LONG",
    })
    assert result["status"] == "smi_managed_symbol_reserved"
    assert core.original_calls == [], "foreign strategy must not mutate an SMI-owned symbol"

    core = FakeCore()
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action(smi_entry())
    assert result["status"] == "delegated"
    assert len(core.original_calls) == 1, "validated flat SMI entry delegates to existing core"

    core = FakeCore()
    core.positions["AAPL"] = 10
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action(smi_entry())
    assert result["status"] == "smi_entry_blocked_existing_broker_position"
    assert core.original_calls == []

    exit_payload = smi_entry(signal="EXIT_LONG", event="CLOSE_STOP")
    core = FakeCore()
    core.managed["AAPL"] = managed_smi_row(system_id="VIXALE_EDGE", strategy_id="EDGE", strategy="EDGE")
    core.positions["AAPL"] = 30
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action(exit_payload)
    assert result["status"] == "smi_exit_blocked_foreign_managed_position"
    assert core.original_calls == []

    core = FakeCore()
    core.managed["AAPL"] = managed_smi_row()
    core.positions["AAPL"] = 30
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action(exit_payload)
    assert result["status"] == "smi_exit_exact_target_unconfirmed"
    assert core.original_calls == [], "no close is allowed without exact managed target proof"

    core = FakeCore()
    core.managed["AAPL"] = managed_smi_row()
    core.positions["AAPL"] = 30
    core.exact_target = exact_target_trade()
    core.ib.trades = [core.exact_target]
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action(exit_payload)
    assert result["status"] == "delegated"
    assert len(core.original_calls) == 1, "proven SMI exit delegates after exact target resolution"

    core = FakeCore()
    core.managed["AAPL"] = managed_smi_row()
    core.positions["AAPL"] = 30
    core.exact_target = exact_target_trade()
    core.ib.trades = [
        core.exact_target,
        exact_target_trade(order_id=777, perm_id=888, order_ref="FOREIGN_ORDER"),
    ]
    smi.install_smi_forward_adapter(core)
    result = await core.handle_ib_action(exit_payload)
    assert result["status"] == "smi_exit_blocked_foreign_working_orders"
    assert core.original_calls == [], "SMI must not invoke broad close/cancel with foreign working orders present"

    print("SMI bridge isolation tests passed")


if __name__ == "__main__":
    asyncio.run(run_tests())
