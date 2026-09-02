from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# P1/P2 bridge: strict integer quantities and atomic SMI routing.
replace_once(
    "bridge/smi_forward_adapter.py",
    "import math\nfrom typing import Any, Dict, Optional, Tuple\n",
    "import asyncio\nimport math\nfrom typing import Any, Dict, Optional, Tuple\n",
)
replace_once(
    "bridge/smi_forward_adapter.py",
    '''def _int(value: Any) -> int:
    try:
        result = int(float(str(value).replace(",", "").strip()))
        return result if result > 0 else 0
    except Exception:
        return 0
''',
    '''def _int(value: Any) -> int:
    try:
        numeric = float(str(value).replace(",", "").strip())
        if not math.isfinite(numeric) or numeric <= 0 or not numeric.is_integer():
            return 0
        return int(numeric)
    except Exception:
        return 0
''',
)

adapter = Path("bridge/smi_forward_adapter.py")
text = adapter.read_text(encoding="utf-8")
marker = "def install_smi_forward_adapter(core: Any) -> Any:\n"
index = text.find(marker)
if index < 0 or text.find(marker, index + 1) >= 0:
    raise SystemExit("bridge/smi_forward_adapter.py: install marker missing/ambiguous")
new_tail = '''def install_smi_forward_adapter(core: Any) -> Any:
    """Patch exactly one core routing function and preserve ordinary paths.

    SMI ownership checks and SMI broker mutations are serialized under the same
    ``core.ib_lock`` used by the pre-existing bridge. A routing lock also keeps
    foreign handle calls from passing an SMI ownership check mid-transition.
    """
    if getattr(core, "_smi_forward_adapter_installed", False):
        return core

    original_handle = core.handle_ib_action
    routing_lock = asyncio.Lock()
    pending_smi_symbols = set()

    async def pending_smi_ownership_block(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        symbol = _upper(data, "symbol")
        event = _upper(data, "event")
        if symbol not in pending_smi_symbols or event not in SMI_OWNERSHIP_PROTECTED_EVENTS:
            return None

        row = _managed_smi_row(core, symbol)
        if _managed_row_is_smi(row):
            return _blocked(
                data,
                "smi_managed_symbol_reserved",
                "Broker-mutating foreign payload blocked because this symbol is owned by an active SMI setup.",
                managed_setup_id=str(row.get("setup_id") or ""),
                incoming_system_id=_upper(data, "system_id"),
                incoming_strategy=_upper(data, "strategy"),
            )

        position = await core.get_position_size(symbol)
        working = []
        for trade in list(core.ib.openTrades() or []):
            contract_symbol = str(
                getattr(getattr(trade, "contract", None), "symbol", "") or ""
            ).upper().strip()
            if contract_symbol == symbol:
                working.append(trade)

        if abs(float(position or 0.0)) <= 0.000001 and not working:
            pending_smi_symbols.discard(symbol)
            return None

        return _blocked(
            data,
            "smi_managed_symbol_reserved",
            "Broker-mutating foreign payload blocked while an accepted SMI entry still has broker ownership evidence.",
            managed_setup_id="",
            incoming_system_id=_upper(data, "system_id"),
            incoming_strategy=_upper(data, "strategy"),
        )

    async def handle_ib_action_with_smi(data: Dict[str, Any]) -> Dict[str, Any]:
        async with routing_lock:
            if not is_smi_forward_payload(data):
                # Synchronize the ownership read with every existing core IB path.
                # original_handle acquires this same lock itself, so release it
                # before delegation; routing_lock prevents SMI from slipping into
                # that small handoff window.
                async with core.ib_lock:
                    ownership_block = _foreign_payload_guard(core, data)
                    if ownership_block is None:
                        ownership_block = await pending_smi_ownership_block(data)
                if ownership_block is not None:
                    return ownership_block
                return await original_handle(data)

            contract_error = validate_smi_transport_contract(data)
            if contract_error is not None:
                return contract_error

            signal = _upper(data, "signal")
            symbol = _upper(data, "symbol")

            # original_handle cannot be called here because it would re-acquire
            # the non-reentrant asyncio.Lock. Reuse the unchanged core primitives
            # under the one shared lock instead.
            async with core.ib_lock:
                if signal in ("BUY", "SELL"):
                    guard = await _smi_entry_guard(core, data)
                    if guard is not None:
                        return guard

                    result = await core.place_entry_order(data)
                    status = str(result.get("status") or "").lower()
                    accepted_statuses = {
                        str(value).lower()
                        for value in getattr(core, "SETUP_ACCEPTED_STATUSES", set())
                    }
                    accepted = status in accepted_statuses
                    if accepted and not bool(result.get("dry_run")):
                        pending_smi_symbols.add(symbol)
                    if accepted and bool(result.get("entry_filled")):
                        mark = getattr(core, "mark_managed_position", None)
                        if callable(mark):
                            mark(data, result)
                    return result

                guard, row = _smi_exit_ownership_guard(core, data)
                if guard is not None:
                    return guard
                prepared = await _prepare_smi_exit(core, data, row)
                if prepared is not None:
                    return prepared

                result = await core.close_position_market(data)

                partial_qty = float(data.pop("_smi_partial_target_filled_qty", 0.0) or 0.0)
                partial_price = data.pop("_smi_partial_target_fill_price", 0)
                partial_exec_ids = data.pop("_smi_partial_target_exec_ids", [])
                if partial_qty > 0 and bool(result.get("close_filled")):
                    persist = getattr(core, "mark_managed_bridge_close", None)
                    persisted = bool(persist(data, result)) if callable(persist) else False
                    return {
                        **result,
                        "status": "smi_mixed_exit_manual_reconcile",
                        "smi_partial_target_filled_qty": partial_qty,
                        "smi_partial_target_fill_price": partial_price,
                        "smi_partial_target_exec_ids": partial_exec_ids,
                        "managed_state_persisted": persisted,
                        "message": "SMI broker position flattened after partial target; automatic public close withheld for evidence-safe reconciliation.",
                    }

                return result

    core._smi_forward_original_handle_ib_action = original_handle
    core.handle_ib_action = handle_ib_action_with_smi
    core._smi_forward_adapter_installed = True
    return core
'''
adapter.write_text(text[:index] + new_tail, encoding="utf-8")


