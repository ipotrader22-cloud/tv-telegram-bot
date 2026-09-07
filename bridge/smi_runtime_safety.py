"""Runtime safety layer for SMI Histogram v0.4-FWD and shared symbol ownership.

This module does not calculate or alter Prime, Edge, or SMI trading signals. It
only provides Engineering-owned execution safety:

* every stock symbol is eligible for Prime, Edge, and SMI; the first active
  bridge owner keeps exclusive symbol ownership until its managed lifecycle is
  cleared after broker-flat confirmation; and
* a broker-side EOD execution fallback for an already-enabled SMI EOD policy
  when TradingView has not delivered the expected EOD_CLOSE.

There is intentionally no SMI symbol allowlist. Cross-system ownership is the
runtime safety boundary instead.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, time as dt_time
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

try:
    from . import smi_forward_adapter as smi
except ImportError:  # standalone C:\\ib_bridge deployment
    import smi_forward_adapter as smi


SMI_EOD_TIMEZONE = os.getenv("SMI_EOD_FAILSAFE_TIMEZONE", "America/New_York").strip() or "America/New_York"
SMI_EOD_FAILSAFE_TIME = os.getenv("SMI_EOD_FAILSAFE_TIME", "15:59:50").strip() or "15:59:50"
SMI_EOD_FAILSAFE_POLL_SECONDS = max(1.0, float(os.getenv("SMI_EOD_FAILSAFE_POLL_SECONDS", "2.0") or 2.0))

OWNER_SMI = smi.SMI_SYSTEM_ID
OWNER_EDGE = "VIXALE_EDGE"
OWNER_PRIME = "VIXALE_PRIME"
OWNER_FAMILIES = {OWNER_SMI, OWNER_EDGE, OWNER_PRIME}
SYMBOL_OWNERSHIP_PROTECTED_EVENTS = {
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


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return bool(default)
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


SMI_EOD_FAILSAFE_ENABLED = _env_bool("SMI_EOD_FAILSAFE_ENABLED", True)


def _upper(data: Dict[str, Any], key: str) -> str:
    return str(data.get(key) or "").upper().strip()


def _managed_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = row.get("last_payload")
    return dict(payload) if isinstance(payload, dict) else {}


def _managed_payload_for_ownership(core: Any, row: Dict[str, Any]) -> Dict[str, Any]:
    builder = getattr(core, "managed_payload", None)
    if callable(builder):
        try:
            payload = builder(row)
            if isinstance(payload, dict):
                return dict(payload)
        except Exception:
            pass

    payload = _managed_payload(row)
    for key in ("system_id", "strategy", "strategy_id", "variant", "profile", "setup_id"):
        if row.get(key) not in (None, ""):
            payload[key] = row.get(key)
    return payload


def _owner_family(core: Any, data: Dict[str, Any]) -> str:
    if not isinstance(data, dict):
        return ""
    if smi.is_smi_forward_payload(data):
        return OWNER_SMI

    classifier = getattr(core, "classify_strategy_payload", None)
    if callable(classifier):
        try:
            family = str(classifier(data) or "").upper().strip()
            if family == "VIXALE_EDGE":
                return OWNER_EDGE
            if family == "VIXALE_PRIME_OPPOSITE_FLIP":
                return OWNER_PRIME
        except Exception:
            pass

    edge_predicate = getattr(core, "is_vixale_edge_payload", None)
    if callable(edge_predicate):
        try:
            if edge_predicate(data):
                return OWNER_EDGE
        except Exception:
            pass

    prime_predicate = getattr(core, "is_opposite_flip_payload", None)
    if callable(prime_predicate):
        try:
            if prime_predicate(data):
                return OWNER_PRIME
        except Exception:
            pass

    system_id = _upper(data, "system_id")
    if system_id in OWNER_FAMILIES:
        return system_id
    return ""


def _ownership_blocked(
    data: Dict[str, Any],
    status: str,
    message: str,
    **extra: Any,
) -> Dict[str, Any]:
    return {
        "ok": False,
        "dry_run": False,
        "status": status,
        "error": message,
        "message": message,
        "symbol": _upper(data, "symbol"),
        "event": _upper(data, "event"),
        "side": _upper(data, "side"),
        "setup_id": str(data.get("setup_id") or "").strip(),
        "incoming_system_id": _upper(data, "system_id"),
        "incoming_strategy": _upper(data, "strategy"),
        **extra,
    }


async def cross_system_symbol_ownership_guard(core: Any, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Enforce first-owner-wins across Prime, Edge, and SMI.

    The managed-position row is the durable owner record. Same-owner lifecycle
    events are left untouched so Prime can keep its existing reversal behavior,
    Edge keeps its existing one-position lifecycle, and SMI keeps its frozen
    forward-test behavior. A foreign family cannot enter, close, cancel, or
    otherwise mutate that symbol.

    When no managed owner exists, an unmanaged broker position or working order
    blocks a new Prime/Edge/SMI entry fail-closed. This covers the short window
    after broker acceptance and restart/orphan states without assigning ownership
    from a guessed orderRef.
    """
    event = _upper(data, "event")
    symbol = _upper(data, "symbol")
    if event not in SYMBOL_OWNERSHIP_PROTECTED_EVENTS or not symbol:
        return None

    incoming_owner = _owner_family(core, data)
    managed = core.load_managed_positions()
    managed = managed if isinstance(managed, dict) else {}
    row = dict(managed.get(symbol) or {})

    if row:
        owner_payload = _managed_payload_for_ownership(core, row)
        active_owner = _owner_family(core, owner_payload)

        if active_owner and incoming_owner == active_owner:
            return None

        # If either side is one of the three Vixale execution families, fail
        # closed rather than allowing a different or unclassified payload to
        # overwrite/mutate an existing managed symbol.
        if active_owner or incoming_owner:
            return _ownership_blocked(
                data,
                (
                    "entry_blocked_symbol_owned_by_other_system"
                    if event == "SETUP"
                    else "symbol_mutation_blocked_by_owner"
                ),
                "Symbol is already owned by another managed bridge lifecycle; incoming broker mutation blocked.",
                owner_family=active_owner or "UNKNOWN_MANAGED",
                owner_system_id=str(row.get("system_id") or owner_payload.get("system_id") or "").upper().strip(),
                owner_strategy=str(
                    row.get("strategy")
                    or row.get("strategy_id")
                    or owner_payload.get("strategy")
                    or owner_payload.get("strategy_id")
                    or ""
                ).upper().strip(),
                owner_setup_id=str(row.get("setup_id") or owner_payload.get("setup_id") or "").strip(),
                incoming_owner_family=incoming_owner or "UNCLASSIFIED",
            )
        return None

    # Only SETUPs from the three requested systems claim a free symbol. Other
    # events without a managed row continue through the pre-existing core logic.
    if event != "SETUP" or incoming_owner not in OWNER_FAMILIES:
        return None

    await core.ensure_ib_connected()
    position = float(await core.get_position_size(symbol) or 0.0)
    if abs(position) > 0.000001:
        return _ownership_blocked(
            data,
            "entry_blocked_unmanaged_broker_position",
            "Symbol has a broker position but no managed owner record; new entry blocked fail-closed.",
            incoming_owner_family=incoming_owner,
            position_before_entry=position,
        )

    working_refs = []
    for trade in list(core.ib.openTrades() or []):
        contract_symbol = str(
            getattr(getattr(trade, "contract", None), "symbol", "") or ""
        ).upper().strip()
        if contract_symbol != symbol:
            continue
        order = getattr(trade, "order", None)
        working_refs.append(str(getattr(order, "orderRef", "") or ""))

    if working_refs:
        return _ownership_blocked(
            data,
            "entry_blocked_unmanaged_working_orders",
            "Symbol has working broker orders but no managed owner record; new entry blocked fail-closed.",
            incoming_owner_family=incoming_owner,
            working_order_count=len(working_refs),
        )

    return None


