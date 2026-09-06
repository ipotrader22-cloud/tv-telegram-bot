"""Runtime safety layer for SMI Histogram v0.4-FWD.

This module does not calculate or alter SMI signals.  It only:

* optionally requires an explicit SMI-only symbol allowlist before SETUPs can
  reach the existing SMI adapter; and
* provides a broker-side EOD execution fallback for an already-enabled SMI EOD
  policy when TradingView has not delivered the expected EOD_CLOSE.

Prime/Edge/non-SMI payloads delegate to the previously installed handler
unchanged.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, time as dt_time
from typing import Any, Dict, Optional, Set
from zoneinfo import ZoneInfo

try:
    from . import smi_forward_adapter as smi
except ImportError:  # standalone C:\\ib_bridge deployment
    import smi_forward_adapter as smi


SMI_EOD_TIMEZONE = os.getenv("SMI_EOD_FAILSAFE_TIMEZONE", "America/New_York").strip() or "America/New_York"
SMI_EOD_FAILSAFE_TIME = os.getenv("SMI_EOD_FAILSAFE_TIME", "15:59:50").strip() or "15:59:50"
SMI_EOD_FAILSAFE_POLL_SECONDS = max(1.0, float(os.getenv("SMI_EOD_FAILSAFE_POLL_SECONDS", "2.0") or 2.0))


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return bool(default)
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


SMI_REQUIRE_EXPLICIT_SYMBOL_ALLOWLIST = _env_bool(
    "SMI_REQUIRE_EXPLICIT_SYMBOL_ALLOWLIST",
    True,
)
SMI_EOD_FAILSAFE_ENABLED = _env_bool("SMI_EOD_FAILSAFE_ENABLED", True)


def _symbol_set(value: str) -> Set[str]:
    return {
        item.strip().upper()
        for item in str(value or "").split(",")
        if item.strip()
    }


def configured_smi_allowed_symbols() -> Set[str]:
    return _symbol_set(os.getenv("SMI_ALLOWED_SYMBOLS", ""))


def _upper(data: Dict[str, Any], key: str) -> str:
    return str(data.get(key) or "").upper().strip()


def _managed_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = row.get("last_payload")
    return dict(payload) if isinstance(payload, dict) else {}


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


def smi_symbol_policy_guard(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Fail closed for SMI entries unless the symbol is explicitly allowed.

    This is deliberately SETUP-only.  Existing SMI exits are never blocked by
    the allowlist, and Prime/Edge payloads are not inspected here.
    """
    if not smi.is_smi_forward_payload(data) or _upper(data, "event") != "SETUP":
        return None

    if not SMI_REQUIRE_EXPLICIT_SYMBOL_ALLOWLIST:
        return None

    symbol = _upper(data, "symbol")
    allowed = configured_smi_allowed_symbols()
    if symbol and symbol in allowed:
        return None

    return _blocked(
        data,
        "smi_entry_blocked_symbol_not_allowlisted",
        "SMI entry blocked: symbol is not in explicit SMI_ALLOWED_SYMBOLS. Prime/Edge remain untouched.",
    )


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
    carrying ``eod_close_enabled=true`` are eligible.  The actual target/order
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

    async def handle_ib_action_with_smi_runtime_safety(data: Dict[str, Any]) -> Dict[str, Any]:
        policy_block = smi_symbol_policy_guard(data)
        if policy_block is not None:
            return policy_block

        if data.get("broker_smi_eod_watchdog") is True:
            if not smi.is_smi_forward_payload(data):
                return _blocked(data, "smi_eod_failsafe_identity_mismatch", "SMI EOD failsafe requires exact SMI identity.")
            if _upper(data, "event") != "EOD_CLOSE" or _upper(data, "signal") != "EOD_FLAT":
                return _blocked(data, "smi_eod_failsafe_event_mismatch", "SMI EOD failsafe accepts EOD_CLOSE/EOD_FLAT only.")
            # The existing SMI adapter accepts TradingView as its inbound signal
            # source.  Keep the watchdog payload itself truthfully IB_BRIDGE so
            # process_signal_background publishes the broker callback with the
            # correct origin, but delegate a copy through the already-tested SMI
            # ownership/target/close path.
            transport = dict(data)
            transport["source"] = "TradingView"
            return await existing_handle(transport)

        return await existing_handle(data)

    core.handle_ib_action = handle_ib_action_with_smi_runtime_safety
    core.run_smi_eod_fail_safe_once = lambda now=None: run_smi_eod_fail_safe_once(core, now)
    core._smi_runtime_safety_installed = True

    app = getattr(core, "app", None)
    if app is not None and hasattr(app, "on_event"):
        @app.on_event("startup")
        async def _start_smi_eod_fail_safe() -> None:
            asyncio.create_task(smi_eod_fail_safe_loop(core))

    return core
