"""SMI Histogram v0.4-FWD execution adapter.

This module isolates the frozen SMI forward-test transport from the existing
Prime/Edge bridge core.  It never calculates or reinterprets SMI research
signals.  It validates only Engineering-owned serialization/ownership and then
delegates broker work to the pre-existing bridge core.
"""

from __future__ import annotations

import asyncio
import math
from typing import Any, Dict, Optional, Tuple

SMI_SYSTEM_ID = "VIXALE_SMI_FWD"
SMI_STRATEGY_ID = "SMI_HISTOGRAM_V0_4_FWD"
SMI_RESEARCH_VERSION = "0.4-FWD"
SMI_POSITION_SIZE_PCT = 3.0
SMI_QTY_SOURCE = "TV Strategy Properties"
SMI_SUPPORTED_SEC_TYPE = "STK"

SMI_SIGNAL_TRANSPORT: Dict[str, Tuple[str, str]] = {
    "BUY": ("SETUP", "LONG"),
    "SELL": ("SETUP", "SHORT"),
    "EXIT_LONG": ("CLOSE_STOP", "LONG"),
    "EXIT_SHORT": ("CLOSE_STOP", "SHORT"),
}

# These existing bridge events can mutate broker state.  If SMI owns a symbol,
# a foreign TradingView strategy must not be able to reverse/close/cancel it.
SMI_OWNERSHIP_PROTECTED_EVENTS = {
    "SETUP",
    "CANCEL_REPLACE",
    "EOD_RESET",
    "NEW_DAY_RESET",
    "CANCEL",
    "TP",
    "CLOSE_STOP",
    "EOD_CLOSE",
    "NEW_DAY_EMERGENCY_CLOSE",
}


def _text(data: Dict[str, Any], key: str) -> str:
    return str(data.get(key) or "").strip()


def _upper(data: Dict[str, Any], key: str) -> str:
    return _text(data, key).upper()


def _float(value: Any) -> float:
    try:
        result = float(str(value).replace(",", "").strip())
        return result if math.isfinite(result) else 0.0
    except Exception:
        return 0.0


def _int(value: Any) -> int:
    try:
        numeric = float(str(value).replace(",", "").strip())
        if not math.isfinite(numeric) or numeric <= 0 or not numeric.is_integer():
            return 0
        return int(numeric)
    except Exception:
        return 0


def is_smi_forward_payload(data: Dict[str, Any]) -> bool:
    """Claim only the exact Engineering-owned SMI execution family."""
    return isinstance(data, dict) and _upper(data, "system_id") == SMI_SYSTEM_ID


def _blocked(data: Dict[str, Any], status: str, message: str, **extra: Any) -> Dict[str, Any]:
    return {
        "dry_run": False,
        "status": status,
        "system_id": SMI_SYSTEM_ID,
        "strategy_id": SMI_STRATEGY_ID,
        "symbol": _upper(data, "symbol"),
        "side": _upper(data, "side"),
        "signal": _upper(data, "signal"),
        "event": _upper(data, "event"),
        "setup_id": _text(data, "setup_id"),
        "message": message,
        **extra,
    }


def _expected_setup_id(data: Dict[str, Any]) -> str:
    return ":".join(
        [
            SMI_STRATEGY_ID,
            _upper(data, "symbol"),
            _text(data, "timeframe"),
            _upper(data, "side"),
            str(_int(data.get("signal_bar_time"))),
        ]
    )


def _managed_row_is_smi(row: Dict[str, Any]) -> bool:
    if not isinstance(row, dict) or not row:
        return False
    if str(row.get("system_id") or "").strip().upper() != SMI_SYSTEM_ID:
        return False
    last_payload = row.get("last_payload") if isinstance(row.get("last_payload"), dict) else {}
    strategy = str(
        row.get("strategy_id")
        or row.get("strategy")
        or last_payload.get("strategy_id")
        or last_payload.get("strategy")
        or ""
    ).strip().upper()
    return strategy == SMI_STRATEGY_ID


def _managed_smi_row(core: Any, symbol: str) -> Dict[str, Any]:
    managed = core.load_managed_positions()
    if not isinstance(managed, dict):
        return {}
    row = managed.get(symbol)
    return dict(row) if isinstance(row, dict) else {}