# P1 Pine compile/sizing: declarations precede use; never synthesize one share.
replace_once(
    "pine/SMI_Histogram_v0_4_FWD_UAM.pine",
    'var string activeUamSetupId = ""\n\n',
    '''var string activeUamSetupId = ""

// ============================================================================
// TARGET STORAGE
// ============================================================================

var float longTargetPrice = na
var float shortTargetPrice = na

''',
)
replace_once(
    "pine/SMI_Histogram_v0_4_FWD_UAM.pine",
    '''f_qty_from_value(_value) =>
    int(math.max(1, math.floor(math.abs(_value))))

f_entry_qty(_price) =>
    f_qty_from_value(strategy.default_entry_qty(_price))

f_close_qty() =>
    f_qty_from_value(strategy.position_size)
''',
    '''f_entry_qty(_price) =>
    float rawQty = strategy.default_entry_qty(_price)
    na(rawQty) ? 0 : int(math.max(0, math.floor(math.abs(rawQty))))

f_close_qty() =>
    int(math.max(1, math.floor(math.abs(strategy.position_size))))
''',
)
replace_once(
    "pine/SMI_Histogram_v0_4_FWD_UAM.pine",
    '''// ============================================================================
// TARGET STORAGE
// ============================================================================

var float longTargetPrice = na
var float shortTargetPrice = na

// ============================================================================
// LONG ENTRY
// ============================================================================
''',
    '''// ============================================================================
// LONG ENTRY
// ============================================================================
''',
)
replace_once(
    "pine/SMI_Histogram_v0_4_FWD_UAM.pine",
    '''    f_send_uam(
         "BUY",
         "SETUP",
         "LONG",
         activeUamSetupId,
         close,
         longTargetPrice,
         f_entry_qty(close),
         "VALID_LONG_RESEARCH_SIGNAL"
    )

    strategy.entry(
''',
    '''    int longEntryQty = f_entry_qty(close)
    if longEntryQty > 0
        f_send_uam(
             "BUY",
             "SETUP",
             "LONG",
             activeUamSetupId,
             close,
             longTargetPrice,
             longEntryQty,
             "VALID_LONG_RESEARCH_SIGNAL"
        )

    strategy.entry(
''',
)
replace_once(
    "pine/SMI_Histogram_v0_4_FWD_UAM.pine",
    '''    f_send_uam(
         "SELL",
         "SETUP",
         "SHORT",
         activeUamSetupId,
         close,
         shortTargetPrice,
         f_entry_qty(close),
         "VALID_SHORT_RESEARCH_SIGNAL"
    )

    strategy.entry(
''',
    '''    int shortEntryQty = f_entry_qty(close)
    if shortEntryQty > 0
        f_send_uam(
             "SELL",
             "SETUP",
             "SHORT",
             activeUamSetupId,
             close,
             shortTargetPrice,
             shortEntryQty,
             "VALID_SHORT_RESEARCH_SIGNAL"
        )

    strategy.entry(
''',
)