def _is_exact_smi_managed_row(row: Dict[str, Any]) -> bool:
    if not isinstance(row, dict):
        return False
    payload = _managed_payload(row)
    system_id = str(row.get("system_id") or payload.get("system_id") or "").upper().strip()
    strategy = str(
        row.get("strategy")
        or row.get("strategy_id")
        or payload.get("strategy_id")
        or payload.get("strategy")
        or ""
    ).upper().strip()
    return system_id == smi.SMI_SYSTEM_ID and strategy == smi.SMI_STRATEGY_ID


def _blocked(data: Dict[str, Any], status: str, error: str) -> Dict[str, Any]:
    return {
        "ok": False,
        "status": status,
        "error": error,
        "symbol": _upper(data, "symbol"),
        "event": _upper(data, "event"),
        "system_id": _upper(data, "system_id"),
        "strategy": _upper(data, "strategy"),
    }


def _parse_clock(value: str) -> dt_time:
    parts = [int(part) for part in str(value or "").strip().split(":")]
    if len(parts) == 2:
        return dt_time(parts[0], parts[1])
    if len(parts) == 3:
        return dt_time(parts[0], parts[1], parts[2])
    raise ValueError(f"Invalid SMI EOD failsafe clock: {value!r}")


def _same_ny_date(created_at: Any, now: datetime) -> bool:
    raw = str(created_at or "").strip()
    if not raw:
        return False
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(SMI_EOD_TIMEZONE))
    return parsed.astimezone(ZoneInfo(SMI_EOD_TIMEZONE)).date() == now.date()