def validate_smi_transport_contract(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Validate serialization only; never derive a trading signal."""
    if _upper(data, "source") != "TRADINGVIEW":
        return _blocked(data, "smi_contract_source_mismatch", "SMI live execution accepts TradingView source only.")
    if _upper(data, "strategy_id") != SMI_STRATEGY_ID:
        return _blocked(data, "smi_contract_strategy_id_mismatch", "SMI strategy_id mismatch.")
    if _upper(data, "strategy") != SMI_STRATEGY_ID:
        return _blocked(data, "smi_contract_strategy_mismatch", "SMI strategy transport identity mismatch.")
    if _upper(data, "research_version") != SMI_RESEARCH_VERSION:
        return _blocked(data, "smi_contract_research_version_mismatch", "SMI research version mismatch.")
    if _upper(data, "sec_type") != SMI_SUPPORTED_SEC_TYPE:
        return _blocked(data, "smi_contract_stock_only", "SMI forward-test execution is stock-only in VECO.")

    pct = _float(data.get("position_size_pct"))
    if not math.isclose(pct, SMI_POSITION_SIZE_PCT, rel_tol=0.0, abs_tol=1e-9):
        return _blocked(
            data,
            "smi_contract_position_size_pct_mismatch",
            f"SMI live sizing must be exactly {SMI_POSITION_SIZE_PCT:g}% of equity from Pine Strategy Properties.",
            observed_position_size_pct=pct,
        )
    if _text(data, "qty_source") != SMI_QTY_SOURCE:
        return _blocked(data, "smi_contract_qty_source_mismatch", "SMI quantity must come from TV Strategy Properties.")
    if _int(data.get("qty")) <= 0:
        return _blocked(data, "smi_contract_invalid_qty", "SMI payload quantity must be a positive integer.")

    symbol = _upper(data, "symbol")
    timeframe = _text(data, "timeframe")
    setup_id = _text(data, "setup_id")
    signal = _upper(data, "signal")
    event = _upper(data, "event")
    side = _upper(data, "side")
    if not symbol or not timeframe or not setup_id:
        return _blocked(data, "smi_contract_identity_missing", "SMI symbol/timeframe/setup_id is required.")

    if signal == "EOD_FLAT":
        if event != "EOD_CLOSE" or side not in ("LONG", "SHORT"):
            return _blocked(data, "smi_contract_signal_event_mismatch", "EOD_FLAT must serialize as EOD_CLOSE on the active side.")
    elif signal in SMI_SIGNAL_TRANSPORT:
        expected_event, expected_side = SMI_SIGNAL_TRANSPORT[signal]
        if event != expected_event or side != expected_side:
            return _blocked(
                data,
                "smi_contract_signal_event_mismatch",
                f"{signal} must serialize as {expected_event}/{expected_side}.",
            )
    else:
        return _blocked(data, "smi_contract_unsupported_signal", "Unsupported SMI research signal.")

    if signal in ("BUY", "SELL"):
        signal_bar_time = _int(data.get("signal_bar_time"))
        if signal_bar_time <= 0 or setup_id != _expected_setup_id(data):
            return _blocked(data, "smi_contract_entry_setup_id_mismatch", "SMI entry setup_id does not match its signal identity.")
        entry = _float(data.get("entry"))
        target = _float(data.get("target"))
        if entry <= 0 or target <= 0:
            return _blocked(data, "smi_contract_entry_target_missing", "SMI entry and frozen ATR target must be positive.")
        if side == "LONG" and target <= entry:
            return _blocked(data, "smi_contract_invalid_target", "SMI LONG target must be above the signal entry price.")
        if side == "SHORT" and target >= entry:
            return _blocked(data, "smi_contract_invalid_target", "SMI SHORT target must be below the signal entry price.")
        if _upper(data, "entry_order_type") != "MARKET":
            return _blocked(data, "smi_contract_entry_order_type_mismatch", "SMI forward-test entries must serialize as MARKET.")
        if _upper(data, "target_tif") != "GTC":
            return _blocked(data, "smi_contract_target_tif_mismatch", "SMI frozen ATR target must serialize as GTC.")

    return None


async def _smi_entry_guard(core: Any, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    symbol = _upper(data, "symbol")

    # Broker position is authoritative. Any existing position blocks SMI entry,
    # regardless of which VECO strategy owns it.
    position = await core.get_position_size(symbol)
    if abs(float(position or 0.0)) > 0.000001:
        return _blocked(
            data,
            "smi_entry_blocked_existing_broker_position",
            "SMI entry blocked because TWS already has a position for this symbol.",
            position_before_entry=position,
        )

    # Managed state is symbol-global. Do not let SMI overwrite Prime/Edge/other
    # ownership even if the broker happens to be flat during a lifecycle race.
    existing = _managed_smi_row(core, symbol)
    if existing:
        return _blocked(
            data,
            "smi_entry_blocked_existing_managed_state",
            "SMI entry blocked because the bridge already manages this symbol.",
            managed_system_id=str(existing.get("system_id") or ""),
            managed_setup_id=str(existing.get("setup_id") or ""),
        )

    # Generic bridge entry code may cancel same-symbol/same-side orders before
    # submitting. Prove there are no broker working orders for this symbol first,
    # so the delegated path cannot disturb Prime/Edge protection or manual orders.
    await core.ensure_ib_connected()
    working_refs = []
    for trade in list(core.ib.openTrades() or []):
        contract_symbol = str(getattr(getattr(trade, "contract", None), "symbol", "") or "").upper().strip()
        if contract_symbol != symbol:
            continue
        order = getattr(trade, "order", None)
        working_refs.append(str(getattr(order, "orderRef", "") or ""))
    if working_refs:
        return _blocked(
            data,
            "smi_entry_blocked_existing_working_orders",
            "SMI entry blocked because TWS has working orders for this symbol.",
            working_order_count=len(working_refs),
        )

    return None


def _smi_exit_ownership_guard(core: Any, data: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    symbol = _upper(data, "symbol")
    side = _upper(data, "side")
    setup_id = _text(data, "setup_id")
    row = _managed_smi_row(core, symbol)

    if not row:
        return _blocked(data, "smi_exit_blocked_no_managed_position", "SMI exit blocked because no managed SMI position exists."), {}
    if not _managed_row_is_smi(row):
        return _blocked(
            data,
            "smi_exit_blocked_foreign_managed_position",
            "SMI exit blocked because this symbol is owned by another bridge strategy.",
            managed_system_id=str(row.get("system_id") or ""),
            managed_strategy=str(row.get("strategy") or row.get("strategy_id") or ""),
        ), row
    if str(row.get("setup_id") or "").strip() != setup_id:
        return _blocked(
            data,
            "smi_exit_blocked_setup_id_mismatch",
            "SMI exit setup_id does not match the active managed position.",
            managed_setup_id=str(row.get("setup_id") or ""),
        ), row
    if str(row.get("side") or "").strip().upper() != side:
        return _blocked(
            data,
            "smi_exit_blocked_side_mismatch",
            "SMI exit side does not match the active managed position.",
            managed_side=str(row.get("side") or ""),
        ), row
    return None, row


async def _prepare_smi_exit(core: Any, data: Dict[str, Any], row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Resolve only the exact SMI target before generic market-close delegation.

    The existing generic close reads position before broad same-side cancellation.
    SMI first proves ownership, refuses foreign working orders, resolves the exact
    managed target, and re-synchronizes any partial target fill.  The delegated
    close therefore sees a terminal target and a fresh broker position.
    """
    symbol = _upper(data, "symbol")
    side = _upper(data, "side")

    # Match the core's own hard timing rule before touching the protective target.
    if (
        getattr(core, "BLOCK_MARKET_CLOSES_OUTSIDE_RTH", False)
        and hasattr(core, "is_us_stock_rth_now")
        and not core.is_us_stock_rth_now()
    ):
        position = await core.get_position_size(symbol)
        return _blocked(
            data,
            "smi_exit_blocked_outside_rth_no_cancel",
            "SMI market close is outside stock RTH; managed target was not canceled.",
            position_before_close=position,
        )

    await core.ensure_ib_connected()

    exact_target = core.find_exact_managed_target_trade(row)
    position_before = await core.get_position_size(symbol)
    if abs(float(position_before or 0.0)) <= 0.000001:
        # Do not fabricate a close. Existing managed reconciliation owns the
        # target/manual evidence classification for an already-flat broker row.
        return _blocked(
            data,
            "smi_exit_broker_already_flat",
            "SMI exit found the broker already flat; no market close was submitted.",
            position_before_close=position_before,
        )
    if exact_target is None:
        return _blocked(
            data,
            "smi_exit_exact_target_unconfirmed",
            "SMI exit could not prove the exact managed target; no target or market order was changed.",
            position_before_close=position_before,
        )

    # The delegated generic close uses a broad same-side cancel. Refuse to enter
    # it if any other working order exists for this symbol. This protects manual,
    # Prime, Edge, and other VECO orders created after SMI entry.
    foreign_working = []
    exact_target_order = getattr(exact_target, "order", None)
    exact_order_id = str(getattr(exact_target_order, "orderId", "") or "")
    exact_perm_id = str(getattr(exact_target_order, "permId", "") or "")
    exact_ref = str(getattr(exact_target_order, "orderRef", "") or "")
    for trade in list(core.ib.openTrades() or []):
        contract_symbol = str(getattr(getattr(trade, "contract", None), "symbol", "") or "").upper().strip()
        if contract_symbol != symbol:
            continue
        order = getattr(trade, "order", None)
        order_id = str(getattr(order, "orderId", "") or "")
        perm_id = str(getattr(order, "permId", "") or "")
        order_ref = str(getattr(order, "orderRef", "") or "")
        same_exact_target = bool(
            (exact_perm_id and perm_id == exact_perm_id)
            or (not exact_perm_id and exact_order_id and order_id == exact_order_id)
            or (not exact_perm_id and not exact_order_id and exact_ref and order_ref == exact_ref)
        )
        if not same_exact_target:
            foreign_working.append(order_ref or order_id or perm_id or "<unknown>")
    if foreign_working:
        return _blocked(
            data,
            "smi_exit_blocked_foreign_working_orders",
            "SMI exit blocked because another working order exists for this symbol; managed target was not canceled.",
            foreign_working_order_count=len(foreign_working),
        )

    resolution = await core.cancel_and_verify_edge_target(row)
    if not resolution.get("ok"):
        return _blocked(
            data,
            "smi_exit_target_cancel_unconfirmed",
            "SMI exact target cancellation was not proven; no market close was submitted.",
            target_status=resolution.get("target_status", ""),
            canceled_targets=resolution.get("canceled_targets", 0),
        )

    status = str(resolution.get("status") or "")
    target_filled_qty = float(resolution.get("target_filled_qty") or 0.0)
    if status == "target_filled":
        position_after = await core.get_position_size(symbol)
        return _blocked(
            data,
            "smi_exit_target_won_race",
            "SMI target filled while the exit was being resolved; no market close was submitted.",
            target_filled_qty=target_filled_qty,
            target_fill_price=resolution.get("target_fill_price", 0),
            position_after_target_resolution=position_after,
        )

    if status != "target_cancelled":
        return _blocked(
            data,
            "smi_exit_target_resolution_unknown",
            "SMI target resolution was not a proven fill or cancellation; no market close was submitted.",
            target_resolution=status,
        )

    if target_filled_qty > 0:
        original_qty = float(row.get("qty") or data.get("qty") or 0.0)
        expected_remaining = max(0.0, original_qty - target_filled_qty)
        sync = await core.wait_for_edge_partial_position_sync(symbol, side, expected_remaining)
        if not sync.get("confirmed"):
            return _blocked(
                data,
                "smi_exit_partial_target_position_sync_unconfirmed",
                "SMI partial target fill could not be synchronized to the broker position; automatic close withheld.",
                target_filled_qty=target_filled_qty,
                expected_remaining_qty=expected_remaining,
                observed_position=sync.get("position", sync.get("confirmed_remaining_qty", "")),
            )
        # A partial target + indicator/EOD close is a mixed execution. Broker
        # flattening is still required, but generic publication must not pretend
        # the market-close price represents the whole original position. The
        # post-delegation wrapper below withholds automatic publication.
        data["_smi_partial_target_filled_qty"] = target_filled_qty
        data["_smi_partial_target_fill_price"] = resolution.get("target_fill_price", 0)
        data["_smi_partial_target_exec_ids"] = list(resolution.get("target_exec_ids") or [])

    position_after = await core.get_position_size(symbol)
    if side == "LONG" and float(position_after or 0.0) <= 0:
        return _blocked(
            data,
            "smi_exit_no_matching_position_after_target_resolution",
            "SMI LONG exit no longer has a matching broker position; no market close was submitted.",
            position_after_target_resolution=position_after,
        )
    if side == "SHORT" and float(position_after or 0.0) >= 0:
        return _blocked(
            data,
            "smi_exit_no_matching_position_after_target_resolution",
            "SMI SHORT exit no longer has a matching broker position; no market close was submitted.",
            position_after_target_resolution=position_after,
        )
    return None


def _foreign_payload_guard(core: Any, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Protect an active SMI-owned symbol from another TradingView family.

    This changes no normal Prime/Edge path. It can fire only after SMI managed
    state exists, a state that did not exist before this integration.
    """
    event = _upper(data, "event")
    symbol = _upper(data, "symbol")
    if event not in SMI_OWNERSHIP_PROTECTED_EVENTS or not symbol:
        return None
    row = _managed_smi_row(core, symbol)
    if not _managed_row_is_smi(row):
        return None
    return _blocked(
        data,
        "smi_managed_symbol_reserved",
        "Broker-mutating foreign payload blocked because this symbol is owned by an active SMI setup.",
        managed_setup_id=str(row.get("setup_id") or ""),
        incoming_system_id=_upper(data, "system_id"),
        incoming_strategy=_upper(data, "strategy"),
    )


def install_smi_forward_adapter(core: Any) -> Any:
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