# Existing isolation fixture exposes the exact unchanged core primitives now used.
replace_once(
    "tests/test_smi_forward_bridge_isolation.py",
    '''    def __init__(self):
        self.managed = {}
''',
    '''    def __init__(self):
        self.ib_lock = asyncio.Lock()
        self.managed = {}
''',
)
replace_once(
    "tests/test_smi_forward_bridge_isolation.py",
    '''    async def ensure_ib_connected(self):
        return True

    async def handle_ib_action(self, data):
''',
    '''    async def ensure_ib_connected(self):
        return True

    async def place_entry_order(self, data):
        return await self.handle_ib_action(data)

    async def close_position_market(self, data):
        return await self.handle_ib_action(data)

    async def handle_ib_action(self, data):
''',
)
replace_once(
    "tests/test_smi_forward_bridge_isolation.py",
    '''    assert smi.validate_smi_transport_contract(smi_entry(qty=0))["status"] == "smi_contract_invalid_qty"
''',
    '''    assert smi.validate_smi_transport_contract(smi_entry(qty=0))["status"] == "smi_contract_invalid_qty"
    assert smi.validate_smi_transport_contract(smi_entry(qty=30.5))["status"] == "smi_contract_invalid_qty"
    assert smi.validate_smi_transport_contract(smi_entry(qty="30.5"))["status"] == "smi_contract_invalid_qty"
''',
)


# Pine static regression guards for declaration order and sub-one-share transport.
replace_once(
    "tests/test_smi_forward_pine_contract.py",
    '''    assert 'f_entry_qty(_price) =>' in text
    assert 'strategy.default_entry_qty(_price)' in text
    assert 'math.floor(math.abs(_value))' in text
''',
    '''    assert 'f_entry_qty(_price) =>' in text
    assert 'strategy.default_entry_qty(_price)' in text
    assert 'math.max(1, math.floor(math.abs(_value)))' not in text
    assert 'na(rawQty) ? 0 : int(math.max(0, math.floor(math.abs(rawQty))))' in text
    assert 'if longEntryQty > 0' in text
    assert 'if shortEntryQty > 0' in text

    target_decl = text.index('var float longTargetPrice = na')
    eod_use = text.index('float eodTarget = strategy.position_size > 0 ? longTargetPrice : shortTargetPrice')
    assert target_decl < eod_use, 'target storage must be declared before EOD serialization uses it'
''',
)


# Runtime concurrency regression for the reviewed TOCTOU race.
concurrency_test = r'''import asyncio

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
    await test_foreign_payload_cannot_pass_mid_smi_entry()
    await test_guard_observes_state_changed_under_core_lock()
    print("SMI concurrency/atomic-routing tests passed")


if __name__ == "__main__":
    asyncio.run(run_tests())
'''
Path("tests/test_smi_forward_concurrency.py").write_text(concurrency_test, encoding="utf-8")


# Handbook: explicit fail-closed behavior for a sub-one-share default quantity.
replace_once(
    "docs/VECO_DEVELOPER_HANDBOOK.md",
    '''bridge must never recalculate the percentage, substitute `BRIDGE_DEFAULT_QTY`, or
execute a missing/invalid SMI quantity.
''',
    '''bridge must never recalculate the percentage, substitute `BRIDGE_DEFAULT_QTY`, or
execute a missing/invalid SMI quantity. If `strategy.default_entry_qty()` does not
produce at least one whole share, Pine emits no UAM entry alert; Engineering must
never synthesize a one-share fallback.
''',
)