def _eod_enabled(row: Dict[str, Any]) -> bool:
    payload = _managed_payload(row)
    return payload.get("eod_close_enabled") is True


def _watchdog_payload(row: Dict[str, Any], position: float) -> Dict[str, Any]:
    payload = _managed_payload(row)
    symbol = str(row.get("symbol") or payload.get("symbol") or "").upper().strip()
    side = str(row.get("side") or payload.get("side") or "").upper().strip()
    setup_id = str(row.get("setup_id") or payload.get("setup_id") or "").strip()
    qty = int(abs(position))

    data = dict(payload)
    data.update({
        "source": "IB_BRIDGE",
        "system_id": smi.SMI_SYSTEM_ID,
        "strategy": smi.SMI_STRATEGY_ID,
        "strategy_id": smi.SMI_STRATEGY_ID,
        "research_version": smi.SMI_RESEARCH_VERSION,
        "event": "EOD_CLOSE",
        "signal": "EOD_FLAT",
        "symbol": symbol,
        "side": side,
        "setup_id": setup_id,
        "qty": qty,
        "position_size_pct": smi.SMI_POSITION_SIZE_PCT,
        "qty_source": smi.SMI_QTY_SOURCE,
        "broker_smi_eod_watchdog": True,
        "reason": "BROKER_SMI_EOD_FAILSAFE_AFTER_MISSING_TV_EOD",
    })
    return data


