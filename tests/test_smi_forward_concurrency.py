import asyncio

from bridge import smi_forward_adapter as smi


class FakeIB:
    def __init__(self):
        self.trades = []

    def openTrades(self):
        return list(self.trades)


class RaceCore:
    BLOCK_MARKET_CLOSES_OUTSIDE_RTH = False
    SETUP_ACCEPTED_STATUSES = {
        "submitted_with_attached_target",
        "submitted_awaiting_entry_fill",
    }

    def __init__(self, gate_entry=False):
        self.ib_lock = asyncio.Lock()
        self.managed = {}
        self.positions = {}
        self.ib = FakeIB()
        self.original_calls = []
        self.entry_calls = 0
        self.entry_started = asyncio.Event()
        self.entry_release = asyncio.Event()
        if not gate_entry:
            self.entry_release.set()

    def load_managed_positions(self):
        return self.managed

    async def ensure_ib_connected(self):
        return True

    async def get_position_size(self, symbol):
        return self.positions.get(symbol, 0)

    def mark_managed_position(self, data, result):
        symbol = data["symbol"]
        self.managed[symbol] = {
            "system_id": data["system_id"],
            "strategy_id": data["strategy_id"],
            "strategy": data["strategy"],
            "setup_id": data["setup_id"],
            "symbol": symbol,
            "side": data["side"],
            "qty": data["qty"],
            "last_payload": dict(data),
        }

    async def place_entry_order(self, data):
        self.entry_calls += 1
        self.entry_started.set()
        await self.entry_release.wait()
        symbol = data["symbol"]
        qty = int(data["qty"])
        self.positions[symbol] = qty if data["side"] == "LONG" else -qty
        return {
            "status": "submitted_with_attached_target",
            "entry_filled": True,
            "dry_run": False,
        }

    async def close_position_market(self, data):
        self.positions[data["symbol"]] = 0
        return {"status": "submitted", "close_filled": True, "close_status": "Filled"}

    async def handle_ib_action(self, data):
        async with self.ib_lock:
            self.original_calls.append(dict(data))
            return {"status": "delegated", "event": data.get("event")}


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


async def test_duplicate_smi_is_serialized():
    core = RaceCore()
    smi.install_smi_forward_adapter(core)
    first, second = await asyncio.gather(
        core.handle_ib_action(smi_entry()),
        core.handle_ib_action(smi_entry()),
    )
    assert core.entry_calls == 1
    statuses = {first["status"], second["status"]}
    assert "submitted_with_attached_target" in statuses
    assert any(status.startswith("smi_entry_blocked_") for status in statuses)


class AwaitingFillRaceCore(RaceCore):
    async def place_entry_order(self, data):
        self.entry_calls += 1
        self.entry_started.set()
        await self.entry_release.wait()
        return {
            "status": "submitted_awaiting_entry_fill",
            "entry_filled": False,
            "dry_run": False,
            "order_id": 901,
            "order_perm_id": 1901,
            "order_ref": "TVFVG_AAPL_LONG",
            "target_order_id": 902,
        }


async def test_submitted_awaiting_fill_reservation_blocks_duplicate():
    core = AwaitingFillRaceCore()
    smi.install_smi_forward_adapter(core)
    first, second = await asyncio.gather(
        core.handle_ib_action(smi_entry()),
        core.handle_ib_action(smi_entry()),
    )
    assert core.entry_calls == 1, "accepted unfilled SMI entry must reserve the symbol before a duplicate can submit"
    statuses = {first["status"], second["status"]}
    assert "submitted_awaiting_entry_fill" in statuses
    assert "smi_entry_blocked_pending_broker_ownership" in statuses


async def test_foreign_payload_cannot_pass_mid_smi_entry():
    core = RaceCore(gate_entry=True)
    smi.install_smi_forward_adapter(core)
    smi_task = asyncio.create_task(core.handle_ib_action(smi_entry()))
    await core.entry_started.wait()
    foreign_task = asyncio.create_task(core.handle_ib_action({
        "system_id": "VIXALE_PRIME",
        "strategy": "SHREK_1_4",
        "event": "SETUP",
        "symbol": "AAPL",
        "side": "LONG",
    }))
    await asyncio.sleep(0)
    assert core.original_calls == []
    core.entry_release.set()
    assert (await smi_task)["status"] == "submitted_with_attached_target"
    assert (await foreign_task)["status"] == "smi_managed_symbol_reserved"
    assert core.original_calls == []


async def test_guard_observes_state_changed_under_core_lock():
    core = RaceCore()
    smi.install_smi_forward_adapter(core)
    scheduler_has_lock = asyncio.Event()
    scheduler_release = asyncio.Event()

    async def scheduler_mutation():
        async with core.ib_lock:
            scheduler_has_lock.set()
            core.positions["AAPL"] = 7
            await scheduler_release.wait()

    scheduler_task = asyncio.create_task(scheduler_mutation())
    await scheduler_has_lock.wait()
    smi_task = asyncio.create_task(core.handle_ib_action(smi_entry()))
    await asyncio.sleep(0)
    assert core.entry_calls == 0
    scheduler_release.set()
    result = await smi_task
    await scheduler_task
    assert result["status"] == "smi_entry_blocked_existing_broker_position"
    assert core.entry_calls == 0


async def run_tests():
    await test_duplicate_smi_is_serialized()
    await test_submitted_awaiting_fill_reservation_blocks_duplicate()
    await test_foreign_payload_cannot_pass_mid_smi_entry()
    await test_guard_observes_state_changed_under_core_lock()
    print("SMI concurrency/atomic-routing tests passed")


if __name__ == "__main__":
    asyncio.run(run_tests())
