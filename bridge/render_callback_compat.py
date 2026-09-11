"""Narrow Render callback compatibility normalization.

This adapter changes only the payload copy sent to Render. It never places,
cancels, sizes, or otherwise mutates broker orders or trading decisions.
"""

from __future__ import annotations

import math
from typing import Any, Dict


def _text(payload: Dict[str, Any], key: str) -> str:
    return str(payload.get(key) or "").strip()


def _upper(payload: Dict[str, Any], key: str) -> str:
    return _text(payload, key).upper()


def _number(value: Any) -> float | None:
    try:
        number = float(str(value).replace(",", "").strip())
        return number if math.isfinite(number) else None
    except Exception:
        return None


def _valid_execution_identity(value: Any) -> bool:
    identity = str(value or "").strip().upper()
    if ":" not in identity:
        return False
    kind, identifier = identity.split(":", 1)
    if kind not in {"EXEC", "PERM", "ORDER", "REF"}:
        return False
    identifier = identifier.strip()
    return bool(identifier and identifier != "0" and identifier != "FLAT_NO_EXECUTION_HISTORY")


def _has_order_identity(payload: Dict[str, Any], keys: tuple[str, ...]) -> bool:
    return any(str(payload.get(key) or "").strip() not in {"", "0"} for key in keys)


def _is_flat(payload: Dict[str, Any]) -> bool:
    position_after = _number(payload.get("position_after_close"))
    return payload.get("broker_confirmed_flat") is True and position_after is not None and abs(position_after) < 1e-6


def _normalize_smi_target_exit(payload: Dict[str, Any]) -> None:
    if not (
        _upper(payload, "system_id") == "VIXALE_SMI_FWD"
        and _upper(payload, "source") == "IB_BRIDGE"
        and _upper(payload, "event") == "TP"
        and _upper(payload, "reason") == "IB_TARGET_EXECUTION_CONFIRMED"
        and _is_flat(payload)
        and _valid_execution_identity(payload.get("exit_execution_id"))
    ):
        return

    aliases = (
        ("ib_target_order_id", "ib_exit_order_id"),
        ("ib_target_perm_id", "ib_exit_perm_id"),
        ("ib_target_order_ref", "ib_exit_order_ref"),
    )
    for target_key, exit_key in aliases:
        if not str(payload.get(target_key) or "").strip() and str(payload.get(exit_key) or "").strip():
            payload[target_key] = payload[exit_key]


def _normalize_repaired_edge_entry_fill(payload: Dict[str, Any]) -> None:
    if not (
        _upper(payload, "system_id") == "VIXALE_EDGE"
        and _upper(payload, "source") == "IB_BRIDGE"
        and _upper(payload, "event") == "ENTRY_FILL"
        and payload.get("entry_filled") is True
        and _upper(payload, "ib_status") == "SUBMITTED_WITH_REPAIRED_TARGET"
        and _upper(payload, "ib_entry_status") in {"CANCELED", "CANCELLED"}
        and _valid_execution_identity(payload.get("entry_execution_id"))
        and _has_order_identity(payload, ("ib_order_id", "ib_order_perm_id", "ib_order_ref"))
        and _has_order_identity(payload, ("ib_target_order_id", "ib_target_perm_id", "ib_target_order_ref"))
    ):
        return

    fill_price = _number(payload.get("ib_entry_fill_price"))
    fill_qty = _number(payload.get("ib_entry_filled_qty"))
    published_price = _number(payload.get("entry"))
    if published_price is None:
        published_price = _number(payload.get("price"))
    published_qty = _number(payload.get("qty"))
    if published_qty is None:
        published_qty = _number(payload.get("size"))
    if published_qty is None:
        published_qty = _number(payload.get("quantity"))
    target = _number(payload.get("target"))

    if not (
        fill_price is not None and fill_price > 0
        and fill_qty is not None and fill_qty > 0
        and published_price is not None and published_price == fill_price
        and published_qty is not None and published_qty == fill_qty
        and target is not None and target > 0
    ):
        return

    # Preserve the broker's terminal order status while projecting the execution
    # status field Render validates. This applies only to a proven repaired-target
    # ENTRY_FILL with complete execution/order/price/quantity evidence.
    payload.setdefault("ib_entry_terminal_status", payload.get("ib_entry_status"))
    payload["ib_entry_status"] = "Filled"


def normalize_render_callback_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return a normalized copy suitable for Render callback validation."""
    if not isinstance(payload, dict):
        return payload
    normalized = dict(payload)
    _normalize_smi_target_exit(normalized)
    _normalize_repaired_edge_entry_fill(normalized)
    return normalized


def install_render_callback_compat(core: Any) -> None:
    """Wrap core.forward_to_render so old outbox rows and new callbacks normalize."""
    if getattr(core, "_render_callback_compat_installed", False):
        return

    original = getattr(core, "forward_to_render", None)
    if original is None:
        raise RuntimeError("Bridge core has no forward_to_render function to wrap")

    async def forward_to_render_compat(payload: Dict[str, Any]):
        return await original(normalize_render_callback_payload(payload))

    core.forward_to_render = forward_to_render_compat
    core._render_callback_compat_installed = True