async def run_smi_eod_fail_safe_once(core: Any, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Run one fail-closed SMI EOD safety pass.

    Only exact SMI managed rows opened on the current NY date and explicitly
    carrying ``eod_close_enabled=true`` are eligible. The actual target/order
    ownership checks and close mechanics remain in the existing SMI adapter.
    """
    if not SMI_EOD_FAILSAFE_ENABLED:
        return {"ok": True, "status": "disabled", "checked": 0, "details": []}

    tz = ZoneInfo(SMI_EOD_TIMEZONE)
    current = now.astimezone(tz) if now else datetime.now(tz)
    if current.weekday() >= 5:
        return {"ok": True, "status": "weekend", "checked": 0, "details": []}

    trigger = _parse_clock(SMI_EOD_FAILSAFE_TIME)
    if current.time().replace(tzinfo=None) < trigger:
        return {"ok": True, "status": "before_failsafe_time", "checked": 0, "details": []}

    managed = core.load_managed_positions()
    details = []
    checked = 0

    for symbol, row in list(managed.items()):
        if not _is_exact_smi_managed_row(row):
            continue
        if not _eod_enabled(row):
            details.append({"symbol": symbol, "status": "skipped_eod_disabled"})
            continue
        if not _same_ny_date(row.get("created_at"), current):
            details.append({"symbol": symbol, "status": "skipped_not_opened_today"})
            continue
        if row.get("pending_close_payload"):
            details.append({"symbol": symbol, "status": "pending_close_delivery_preserved"})
            continue

        checked += 1
        position = float(await core.get_position_size(str(symbol).upper()))
        if abs(position) <= 0.000001:
            details.append({"symbol": symbol, "status": "already_flat"})
            continue

        side = str(row.get("side") or _managed_payload(row).get("side") or "").upper().strip()
        if (side == "LONG" and position <= 0) or (side == "SHORT" and position >= 0):
            details.append({
                "symbol": symbol,
                "status": "blocked_position_side_mismatch",
                "position": position,
                "managed_side": side,
            })
            continue

        managed_qty = float(row.get("qty") or 0)
        if managed_qty > 0 and abs(abs(position) - managed_qty) > 0.000001:
            details.append({
                "symbol": symbol,
                "status": "blocked_position_qty_mismatch",
                "position": position,
                "managed_qty": managed_qty,
            })
            continue

        data = _watchdog_payload(row, position)
        await core.process_signal_background(data)
        details.append({
            "symbol": symbol,
            "status": "failsafe_dispatched",
            "position_before": position,
            "setup_id": data.get("setup_id"),
        })

    return {"ok": True, "status": "completed", "checked": checked, "details": details}


async def smi_eod_fail_safe_loop(core: Any) -> None:
    while True:
        try:
            result = await run_smi_eod_fail_safe_once(core)
            if result.get("checked"):
                print(f"[SMI EOD FAILSAFE RESULT] {result}")
        except Exception as exc:
            print(f"[SMI EOD FAILSAFE ERROR] {exc}")
        await asyncio.sleep(SMI_EOD_FAILSAFE_POLL_SECONDS)


def install_smi_runtime_safety(core: Any) -> Any:
    """Install after ``install_smi_forward_adapter`` without changing core code."""
    if getattr(core, "_smi_runtime_safety_installed", False):
        return core

    existing_handle = core.handle_ib_action
    routing_lock = asyncio.Lock()

    async def handle_ib_action_with_smi_runtime_safety(data: Dict[str, Any]) -> Dict[str, Any]:
        # Serialize the ownership decision through delegation. This makes the
        # first accepted SETUP the owner even when two systems alert together.
        async with routing_lock:
            async with core.ib_lock:
                ownership_block = await cross_system_symbol_ownership_guard(core, data)
            if ownership_block is not None:
                return ownership_block

            if data.get("broker_smi_eod_watchdog") is True:
                if not smi.is_smi_forward_payload(data):
                    return _blocked(data, "smi_eod_failsafe_identity_mismatch", "SMI EOD failsafe requires exact SMI identity.")
                if _upper(data, "event") != "EOD_CLOSE" or _upper(data, "signal") != "EOD_FLAT":
                    return _blocked(data, "smi_eod_failsafe_event_mismatch", "SMI EOD failsafe accepts EOD_CLOSE/EOD_FLAT only.")
                # The existing SMI adapter accepts TradingView as its inbound
                # signal source. Keep the watchdog payload itself truthfully
                # IB_BRIDGE so publication origin remains correct, but delegate
                # a copy through the already-tested SMI ownership/target path.
                transport = dict(data)
                transport["source"] = "TradingView"
                return await existing_handle(transport)

            return await existing_handle(data)

    core.handle_ib_action = handle_ib_action_with_smi_runtime_safety
    core.cross_system_symbol_ownership_guard = lambda data: cross_system_symbol_ownership_guard(core, data)
    core.run_smi_eod_fail_safe_once = lambda now=None: run_smi_eod_fail_safe_once(core, now)
    core._smi_runtime_safety_installed = True

    app = getattr(core, "app", None)
    if app is not None and hasattr(app, "on_event"):
        @app.on_event("startup")
        async def _start_smi_eod_fail_safe() -> None:
            asyncio.create_task(smi_eod_fail_safe_loop(core))

    return core
