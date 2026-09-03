"""Local-only operator cleanup for externally closed VECO managed positions.

This adapter deliberately does not place, modify, or cancel broker orders and it
never publishes a synthetic close. It exists for the real-life case where an
operator has already closed a position manually in TWS and wants the bridge to
forget the stale managed record without touching strategy behavior.

The destructive acknowledgement is allowed only on a direct localhost request,
after the bridge itself proves that the broker position is flat and that there
are no working orders left for the symbol. A caller must also echo the exact
managed identity returned by the preview endpoint so a stale browser tab cannot
clear a newer replacement trade for the same symbol.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import Request


CONFIRM_EXTERNAL_CLOSE = "ACK_EXTERNAL_CLOSE_AND_CLEAR_MANAGED"
_POSITION_EPSILON = 1e-6
_LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
_FORWARDED_HEADERS = (
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-real-ip",
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _symbol(value: Any) -> str:
    return _text(value).upper()


def _host_name(host_header: Any) -> str:
    value = _text(host_header).lower()
    if not value:
        return ""
    if value.startswith("[") and "]" in value:
        return value[1 : value.index("]")]
    return value.split(":", 1)[0]


def request_is_direct_local(request: Any) -> bool:
    """Reject ngrok/proxy traffic for the destructive operator endpoints."""
    headers = getattr(request, "headers", None) or {}
    for key in _FORWARDED_HEADERS:
        try:
            if _text(headers.get(key)):
                return False
        except Exception:
            return False

    try:
        host = _host_name(headers.get("host"))
    except Exception:
        return False

    client = getattr(request, "client", None)
    client_host = _text(getattr(client, "host", "")).lower()
    return host in _LOCAL_HOSTS and client_host in _LOCAL_HOSTS


def managed_identity(row: Dict[str, Any]) -> str:
    """Return a durable lifecycle identity that is safe to echo for cleanup.

    Only explicit setup_id/trade_id values are accepted. A SYMBOL_SIDE fallback
    is intentionally not used because a later trade can reuse the same symbol and
    side, which would make a stale operator acknowledgement unsafe.
    """
    if not isinstance(row, dict):
        return ""
    setup_id = _text(row.get("setup_id"))
    if setup_id:
        return setup_id
    return _text(row.get("trade_id"))


def _working_orders_for_symbol(core: Any, symbol: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for trade in list(core.ib.openTrades() or []):
        contract = getattr(trade, "contract", None)
        if _symbol(getattr(contract, "symbol", "")) != symbol:
            continue
        order = getattr(trade, "order", None)
        status_obj = getattr(trade, "orderStatus", None)
        rows.append({
            "order_id": getattr(order, "orderId", ""),
            "perm_id": getattr(order, "permId", ""),
            "order_ref": _text(getattr(order, "orderRef", "")),
            "action": _symbol(getattr(order, "action", "")),
            "order_type": _symbol(getattr(order, "orderType", "")),
            "qty": getattr(order, "totalQuantity", ""),
            "status": _text(getattr(status_obj, "status", "")),
        })
    return rows


def _row_summary(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "managed_identity": managed_identity(row),
        "system_id": _text(row.get("system_id")),
        "strategy": _text(row.get("strategy") or row.get("strategy_id")),
        "symbol": _symbol(row.get("symbol")),
        "side": _symbol(row.get("side")),
        "qty": row.get("qty", ""),
        "entry": row.get("entry", ""),
        "target": row.get("target", ""),
        "stop": row.get("stop", ""),
    }


async def inspect_external_close_locked(core: Any, symbol: str) -> Dict[str, Any]:
    """Inspect broker truth and managed state while the caller holds ib_lock."""
    symbol = _symbol(symbol)
    if not symbol:
        return {"ok": False, "status": "missing_symbol"}

    await core.ensure_ib_connected()
    managed = core.load_managed_positions()
    row = managed.get(symbol) if isinstance(managed, dict) else None
    if not isinstance(row, dict) or not row:
        return {
            "ok": False,
            "status": "no_managed_position",
            "symbol": symbol,
            "safe_to_clear": False,
        }

    identity = managed_identity(row)
    position = float(await core.get_position_size(symbol) or 0.0)
    working_orders = _working_orders_for_symbol(core, symbol)
    position_flat = abs(position) <= _POSITION_EPSILON
    safe_to_clear = bool(identity) and position_flat and not working_orders
    status = (
        "blocked_managed_identity_missing"
        if not identity
        else "blocked_broker_position_not_flat"
        if not position_flat
        else "blocked_working_orders_present"
        if working_orders
        else "safe_to_ack_external_close"
    )

    return {
        "ok": True,
        "status": status,
        "symbol": symbol,
        "broker_position": position,
        "position_flat": position_flat,
        "working_order_count": len(working_orders),
        "working_orders": working_orders,
        "safe_to_clear": safe_to_clear,
        **_row_summary(row),
    }


async def acknowledge_external_close_locked(core: Any, data: Dict[str, Any]) -> Dict[str, Any]:
    """Clear one stale managed record after strict broker-side proof of flatness."""
    if not isinstance(data, dict):
        return {"ok": False, "status": "invalid_payload"}

    symbol = _symbol(data.get("symbol"))
    expected_identity = _text(data.get("managed_identity"))
    confirmation = _text(data.get("confirm"))
    if not symbol:
        return {"ok": False, "status": "missing_symbol"}
    if not expected_identity:
        return {"ok": False, "status": "missing_managed_identity", "symbol": symbol}
    if confirmation != CONFIRM_EXTERNAL_CLOSE:
        return {
            "ok": False,
            "status": "confirmation_required",
            "symbol": symbol,
            "required_confirm": CONFIRM_EXTERNAL_CLOSE,
        }

    await core.ensure_ib_connected()
    managed = core.load_managed_positions()
    row = managed.get(symbol) if isinstance(managed, dict) else None
    if not isinstance(row, dict) or not row:
        return {
            "ok": False,
            "status": "no_managed_position",
            "symbol": symbol,
            "cleared": False,
        }

    current_identity = managed_identity(row)
    if not current_identity:
        return {
            "ok": False,
            "status": "blocked_managed_identity_missing",
            "symbol": symbol,
            "cleared": False,
        }
    if current_identity != expected_identity:
        return {
            "ok": False,
            "status": "managed_identity_mismatch",
            "symbol": symbol,
            "expected_managed_identity": expected_identity,
            "current_managed_identity": current_identity,
            "cleared": False,
        }

    position = float(await core.get_position_size(symbol) or 0.0)
    if abs(position) > _POSITION_EPSILON:
        return {
            "ok": False,
            "status": "blocked_broker_position_not_flat",
            "symbol": symbol,
            "managed_identity": current_identity,
            "broker_position": position,
            "cleared": False,
        }

    working_orders = _working_orders_for_symbol(core, symbol)
    if working_orders:
        return {
            "ok": False,
            "status": "blocked_working_orders_present",
            "symbol": symbol,
            "managed_identity": current_identity,
            "broker_position": position,
            "working_order_count": len(working_orders),
            "working_orders": working_orders,
            "cleared": False,
        }

    summary = _row_summary(row)
    core.clear_managed_position(symbol)
    after = core.load_managed_positions()
    if isinstance(after, dict) and symbol in after:
        return {
            "ok": False,
            "status": "managed_state_clear_failed",
            "symbol": symbol,
            "managed_identity": current_identity,
            "cleared": False,
        }

    logger = getattr(core, "logger", None)
    if logger is not None:
        try:
            logger.warning(
                "[OPERATOR EXTERNAL CLOSE ACK] symbol=%s identity=%s "
                "broker_position=0 working_orders=0 publication=skipped",
                symbol,
                current_identity,
            )
        except Exception:
            pass

    return {
        "ok": True,
        "status": "managed_state_cleared_after_external_close",
        "symbol": symbol,
        "managed_identity": current_identity,
        "broker_position": position,
        "working_order_count": 0,
        "cleared": True,
        "broker_orders_submitted": 0,
        "broker_orders_canceled": 0,
        "render_publication": "skipped_by_operator_protocol",
        "removed_managed_position": summary,
    }


def install_operator_manual_close_adapter(core: Any) -> Any:
    """Install local-only preview/ack routes without touching trading handlers."""
    if getattr(core, "_operator_manual_close_adapter_installed", False):
        return core

    @core.app.get("/ib/operator/external-close-check/{symbol}")
    async def operator_external_close_check(symbol: str, request: Request):
        if not request_is_direct_local(request):
            return {
                "ok": False,
                "status": "operator_endpoint_localhost_only",
                "symbol": _symbol(symbol),
            }
        async with core.ib_lock:
            return await inspect_external_close_locked(core, symbol)

    @core.app.post("/ib/operator/ack-external-close")
    async def operator_ack_external_close(request: Request):
        if not request_is_direct_local(request):
            return {"ok": False, "status": "operator_endpoint_localhost_only"}
        try:
            data = await request.json()
        except Exception:
            return {"ok": False, "status": "invalid_json"}
        async with core.ib_lock:
            return await acknowledge_external_close_locked(core, data)

    core.operator_external_close_check = operator_external_close_check
    core.operator_ack_external_close = operator_ack_external_close
    core._operator_manual_close_adapter_installed = True
    return core
