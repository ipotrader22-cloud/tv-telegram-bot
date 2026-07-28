import os
import json
import asyncio
import logging
import math
import hashlib
from datetime import datetime, time
from zoneinfo import ZoneInfo
from typing import Any, Dict, Optional, Tuple, List

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, Request, BackgroundTasks
from ib_async import IB, Stock, Future, LimitOrder, MarketOrder

load_dotenv()


def env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, default)).replace(",", "").strip())
    except Exception:
        return default


def env_int(name: str, default: int) -> int:
    try:
        return int(float(str(os.getenv(name, default)).replace(",", "").strip()))
    except Exception:
        return default


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "y", "on")


def payload_text(data: Dict[str, Any]) -> str:
    try:
        return " ".join(str(data.get(k, "")) for k in [
            "system_id", "strategy", "profile", "variant", "target_type", "eod_policy", "reason"
        ]).upper()
    except Exception:
        return ""


def is_vixale_edge_payload(data: Dict[str, Any]) -> bool:
    """Classify Edge before the shared generic Opposite Flip strategy name."""
    if not isinstance(data, dict):
        return False

    system_id = str(data.get("system_id") or "").strip().upper()
    variant = str(data.get("variant") or "").strip().upper()
    strategy = str(data.get("strategy") or "").strip().upper()
    text = payload_text(data)

    return (
        system_id == "VIXALE_EDGE"
        or variant == "FIONA_LIMIT_PULLBACK_ATR_TARGET"
        or strategy == "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_V1"
        or "FIONA_LIMIT_PULLBACK_ATR_TARGET" in text
        or "VX_FIONA_LIMIT_PULLBACK_LIVE" in text
        or "_FIONA_LIMIT" in text
        or "FIONA_LONG_LIMIT_PULLBACK" in text
        or "FIONA_SHORT_LIMIT_PULLBACK" in text
    )


def is_opposite_flip_payload(data: Dict[str, Any]) -> bool:
    if is_vixale_edge_payload(data):
        return False

    text = payload_text(data)
    return (
        "SHREK_1_4" in text
        or "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET" in text
        or "OPPOSITE_FLIP_ALWAYS_IN_MARKET" in text
        or "NONE_OPPOSITE_FLIP" in text
    )


def is_ema_pullback_payload(data: Dict[str, Any]) -> bool:
    text = payload_text(data)
    return (
        "VX_EMA_CROSS_PULLBACK_ATR_TARGET" in text
        or "EMA_CROSS_PULLBACK_ATR_TARGET" in text
        or "EMA_CROSS_PULLBACK" in text
    )


def classify_strategy_payload(data: Dict[str, Any]) -> str:
    """Return the execution family using the architecture-sensitive precedence."""
    if is_vixale_edge_payload(data):
        return "VIXALE_EDGE"
    if is_opposite_flip_payload(data):
        return "VIXALE_PRIME_OPPOSITE_FLIP"
    if is_ema_pullback_payload(data):
        return "EMA_PULLBACK"
    return "OTHER"


def is_no_target_payload(data: Dict[str, Any]) -> bool:
    target_type = str(data.get("target_type") or data.get("targetType") or "").strip().upper()
    variant = str(data.get("variant") or "").strip().upper()

    # Shrek/OppositeFlip can now run in two modes:
    # - NONE_OPPOSITE_FLIP / no target
    # - ATR_LIMIT_OPPOSITE_FLIP / attached target
    # So do not classify every OppositeFlip payload as no-target.
    return (
        target_type in ("NONE", "NO_TARGET")
        or "NONE_OPPOSITE_FLIP" in target_type
        or "OPPOSITE_FLIP_ALWAYS_IN_MARKET" in variant
    )


def is_render_forwarded_payload(data: Dict[str, Any]) -> bool:
    return bool(data.get("render_forwarded_at") or data.get("render_safety"))


IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
IB_PORT = int(os.getenv("IB_PORT", "7497"))
IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", "77"))

RENDER_WEBHOOK_URL = os.getenv("RENDER_WEBHOOK_URL", "")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"

# Stock orders are normally quoted in pennies. Keep this configurable in case
# we later route instruments that need more decimals.
PRICE_DECIMALS = int(os.getenv("PRICE_DECIMALS", "2"))

# Safety / routing controls.
# ENTRY_ORDER_TYPE can be LIMIT or MARKET.
# - LIMIT preserves the old behavior: entry at payload["entry"].
# - MARKET is better for immediate signal strategies where you do not want
#   orders sitting all day at the old signal close.
ENTRY_ORDER_TYPE_DEFAULT = os.getenv("ENTRY_ORDER_TYPE", "MARKET").strip().upper()

# If > 0, block orders before sending them to IB when entry * qty exceeds this.
# Example: MAX_ORDER_NOTIONAL=10000 blocks a 471-share GOOGL order around $338.
MAX_ORDER_NOTIONAL = env_float("MAX_ORDER_NOTIONAL", 0.0)

# If > 0, block orders before sending them to IB when qty exceeds this.
MAX_SHARE_QTY = env_int("MAX_SHARE_QTY", 0)
# Used only if Render/Pine does not send qty. Keep small for demo/paper.
DEFAULT_STOCK_QTY = env_int("DEFAULT_STOCK_QTY", 1)

# Set to false if you want to block short orders during testing.
ALLOW_SHORTS = env_bool("ALLOW_SHORTS", True)

# Futures routing / safety controls.
# One bridge can handle both stocks and futures. Stocks default to STK when no
# sec_type is supplied; futures Pine sends sec_type=FUT.
ALLOW_FUTURES = env_bool("ALLOW_FUTURES", False)
MAX_FUTURE_QTY = env_int("MAX_FUTURE_QTY", 1)
MAX_FUTURE_NOTIONAL = env_float("MAX_FUTURE_NOTIONAL", 0.0)
FUTURES_DEFAULT_EXCHANGE = os.getenv("FUTURES_DEFAULT_EXCHANGE", "CME").strip() or "CME"
FUTURES_DEFAULT_CURRENCY = os.getenv("FUTURES_DEFAULT_CURRENCY", "USD").strip() or "USD"

# Seconds to wait after placing an order so immediate IB rejections can be detected
# before forwarding the SETUP to Render / Telegram / Sheets.
ORDER_CONFIRM_DELAY = env_float("ORDER_CONFIRM_DELAY", 2.0)

# Extra wait used only when IB reports a real partial execution. This lets a
# market parent finish normally before the bridge cancels the remainder and
# repairs the target for the actual filled quantity.
PARTIAL_FILL_GRACE_SECONDS = env_float("PARTIAL_FILL_GRACE_SECONDS", 2.0)

# Execution-first confirmation monitors. Render does not publish OPEN/CLOSED
# until the bridge sends a callback after an actual IB/TWS fill.
ENABLE_EXECUTION_FILL_MONITOR = env_bool("ENABLE_EXECUTION_FILL_MONITOR", True)
ENTRY_FILL_MONITOR_SECONDS = env_float("ENTRY_FILL_MONITOR_SECONDS", 120.0)
ENTRY_FILL_MONITOR_POLL_SECONDS = env_float("ENTRY_FILL_MONITOR_POLL_SECONDS", 0.25)
CLOSE_FILL_MONITOR_SECONDS = env_float("CLOSE_FILL_MONITOR_SECONDS", 120.0)
CLOSE_FILL_MONITOR_POLL_SECONDS = env_float("CLOSE_FILL_MONITOR_POLL_SECONDS", 0.25)

# When a SETUP is blocked/rejected, send CANCEL to Render so stale Pending rows
# get removed instead of leaving fake pending setups.
FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL = env_bool(
    "FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL",
    True,
)

# Usually false: if IB says there is no matching position to close, do not forward
# a CLOSE_STOP/EOD_CLOSE to Render because it would create fake closed trades.
FORWARD_NO_POSITION_CLOSES_TO_RENDER = env_bool(
    "FORWARD_NO_POSITION_CLOSES_TO_RENDER",
    False,
)

# Prevent MARKET entries outside regular US stock hours. This avoids IB holding
# market orders for the next session and then letting fake Pending rows appear
# in Telegram / Sheets / dashboard.
BLOCK_MARKET_ENTRIES_OUTSIDE_RTH = env_bool(
    "BLOCK_MARKET_ENTRIES_OUTSIDE_RTH",
    True,
)

# Critical safety: never cancel a working target first and then discover that
# the close order cannot be sent because the stock market is already closed.
# This protects against naked overnight positions after a late EOD alert.
BLOCK_MARKET_CLOSES_OUTSIDE_RTH = env_bool(
    "BLOCK_MARKET_CLOSES_OUTSIDE_RTH",
    True,
)

# For 15-minute bars, the TradingView EOD signal should arrive on the candle
# that closes around 15:45 ET, not at 16:00 ET. This value is exposed for
# status/debugging; the hard execution block is still regular RTH.
EOD_CLOSE_SHOULD_BE_SENT_BEFORE = os.getenv("EOD_CLOSE_SHOULD_BE_SENT_BEFORE", "15:55").strip() or "15:55"

# Optional lightweight monitor for attached IB profit targets. TradingView does
# not know when an IB-attached target fills, so the bridge must report it to
# Render as TP. This monitor is runtime-only; if the bridge/TWS restarts during
# the day, use TWS as the source of truth and resync manually.
ENABLE_TARGET_FILL_MONITOR = env_bool("ENABLE_TARGET_FILL_MONITOR", False)
TARGET_MONITOR_SECONDS = env_float("TARGET_MONITOR_SECONDS", 23400.0)  # 6.5 hours
TARGET_MONITOR_POLL_SECONDS = env_float("TARGET_MONITOR_POLL_SECONDS", 1.0)

# Persistent safety layer for no-EOD target strategies.
# Attached GTC target orders can fill after a bridge restart. The in-memory
# monitor_target_fill task would be gone, so this loop uses the managed positions
# file to detect when a target-managed symbol becomes flat and reports TP to Render.
ENABLE_MANAGED_TARGET_RECONCILE = env_bool("ENABLE_MANAGED_TARGET_RECONCILE", True)
MANAGED_TARGET_RECONCILE_POLL_SECONDS = env_float("MANAGED_TARGET_RECONCILE_POLL_SECONDS", 5.0)

# Live quote push for dashboard. The bridge subscribes to TWS market data for
# currently managed/open stock positions and pushes a lightweight quote snapshot
# to Render/app.js. This is dashboard-only and does not place/cancel orders.
ENABLE_RENDER_QUOTE_PUSH = env_bool("ENABLE_RENDER_QUOTE_PUSH", False)
RENDER_QUOTE_URL = os.getenv("RENDER_QUOTE_URL", "").strip()
QUOTE_PUSH_POLL_SECONDS = env_float("QUOTE_PUSH_POLL_SECONDS", 5.0)
QUOTE_MARKET_DATA_TYPE = env_int("QUOTE_MARKET_DATA_TYPE", 1)  # 1=live, 3=delayed
QUOTE_ONLY_MANAGED_POSITIONS = env_bool("QUOTE_ONLY_MANAGED_POSITIONS", False)


# v4 safety cleanup:
# After a confirmed close, if IB position is flat, cancel leftover TVFVG_*_TP
# orders for that symbol so orphan targets cannot open a new position.
CANCEL_ORPHAN_TARGETS_AFTER_FLAT = env_bool("CANCEL_ORPHAN_TARGETS_AFTER_FLAT", True)

# After EOD closes, send a silent RECONCILE_FLAT event to Render/app.js.
# The matching app.js v4 patch removes any stale Open Positions rows for
# that symbol from Google Sheets/dashboard after IB confirms position is flat.
ENABLE_RENDER_FLAT_RECONCILE = env_bool("ENABLE_RENDER_FLAT_RECONCILE", True)

# Comma-separated events that should trigger silent flat reconciliation.
# Keep this EOD-focused by default to avoid clearing fresh reversal entries.
RECONCILE_FLAT_EVENTS = tuple(
    item.strip().upper()
    for item in os.getenv("RECONCILE_FLAT_EVENTS", "EOD_CLOSE,NEW_DAY_EMERGENCY_CLOSE").split(",")
    if item.strip()
)

RTH_TIMEZONE = os.getenv("RTH_TIMEZONE", "America/New_York").strip() or "America/New_York"
RTH_START = os.getenv("RTH_START", "09:30").strip() or "09:30"
RTH_END = os.getenv("RTH_END", "16:00").strip() or "16:00"


# v6 independent EOD safety layer.
# This runs from the local bridge clock, not from TradingView candle closes.
# It is designed for multi-timeframe alerts: 15m / 30m / 45m / 60m can all
# use the same Pine script while the bridge handles end-of-day execution safety.
MANAGED_POSITIONS_FILE = os.getenv("MANAGED_POSITIONS_FILE", "vixale_managed_positions.json").strip() or "vixale_managed_positions.json"
FORCE_EOD_FLATTEN_ENABLED = env_bool("FORCE_EOD_FLATTEN_ENABLED", True)
FORCE_EOD_FLATTEN_TIME = "15:59"
FORCE_EOD_FLATTEN_TIMEZONE = "America/New_York"
FORCE_EOD_WEEKDAYS_ONLY = env_bool("FORCE_EOD_WEEKDAYS_ONLY", True)
FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER = os.getenv("FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER", FORCE_EOD_FLATTEN_TIME).strip() or FORCE_EOD_FLATTEN_TIME
FORCE_EOD_SCHEDULER_POLL_SECONDS = env_float("FORCE_EOD_SCHEDULER_POLL_SECONDS", 5.0)
FORCE_EOD_CLOSE_ONLY_MANAGED = env_bool("FORCE_EOD_CLOSE_ONLY_MANAGED", True)
FORCE_EOD_STATE_FILE = os.getenv("FORCE_EOD_STATE_FILE", "vixale_shrek_eod_state.json").strip() or "vixale_shrek_eod_state.json"
FORCE_EOD_CANCEL_VERIFY_SECONDS = env_float("FORCE_EOD_CANCEL_VERIFY_SECONDS", 3.0)
FORCE_EOD_FILL_VERIFY_SECONDS = env_float("FORCE_EOD_FILL_VERIFY_SECONDS", 15.0)
FORCE_EOD_POSITION_VERIFY_SECONDS = env_float("FORCE_EOD_POSITION_VERIFY_SECONDS", 10.0)
FORCE_EOD_VERIFY_POLL_SECONDS = env_float("FORCE_EOD_VERIFY_POLL_SECONDS", 0.25)
SHREK_EOD_STRATEGY_IDS = {"SHREK", "SHREK_1_4"}

_last_force_eod_date = None
_force_eod_task = None
_target_reconcile_task = None
_quote_push_task = None
_quote_tickers: Dict[str, Any] = {}
_quote_contracts: Dict[str, Any] = {}
_execution_monitor_tasks = set()

# Prevent the in-memory target-fill monitor and the persistent managed-position
# reconcile loop from reporting the same attached target fill twice.
# The claim is runtime-only: if Render delivery fails, the claim is released and
# the managed-position file remains available for a later retry/restart.
_target_report_claims = set()
_target_report_claim_lock = asyncio.Lock()
_edge_stop_close_lock = asyncio.Lock()
logger = logging.getLogger("vixale.ib_bridge")


def spawn_execution_monitor(coro: Any) -> None:
    task = asyncio.create_task(coro)
    _execution_monitor_tasks.add(task)
    task.add_done_callback(_execution_monitor_tasks.discard)


app = FastAPI()
ib = IB()

# Important:
# IB API calls should not be hammered in parallel during EOD burst.
# This lock makes IB actions run one-by-one while TradingView gets fast 200 OK.
ib_lock = asyncio.Lock()



def managed_positions_path() -> str:
    if os.path.isabs(MANAGED_POSITIONS_FILE):
        return MANAGED_POSITIONS_FILE
    return os.path.join(os.getcwd(), MANAGED_POSITIONS_FILE)


def load_managed_positions() -> Dict[str, Any]:
    path = managed_positions_path()
    try:
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        print(f"[MANAGED LOAD ERROR] {exc}")
        return {}


def save_managed_positions(data: Dict[str, Any]) -> bool:
    path = managed_positions_path()
    try:
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
        os.replace(tmp_path, path)
        return True
    except Exception as exc:
        print(f"[MANAGED SAVE ERROR] {exc}")
        return False


def force_eod_state_path() -> str:
    if os.path.isabs(FORCE_EOD_STATE_FILE):
        return FORCE_EOD_STATE_FILE
    return os.path.join(os.getcwd(), FORCE_EOD_STATE_FILE)


def load_force_eod_state() -> Dict[str, Any]:
    path = force_eod_state_path()
    try:
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.critical("[SHREK EOD STATE LOAD ERROR] %s", exc)
        return {}


def save_force_eod_state(data: Dict[str, Any]) -> None:
    path = force_eod_state_path()
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def managed_strategy_id(row: Dict[str, Any]) -> str:
    payload = row.get("last_payload") if isinstance(row.get("last_payload"), dict) else {}
    return str(row.get("strategy") or payload.get("strategy") or "").strip().upper()


def managed_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(row.get("last_payload") or {}) if isinstance(row, dict) else {}
    if isinstance(row, dict):
        for key in ("system_id", "strategy", "variant", "profile", "setup_id"):
            if row.get(key) not in (None, ""):
                payload[key] = row.get(key)
    return payload


def is_vixale_edge_managed_position(row: Dict[str, Any]) -> bool:
    return is_vixale_edge_payload(managed_payload(row))


def is_shrek_managed_position(row: Dict[str, Any]) -> bool:
    return managed_strategy_id(row) in SHREK_EOD_STRATEGY_IDS


def shrek_eod_idempotency_key(day_key: str, symbol: str, strategy: str) -> str:
    return f"{day_key}:{str(symbol).upper().strip()}:{str(strategy).upper().strip()}"


def mark_managed_position(data: Dict[str, Any], ib_result: Dict[str, Any]) -> None:
    symbol = str(data.get("symbol", "")).upper().strip()
    if not symbol:
        return

    managed = load_managed_positions()
    existing = dict(managed.get(symbol) or {})
    fill_price = to_float(ib_result.get("entry_fill_price")) or to_float(data.get("entry")) or to_float(data.get("price"))
    qty = (
        to_int_qty(ib_result.get("target_position_qty"))
        or to_int_qty(ib_result.get("desired_qty"))
        or to_int_qty(ib_result.get("qty"))
        or to_int_qty(data.get("qty"))
        or to_int_qty(ib_result.get("entry_filled_qty"))
    )

    now_iso = datetime.now(ZoneInfo(FORCE_EOD_FLATTEN_TIMEZONE)).isoformat()
    target_qty = (
        to_int_qty(ib_result.get("target_order_qty"))
        or to_int_qty(ib_result.get("target_position_qty"))
        or qty
    )
    entry_order = {
        "order_id": ib_result.get("order_id", existing.get("ib_order_id", "")),
        "perm_id": ib_result.get("order_perm_id", ""),
        "order_ref": ib_result.get("order_ref", ""),
        "filled_qty": to_float(ib_result.get("entry_filled_qty")),
        "fill_price": round_price(fill_price) if fill_price > 0 else "",
        "latest_status": ib_result.get("entry_status", ""),
        "filled_at": now_iso,
    }
    target_order = {
        "order_id": ib_result.get("target_order_id", existing.get("ib_target_order_id", "")),
        "perm_id": ib_result.get("target_perm_id", ""),
        "order_ref": ib_result.get("target_order_ref", target_order_ref(symbol, str(data.get("side", "")))),
        "price": to_float(ib_result.get("target_price")) or to_float(data.get("target")),
        "tif": str(ib_result.get("target_tif") or target_order_tif(data)),
        "expected_qty": target_qty,
        "latest_status": ib_result.get("target_status", ""),
        "updated_at": now_iso,
    }

    managed[symbol] = {
        **existing,
        "symbol": symbol,
        "sec_type": normalize_sec_type(data),
        "side": str(data.get("side", "")).upper().strip(),
        "qty": qty,
        "entry": round_price(fill_price) if fill_price > 0 else to_float(data.get("entry")),
        "target": to_float(data.get("target")),
        "stop": to_float(data.get("stop")),
        "profile": str(data.get("profile") or data.get("alert_profile") or ""),
        "timeframe": str(data.get("timeframe") or data.get("tf") or ""),
        "strategy": str(data.get("strategy") or ""),
        "system_id": str(data.get("system_id") or ""),
        "variant": str(data.get("variant") or ""),
        "setup_id": str(data.get("setup_id") or ""),
        "exchange": contract_exchange_from_data(data),
        "currency": contract_currency_from_data(data),
        "contract_month": contract_month_from_data(data),
        "local_symbol": str(data.get("local_symbol") or data.get("localSymbol") or ""),
        "last_payload": dict(data),
        "ib_order_id": ib_result.get("order_id", ""),
        "ib_target_order_id": ib_result.get("target_order_id", ""),
        "entry_order": entry_order,
        "target_order": target_order,
        "entry_submission_state": "FILLED",
        "created_at": existing.get("created_at") or now_iso,
        "entry_filled_at": now_iso,
        "updated_at": now_iso,
    }

    save_managed_positions(managed)
    print(f"[MANAGED MARK] symbol={symbol} side={managed[symbol].get('side')} qty={qty}")


def mark_edge_entry_submission(data: Dict[str, Any], ib_result: Dict[str, Any]) -> bool:
    """Persist an Edge order identity before awaiting broker publication."""
    if not is_vixale_edge_payload(data):
        return True

    symbol = str(data.get("symbol") or "").upper().strip()
    setup_id = str(data.get("setup_id") or "").strip()
    if not symbol or not setup_id:
        return False

    managed = load_managed_positions()
    existing = dict(managed.get(symbol) or {})
    now_iso = datetime.now(ZoneInfo(FORCE_EOD_FLATTEN_TIMEZONE)).isoformat()
    qty = to_int_qty(data.get("qty"))
    target_qty = to_int_qty(ib_result.get("target_order_qty")) or qty
    managed[symbol] = {
        **existing,
        "symbol": symbol,
        "sec_type": normalize_sec_type(data),
        "side": str(data.get("side") or "").upper().strip(),
        "qty": qty,
        "entry": to_float(data.get("entry")) or to_float(data.get("price")),
        "target": to_float(data.get("target")),
        "stop": to_float(data.get("stop")),
        "profile": str(data.get("profile") or data.get("alert_profile") or ""),
        "timeframe": str(data.get("timeframe") or data.get("tf") or ""),
        "strategy": str(data.get("strategy") or ""),
        "system_id": str(data.get("system_id") or ""),
        "variant": str(data.get("variant") or ""),
        "setup_id": setup_id,
        "exchange": contract_exchange_from_data(data),
        "currency": contract_currency_from_data(data),
        "last_payload": dict(data),
        "ib_order_id": ib_result.get("order_id", ""),
        "ib_target_order_id": ib_result.get("target_order_id", ""),
        "entry_order": {
            "order_id": ib_result.get("order_id", ""),
            "perm_id": ib_result.get("order_perm_id", ""),
            "order_ref": ib_result.get("order_ref", ""),
            "filled_qty": to_float(ib_result.get("entry_filled_qty")),
            "fill_price": to_float(ib_result.get("entry_fill_price")),
            "latest_status": ib_result.get("entry_status", ""),
            "submitted_at": now_iso,
        },
        "target_order": {
            "order_id": ib_result.get("target_order_id", ""),
            "perm_id": ib_result.get("target_perm_id", ""),
            "order_ref": ib_result.get("target_order_ref", target_order_ref(symbol, str(data.get("side", "")))),
            "price": to_float(ib_result.get("target_price")) or to_float(data.get("target")),
            "tif": str(ib_result.get("target_tif") or target_order_tif(data)),
            "expected_qty": target_qty,
            "latest_status": ib_result.get("target_status", ""),
            "submitted_at": now_iso,
        },
        "entry_submission_state": (
            "FILLED"
            if ib_result.get("entry_filled")
            else str(ib_result.get("entry_submission_state") or "SUBMITTED").upper()
        ),
        "created_at": existing.get("created_at") or now_iso,
        "entry_submitted_at": existing.get("entry_submitted_at") or now_iso,
        "updated_at": now_iso,
    }
    return save_managed_positions(managed)


def clear_edge_submission_if_unfilled(symbol: str, setup_id: str) -> None:
    managed = load_managed_positions()
    row = dict(managed.get(str(symbol or "").upper().strip()) or {})
    if (
        row
        and is_vixale_edge_managed_position(row)
        and str(row.get("setup_id") or "") == str(setup_id or "")
        and str(row.get("entry_submission_state") or "").upper() != "FILLED"
    ):
        managed.pop(str(symbol or "").upper().strip(), None)
        save_managed_positions(managed)


def mark_managed_bridge_close(
    data: Dict[str, Any],
    ib_result: Dict[str, Any],
) -> bool:
    if not is_vixale_edge_payload(data):
        return True

    symbol = str(data.get("symbol") or "").upper().strip()
    managed = load_managed_positions()
    row = dict(managed.get(symbol) or {})
    if not row:
        return False

    setup_id = str(data.get("setup_id") or "").strip()
    managed_setup_id = str(row.get("setup_id") or "").strip()
    if is_edge_v2_stop_close(data) and setup_id != managed_setup_id:
        return False

    now_iso = datetime.now(ZoneInfo(FORCE_EOD_FLATTEN_TIMEZONE)).isoformat()
    existing_close = row.get("bridge_close_order") if isinstance(row.get("bridge_close_order"), dict) else {}
    row["bridge_close_order"] = {
        "order_id": ib_result.get("order_id") or existing_close.get("order_id", ""),
        "perm_id": ib_result.get("order_perm_id") or existing_close.get("perm_id", ""),
        "order_ref": ib_result.get("order_ref") or existing_close.get("order_ref", ""),
        "bridge_status": ib_result.get("status") or existing_close.get("bridge_status", ""),
        "latest_status": ib_result.get("close_status") or existing_close.get("latest_status", ""),
        "filled_qty": (
            to_float(ib_result.get("close_filled_qty"))
            or to_float(existing_close.get("filled_qty"))
        ),
        "fill_price": (
            to_float(ib_result.get("close_fill_price"))
            or to_float(existing_close.get("fill_price"))
        ),
        "exec_ids": list(
            ib_result.get("close_exec_ids")
            or existing_close.get("exec_ids")
            or []
        ),
        "broker_confirmed_flat": bool(
            ib_result.get("broker_confirmed_flat")
            or existing_close.get("broker_confirmed_flat")
        ),
        "position_after_close": (
            ib_result.get("position_after_close")
            if ib_result.get("position_after_close") not in (None, "")
            else existing_close.get("position_after_close", "")
        ),
        "submitted_at": existing_close.get("submitted_at") or now_iso,
        "filled_at": (
            now_iso
            if ib_result.get("close_filled")
            else existing_close.get("filled_at", "")
        ),
    }

    reservation = (
        dict(row.get("close_reservation"))
        if isinstance(row.get("close_reservation"), dict)
        else {}
    )
    if reservation:
        if ib_result.get("broker_confirmed_flat"):
            reservation_state = "CALLBACK_PENDING"
        elif ib_result.get("close_filled"):
            reservation_state = "FILLED_POSITION_NOT_FLAT"
        elif ib_result.get("order_id") or ib_result.get("order_ref"):
            reservation_state = "CLOSE_SUBMITTED"
        else:
            reservation_state = reservation.get("state") or "RESERVED"
        reservation.update({
            "state": reservation_state,
            "order_id": row["bridge_close_order"]["order_id"],
            "perm_id": row["bridge_close_order"]["perm_id"],
            "order_ref": row["bridge_close_order"]["order_ref"],
            "latest_status": row["bridge_close_order"]["latest_status"],
            "filled_qty": row["bridge_close_order"]["filled_qty"],
            "fill_price": row["bridge_close_order"]["fill_price"],
            "exec_ids": row["bridge_close_order"]["exec_ids"],
            "broker_confirmed_flat": row["bridge_close_order"]["broker_confirmed_flat"],
            "position_after_close": row["bridge_close_order"]["position_after_close"],
            "updated_at": now_iso,
        })
        row["close_reservation"] = reservation

    row["updated_at"] = now_iso
    managed[symbol] = row
    return save_managed_positions(managed)


def is_edge_v2_stop_close(data: Dict[str, Any]) -> bool:
    return (
        is_edge_stop_close(data)
        and str(data.get("payload_version") or "").strip() == "2"
        and bool(str(data.get("setup_id") or "").strip())
    )


def edge_stop_close_reservation_id(setup_id: str) -> str:
    return f"{str(setup_id or '').strip()}:CLOSE_STOP"


def edge_stop_close_order_ref(symbol: str, setup_id: str) -> str:
    digest = hashlib.sha256(
        str(setup_id or "").strip().encode("utf-8")
    ).hexdigest()[:10].upper()
    return f"TVFVG_CLOSE_{str(symbol or '').upper().strip()}_{digest}"


def reserve_edge_stop_close(data: Dict[str, Any]) -> Dict[str, Any]:
    symbol = str(data.get("symbol") or "").upper().strip()
    setup_id = str(data.get("setup_id") or "").strip()
    managed = load_managed_positions()
    row = dict(managed.get(symbol) or {})
    managed_setup_id = str(row.get("setup_id") or "").strip()

    if (
        not row
        or not is_vixale_edge_managed_position(row)
        or setup_id != managed_setup_id
    ):
        return {
            "ok": False,
            "status": "EDGE_STOP_SETUP_MISMATCH",
            "symbol": symbol,
            "setup_id": setup_id,
            "managed_setup_id": managed_setup_id,
        }

    reservation_id = edge_stop_close_reservation_id(setup_id)
    existing = (
        dict(row.get("close_reservation"))
        if isinstance(row.get("close_reservation"), dict)
        else {}
    )
    if existing:
        if str(existing.get("reservation_id") or "") != reservation_id:
            return {
                "ok": False,
                "status": "EDGE_STOP_SETUP_MISMATCH",
                "symbol": symbol,
                "setup_id": setup_id,
                "managed_setup_id": managed_setup_id,
            }
        return {
            "ok": True,
            "status": "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
            "symbol": symbol,
            "setup_id": setup_id,
            "row": row,
            "reservation": existing,
            "existing": True,
        }

    now_iso = now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE).isoformat()
    reservation = {
        "reservation_id": reservation_id,
        "setup_id": setup_id,
        "event": "CLOSE_STOP",
        "state": "RESERVED",
        "order_ref": edge_stop_close_order_ref(symbol, setup_id),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    row["close_reservation"] = reservation
    row["updated_at"] = now_iso
    managed[symbol] = row
    if not save_managed_positions(managed):
        return {
            "ok": False,
            "status": "EDGE_STOP_STATE_PERSISTENCE_FAILED",
            "symbol": symbol,
            "setup_id": setup_id,
        }

    return {
        "ok": True,
        "status": "RESERVED",
        "symbol": symbol,
        "setup_id": setup_id,
        "row": row,
        "reservation": reservation,
        "existing": False,
    }


def update_edge_stop_close_reservation(
    data: Dict[str, Any],
    state: str,
    **updates: Any,
) -> bool:
    symbol = str(data.get("symbol") or "").upper().strip()
    setup_id = str(data.get("setup_id") or "").strip()
    managed = load_managed_positions()
    row = dict(managed.get(symbol) or {})
    if str(row.get("setup_id") or "").strip() != setup_id:
        return False

    reservation = (
        dict(row.get("close_reservation"))
        if isinstance(row.get("close_reservation"), dict)
        else {}
    )
    if (
        str(reservation.get("reservation_id") or "")
        != edge_stop_close_reservation_id(setup_id)
    ):
        return False

    reservation.update(updates)
    reservation["state"] = state
    reservation["updated_at"] = now_in_tz(
        FORCE_EOD_FLATTEN_TIMEZONE
    ).isoformat()
    row["close_reservation"] = reservation
    row["updated_at"] = reservation["updated_at"]
    managed[symbol] = row
    return save_managed_positions(managed)


def clear_managed_position(symbol: str) -> None:
    symbol = str(symbol or "").upper().strip()
    if not symbol:
        return

    managed = load_managed_positions()
    if symbol in managed:
        managed.pop(symbol, None)
        save_managed_positions(managed)
        print(f"[MANAGED CLEAR] symbol={symbol}")


async def claim_target_report(symbol: str) -> bool:
    clean_symbol = str(symbol or "").upper().strip()
    if not clean_symbol:
        return False

    async with _target_report_claim_lock:
        if clean_symbol in _target_report_claims:
            return False
        _target_report_claims.add(clean_symbol)
        return True


async def release_target_report_claim(symbol: str) -> None:
    clean_symbol = str(symbol or "").upper().strip()
    if not clean_symbol:
        return

    async with _target_report_claim_lock:
        _target_report_claims.discard(clean_symbol)


def render_delivery_succeeded(result: Dict[str, Any]) -> bool:
    if not isinstance(result, dict) or not result.get("forwarded"):
        return False

    try:
        status_code = int(result.get("status_code", 0) or 0)
    except Exception:
        return False

    return 200 <= status_code < 300


TARGET_PRICE_KEYS = (
    "target",
    "tp",
    "take_profit",
    "takeProfit",
    "profit_target",
    "target_price",
    "tp_price",
)

TARGET_OFFSET_KEYS = (
    "target_offset",
    "target_distance",
    "tp_offset",
    "tp_distance",
    "profit_offset",
    "profit_distance",
)


SETUP_ACCEPTED_STATUSES = {
    "submitted_with_attached_target",
    "submitted_with_repaired_target",
    "submitted_without_target_missing_target_price",
    "dry_run_entry_order",
    "already_at_target_position",
    "submitted_awaiting_entry_fill",
}

CLOSE_ACCEPTED_STATUSES = {
    "submitted",
    "dry_run_close_order",
}

ORDER_BAD_STATUSES = {
    "cancelled",
    "canceled",
    "apicancelled",
    "inactive",
}

ORDER_REJECTION_WORDS = (
    "rejected",
    "not accepted",
    "insufficient",
    "margin",
    "parentcancel",
    "exchange is closed",
    "order was discarded",
    "not be placed at the exchange until",
    "held until",
    "outside regular trading hours",
)

# IB/ib_async can temporarily report ValidationError with Warning 399 while the
# order is still active and already partially filled. These phrases alone must
# never trigger bracket cancellation.
ORDER_NON_FATAL_WARNING_WORDS = (
    "warning 399",
    "repriced so as not to cross a related resting order",
)


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(str(value).replace(",", "").replace("$", "").strip())
    except Exception:
        return default


def to_int_qty(value: Any) -> int:
    try:
        qty = int(float(str(value).replace(",", "").strip()))
        return max(qty, 0)
    except Exception:
        return 0


def round_price(price: float) -> float:
    return round(float(price), PRICE_DECIMALS)


def first_positive_float(data: Dict[str, Any], keys: Tuple[str, ...]) -> float:
    for key in keys:
        value = to_float(data.get(key))
        if value > 0:
            return value
    return 0.0


def extract_target_price(data: Dict[str, Any], side: str, entry: float) -> float:
    """
    Returns a final target LIMIT price.

    Preferred payload is an explicit target price, for example:
      {"target": 88.25}
      {"tp": 88.25}
      {"target_price": 88.25}

    Fallback payload can be a distance/offset from entry, for example:
      {"target_distance": 1.00}

    LONG:  target = entry + distance
    SHORT: target = entry - distance
    """
    explicit_target = first_positive_float(data, TARGET_PRICE_KEYS)
    if explicit_target > 0:
        return round_price(explicit_target)

    target_offset = first_positive_float(data, TARGET_OFFSET_KEYS)
    if target_offset > 0:
        if side == "LONG":
            return round_price(entry + target_offset)
        if side == "SHORT":
            return round_price(entry - target_offset)

    return 0.0


def validate_target_price(side: str, entry: float, target_price: float) -> None:
    if target_price <= 0:
        return

    if side == "LONG" and target_price <= entry:
        raise ValueError(
            f"Invalid LONG target price: target {target_price} must be above entry {entry}"
        )

    if side == "SHORT" and target_price >= entry:
        raise ValueError(
            f"Invalid SHORT target price: target {target_price} must be below entry {entry}"
        )


def valid_edge_target(side: str, entry: float, target_price: float) -> bool:
    if not math.isfinite(target_price) or target_price <= 0:
        return False
    if side == "LONG":
        return target_price > entry
    if side == "SHORT":
        return target_price < entry
    return False


def edge_target_required_result(
    data: Dict[str, Any],
    symbol: str,
    side: str,
    entry: float,
    target_price: float,
) -> Dict[str, Any]:
    return {
        "dry_run": DRY_RUN,
        "status": "edge_target_required",
        "symbol": symbol,
        "side": side,
        "setup_id": str(data.get("setup_id") or ""),
        "entry_reference_price": entry,
        "target_price": target_price if math.isfinite(target_price) else None,
        "target_tif": "GTC",
        "canceled_replaced_orders": 0,
        "cancel_scope": "PENDING_ONLY",
        "cancel_reason": "EDGE_TARGET_REQUIRED",
        "message": "Vixale Edge requires a finite target on the profitable side of entry; no broker order submitted.",
    }


def get_entry_order_type(data: Dict[str, Any]) -> str:
    raw = str(
        data.get("entry_order_type")
        or data.get("order_type")
        or ENTRY_ORDER_TYPE_DEFAULT
        or "LIMIT"
    ).strip().upper()

    if raw in ("MKT", "MARKET"):
        return "MARKET"

    return "LIMIT"


def normalize_sec_type(data: Dict[str, Any]) -> str:
    raw = str(
        data.get("sec_type")
        or data.get("sectype")
        or data.get("asset_class")
        or data.get("assetClass")
        or "STK"
    ).strip().upper()

    if raw in ("FUT", "FUTURE", "FUTURES"):
        return "FUT"

    return "STK"


def is_futures_payload(data: Dict[str, Any]) -> bool:
    return normalize_sec_type(data) == "FUT"


def safe_upper(value: Any) -> str:
    return str(value or "").strip().upper()


def contract_exchange_from_data(data: Dict[str, Any]) -> str:
    sec_type = normalize_sec_type(data)
    default_exchange = FUTURES_DEFAULT_EXCHANGE if sec_type == "FUT" else "SMART"
    return str(data.get("exchange") or data.get("primary_exchange") or data.get("primaryExchange") or default_exchange).strip().upper()


def contract_currency_from_data(data: Dict[str, Any]) -> str:
    sec_type = normalize_sec_type(data)
    default_currency = FUTURES_DEFAULT_CURRENCY if sec_type == "FUT" else "USD"
    return str(data.get("currency") or default_currency).strip().upper()


def contract_month_from_data(data: Dict[str, Any]) -> str:
    return str(
        data.get("lastTradeDateOrContractMonth")
        or data.get("last_trade_date_or_contract_month")
        or data.get("contract_month")
        or data.get("expiry")
        or ""
    ).strip()



def parse_hhmm(value: str, fallback_hour: int, fallback_minute: int) -> time:
    try:
        hour_text, minute_text = str(value).split(":", 1)
        return time(int(hour_text), int(minute_text))
    except Exception:
        return time(fallback_hour, fallback_minute)




def now_in_tz(tz_name: str) -> datetime:
    try:
        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        return datetime.now()


def is_weekday(dt: datetime) -> bool:
    return dt.weekday() < 5


def is_after_hhmm_now(value: str, tz_name: str) -> bool:
    now = now_in_tz(tz_name)
    if FORCE_EOD_WEEKDAYS_ONLY and not is_weekday(now):
        return False
    current = now.time().replace(tzinfo=None)
    return current >= parse_hhmm(value, 15, 55)


def should_block_new_stock_entry_after_force_eod() -> bool:
    if not FORCE_EOD_FLATTEN_ENABLED:
        return False
    return is_after_hhmm_now(FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER, FORCE_EOD_FLATTEN_TIMEZONE)

def is_us_stock_rth_now() -> bool:
    try:
        tz = ZoneInfo(RTH_TIMEZONE)
        now = datetime.now(tz)
    except Exception:
        now = datetime.now()

    # Monday=0, Sunday=6. Stocks are regular-session only Monday-Friday.
    if now.weekday() >= 5:
        return False

    start = parse_hhmm(RTH_START, 9, 30)
    end = parse_hhmm(RTH_END, 16, 0)
    current = now.time().replace(tzinfo=None)

    return start <= current < end


def validate_entry_timing(entry_order_type: str, sec_type: str) -> None:
    if sec_type == "STK" and should_block_new_stock_entry_after_force_eod():
        raise ValueError(
            f"Stock entry blocked after bridge force-EOD cutoff ({FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER} {FORCE_EOD_FLATTEN_TIMEZONE})."
        )

    # Stock market orders are blocked outside stock RTH. Futures do not use this
    # stock-only guard because they have different trading hours. Use the futures
    # Pine session filter to control when futures signals are allowed.
    if (
        sec_type == "STK"
        and entry_order_type == "MARKET"
        and BLOCK_MARKET_ENTRIES_OUTSIDE_RTH
        and not is_us_stock_rth_now()
    ):
        raise ValueError(
            f"Market entry blocked outside regular stock hours ({RTH_START}-{RTH_END} {RTH_TIMEZONE}). "
            "This prevents IB from holding market orders for the next session."
        )


def validate_pretrade_risk(symbol: str, side: str, entry: float, qty: int, sec_type: str) -> None:
    if side == "SHORT" and not ALLOW_SHORTS:
        raise ValueError(f"Short orders are blocked by ALLOW_SHORTS=false: {symbol}")

    if sec_type == "FUT":
        if not ALLOW_FUTURES:
            raise ValueError(f"Futures orders are blocked by ALLOW_FUTURES=false: {symbol}")

        if MAX_FUTURE_QTY > 0 and qty > MAX_FUTURE_QTY:
            raise ValueError(
                f"Futures order blocked by MAX_FUTURE_QTY: {symbol} qty {qty} exceeds limit {MAX_FUTURE_QTY}"
            )

        futures_notional = entry * qty
        if MAX_FUTURE_NOTIONAL > 0 and futures_notional > MAX_FUTURE_NOTIONAL:
            raise ValueError(
                f"Futures order blocked by MAX_FUTURE_NOTIONAL: {symbol} notional ${futures_notional:,.2f} exceeds limit ${MAX_FUTURE_NOTIONAL:,.2f}"
            )
        return

    if MAX_SHARE_QTY > 0 and qty > MAX_SHARE_QTY:
        raise ValueError(
            f"Order blocked by MAX_SHARE_QTY: {symbol} qty {qty} exceeds limit {MAX_SHARE_QTY}"
        )

    notional = entry * qty
    if MAX_ORDER_NOTIONAL > 0 and notional > MAX_ORDER_NOTIONAL:
        raise ValueError(
            f"Order blocked by MAX_ORDER_NOTIONAL: {symbol} notional ${notional:,.2f} exceeds limit ${MAX_ORDER_NOTIONAL:,.2f}"
        )


async def ensure_ib_connected() -> None:
    if ib.isConnected():
        return

    await ib.connectAsync(
        host=IB_HOST,
        port=IB_PORT,
        clientId=IB_CLIENT_ID,
        timeout=10,
    )


def stock_contract(symbol: str, data: Optional[Dict[str, Any]] = None) -> Stock:
    data = data or {}
    exchange = contract_exchange_from_data(data) if data else "SMART"
    currency = contract_currency_from_data(data) if data else "USD"
    return Stock(symbol, exchange, currency)


def futures_contract(symbol: str, data: Dict[str, Any]) -> Future:
    month = contract_month_from_data(data)
    exchange = contract_exchange_from_data(data)
    currency = contract_currency_from_data(data)
    local_symbol = str(data.get("local_symbol") or data.get("localSymbol") or "").strip()
    multiplier = str(data.get("multiplier") or "").strip()
    trading_class = str(data.get("trading_class") or data.get("tradingClass") or symbol).strip().upper()

    if not month and not local_symbol:
        raise RuntimeError(
            f"Missing futures contract month for {symbol}. Send lastTradeDateOrContractMonth / contract_month, for example 202609."
        )

    contract = Future(
        symbol=symbol,
        lastTradeDateOrContractMonth=month,
        exchange=exchange,
        currency=currency,
    )

    # Optional disambiguation fields. These are useful when IB needs an exact
    # contract match, but should normally be blank for MES/MNQ/ES/NQ front-month
    # testing unless TWS asks for them.
    if local_symbol:
        contract.localSymbol = local_symbol
    if multiplier:
        contract.multiplier = multiplier
    if trading_class:
        contract.tradingClass = trading_class

    return contract


async def qualify_contract(data: Dict[str, Any]) -> Any:
    sec_type = normalize_sec_type(data)
    symbol = str(data.get("symbol", "")).upper().strip()

    if not symbol:
        raise RuntimeError("Missing symbol for contract qualification")

    if sec_type == "FUT":
        contract = futures_contract(symbol, data)
    else:
        contract = stock_contract(symbol, data)

    qualified = await ib.qualifyContractsAsync(contract)

    if not qualified:
        raise RuntimeError(f"Could not qualify {sec_type} contract: {symbol}")

    return qualified[0]


# Backwards-compatible stock-only helper name.
async def qualify_stock(symbol: str) -> Stock:
    contract = stock_contract(symbol)
    qualified = await ib.qualifyContractsAsync(contract)

    if not qualified:
        raise RuntimeError(f"Could not qualify stock contract: {symbol}")

    return qualified[0]


def order_ref(symbol: str, side: str) -> str:
    return f"TVFVG_{symbol}_{side}".upper()


def target_order_ref(symbol: str, side: str) -> str:
    return f"{order_ref(symbol, side)}_TP"


async def cancel_open_orders_for_symbol(symbol: str, side: Optional[str] = None) -> int:
    await ensure_ib_connected()

    symbol = symbol.upper()
    side = side.upper() if side else ""

    canceled = 0

    for trade in ib.openTrades():
        contract = trade.contract
        order = trade.order

        contract_symbol = getattr(contract, "symbol", "").upper()
        ref = str(getattr(order, "orderRef", "") or "").upper()

        if contract_symbol != symbol:
            continue

        if side and side not in ref:
            continue

        ib.cancelOrder(order)
        canceled += 1

    if canceled > 0:
        await asyncio.sleep(0.25)

    return canceled


def is_tvfvg_target_trade_for_symbol(trade: Any, symbol: str) -> bool:
    symbol = symbol.upper().strip()
    contract = getattr(trade, "contract", None)
    order = getattr(trade, "order", None)

    contract_symbol = str(getattr(contract, "symbol", "") or "").upper()
    ref = str(getattr(order, "orderRef", "") or "").upper()

    return (
        contract_symbol == symbol
        and ref.startswith(f"TVFVG_{symbol}_")
        and ref.endswith("_TP")
    )


async def cancel_target_orders_for_symbol(symbol: str) -> int:
    """Cancel all remaining TVFVG target orders for this symbol only."""
    await ensure_ib_connected()

    symbol = symbol.upper().strip()
    canceled = 0

    for trade in ib.openTrades():
        if not is_tvfvg_target_trade_for_symbol(trade, symbol):
            continue

        ib.cancelOrder(trade.order)
        canceled += 1

    if canceled > 0:
        await asyncio.sleep(0.25)

    return canceled


def active_target_trades_for_symbol(symbol: str) -> List[Any]:
    return [
        trade for trade in ib.openTrades()
        if is_tvfvg_target_trade_for_symbol(trade, symbol)
        and trade_status(trade).lower() not in ORDER_BAD_STATUSES
        and not trade_is_filled(trade)
    ]


async def cancel_and_verify_targets_for_shrek_eod(symbol: str) -> Dict[str, Any]:
    canceled = await cancel_target_orders_for_symbol(symbol)
    poll = max(FORCE_EOD_VERIFY_POLL_SECONDS, 0.10)
    waited = 0.0

    while waited <= max(FORCE_EOD_CANCEL_VERIFY_SECONDS, poll):
        position_size = await get_position_size(symbol)
        if abs(position_size) <= 0.000001:
            return {
                "ok": True,
                "status": "position_flat_during_target_cancel",
                "canceled_targets": canceled,
                "position": position_size,
            }

        active = active_target_trades_for_symbol(symbol)
        if not active:
            return {
                "ok": True,
                "status": "targets_canceled",
                "canceled_targets": canceled,
                "position": position_size,
            }

        await asyncio.sleep(poll)
        waited += poll

    return {
        "ok": False,
        "status": "target_cancel_unconfirmed",
        "canceled_targets": canceled,
        "position": await get_position_size(symbol),
        "active_target_order_ids": [trade_order_id(trade) for trade in active_target_trades_for_symbol(symbol)],
    }


async def cleanup_orphan_targets_if_flat(symbol: str) -> Dict[str, Any]:
    """
    If IB says the symbol is flat, remove leftover attached target orders.
    This protects against: position closed -> TP order still working -> TP later
    opens an unintended opposite position.
    """
    await ensure_ib_connected()

    symbol = symbol.upper().strip()
    position_after = await get_position_size(symbol)

    if abs(position_after) > 0.000001:
        return {
            "position_after_close": position_after,
            "orphan_target_cleanup_checked": True,
            "canceled_orphan_targets": 0,
            "orphan_target_cleanup_reason": "position_not_flat",
        }

    canceled = await cancel_target_orders_for_symbol(symbol)

    return {
        "position_after_close": position_after,
        "orphan_target_cleanup_checked": True,
        "canceled_orphan_targets": canceled,
        "orphan_target_cleanup_reason": "flat_position",
    }


async def cancel_all_orphan_target_orders() -> Dict[str, Any]:
    """Manual safety endpoint helper: cancel TVFVG_*_TP orders with no IB position."""
    await ensure_ib_connected()

    symbols = sorted({
        str(getattr(trade.contract, "symbol", "") or "").upper()
        for trade in ib.openTrades()
        if str(getattr(getattr(trade, "order", None), "orderRef", "") or "").upper().startswith("TVFVG_")
        and str(getattr(getattr(trade, "order", None), "orderRef", "") or "").upper().endswith("_TP")
    })

    details = []
    total_canceled = 0

    for symbol in symbols:
        result = await cleanup_orphan_targets_if_flat(symbol)
        details.append({"symbol": symbol, **result})
        total_canceled += int(result.get("canceled_orphan_targets", 0) or 0)

    return {
        "ok": True,
        "symbols_checked": len(symbols),
        "canceled_orphan_targets": total_canceled,
        "details": details,
    }


async def get_position_size(symbol: str) -> float:
    await ensure_ib_connected()

    symbol = symbol.upper()

    for pos in ib.positions():
        contract_symbol = getattr(pos.contract, "symbol", "").upper()
        if contract_symbol == symbol:
            return float(pos.position)

    return 0.0


def desired_signed_position(side: str, qty: int) -> int:
    side = str(side or "").upper().strip()
    qty = int(qty or 0)

    if side == "LONG":
        return qty

    if side == "SHORT":
        return -qty

    return 0


def opposite_flip_delta_order(side: str, desired_qty: int, current_position: float) -> Tuple[str, int, int, int]:
    """Return the one market order needed to reach the desired final position.

    Example:
      current +408 LONG, new desired SHORT 409
      desired signed position = -409
      delta = -409 - 408 = -817
      order = SELL 817
      final broker position should become SHORT 409

    This protects live execution when the CLOSE alert is skipped, delayed, or arrives
    after the SETUP alert during a same-bar TradingView reversal.
    """

    desired_position = desired_signed_position(side, desired_qty)
    current_position_int = int(round(float(current_position or 0.0)))
    delta = int(desired_position - current_position_int)

    if delta > 0:
        return "BUY", abs(delta), desired_position, current_position_int

    if delta < 0:
        return "SELL", abs(delta), desired_position, current_position_int

    return "", 0, desired_position, current_position_int


def trade_order_id(trade: Any) -> Any:
    return getattr(getattr(trade, "order", None), "orderId", None)


def trade_perm_id(trade: Any) -> Any:
    order = getattr(trade, "order", None)
    return (
        getattr(order, "permId", None)
        or getattr(getattr(trade, "orderStatus", None), "permId", None)
    )


def trade_order_ref_value(trade: Any) -> str:
    return str(getattr(getattr(trade, "order", None), "orderRef", "") or "")


def trade_action(trade: Any) -> str:
    return str(getattr(getattr(trade, "order", None), "action", "") or "").upper().strip()


def trade_status(trade: Any) -> str:
    return str(getattr(getattr(trade, "orderStatus", None), "status", "") or "")


def trade_filled_qty(trade: Any) -> float:
    try:
        return float(getattr(getattr(trade, "orderStatus", None), "filled", 0.0) or 0.0)
    except Exception:
        return 0.0


def trade_avg_fill_price(trade: Any) -> float:
    try:
        return float(getattr(getattr(trade, "orderStatus", None), "avgFillPrice", 0.0) or 0.0)
    except Exception:
        return 0.0


def trade_last_fill_price(trade: Any) -> float:
    try:
        return float(getattr(getattr(trade, "orderStatus", None), "lastFillPrice", 0.0) or 0.0)
    except Exception:
        return 0.0


def trade_fill_price(trade: Any, fallback: float = 0.0) -> float:
    avg_price = trade_avg_fill_price(trade)
    if avg_price > 0:
        return round_price(avg_price)

    last_price = trade_last_fill_price(trade)
    if last_price > 0:
        return round_price(last_price)

    return round_price(fallback) if fallback else 0.0


def trade_is_filled(trade: Any, expected_qty: float = 0.0) -> bool:
    status = trade_status(trade).lower()
    filled = trade_filled_qty(trade)

    if status == "filled":
        return True

    if expected_qty > 0 and filled >= expected_qty:
        return True

    return False


def trade_is_working_or_filled(trade: Any) -> bool:
    status = trade_status(trade).lower()
    return status in (
        "pendingsubmit",
        "apipending",
        "presubmitted",
        "submitted",
        "validationerror",
        "apiupdate",
        "filled",
    )


def trade_log_messages(trade: Any) -> List[str]:
    messages: List[str] = []

    for item in getattr(trade, "log", []) or []:
        status = str(getattr(item, "status", "") or "")
        message = str(getattr(item, "message", "") or "")
        error_code = getattr(item, "errorCode", "")

        parts = []
        if status:
            parts.append(status)
        if error_code not in ("", None):
            parts.append(f"errorCode={error_code}")
        if message:
            parts.append(message)

        if parts:
            messages.append(" | ".join(parts))

    return messages


def trade_rejection_reason(*trades: Any) -> str:
    combined_parts: List[str] = []

    for trade in trades:
        if trade is None:
            continue

        # IB can log a ValidationError / warning during order handling and then
        # still finish as Filled. Filled wins over warning text. This fixes the
        # GLW-style case where a close filled but was reported as rejected.
        if trade_is_filled(trade):
            continue

        status = trade_status(trade)
        messages = trade_log_messages(trade)

        if status:
            combined_parts.append(f"status={status}")

        combined_parts.extend(messages)

    combined = " ; ".join(combined_parts)
    lower = combined.lower()

    if any(status in lower for status in ORDER_BAD_STATUSES):
        return combined or "IB order status is canceled/inactive"

    has_known_nonfatal_warning = any(
        warning_word in lower for warning_word in ORDER_NON_FATAL_WARNING_WORDS
    )

    rejection_text = lower
    for warning_word in ORDER_NON_FATAL_WARNING_WORDS:
        rejection_text = rejection_text.replace(warning_word, "")

    # ValidationError without the exact known Warning 399 pattern remains fatal.
    if "validationerror" in lower and not has_known_nonfatal_warning:
        return combined or "IB order validation failed"

    if any(word in rejection_text for word in ORDER_REJECTION_WORDS):
        return combined or "IB order appears rejected"

    return ""


async def wait_for_ib_confirmation(*trades: Any) -> str:
    if ORDER_CONFIRM_DELAY > 0:
        await asyncio.sleep(ORDER_CONFIRM_DELAY)

    return trade_rejection_reason(*trades)


def target_order_tif(data: Dict[str, Any]) -> str:
    if is_vixale_edge_payload(data):
        return "GTC"

    explicit = str(data.get("target_tif") or data.get("target_time_in_force") or "").strip().upper()
    if explicit in ("DAY", "GTC"):
        return explicit

    # No-EOD target strategies, such as EMA Pullback, must keep attached targets
    # alive overnight. Entries remain DAY market orders; only the attached target
    # becomes GTC.
    eod_policy = str(data.get("eod_policy") or "").strip().upper()
    if eod_policy == "NO_EOD_CLOSE" or is_ema_pullback_payload(data):
        return "GTC"

    return "DAY"


def build_entry_order(entry_action: str, qty: int, entry: float, entry_order_type: str):
    if entry_order_type == "MARKET":
        order = MarketOrder(
            action=entry_action,
            totalQuantity=qty,
            tif="DAY",
        )
    else:
        order = LimitOrder(
            action=entry_action,
            totalQuantity=qty,
            lmtPrice=entry,
            tif="DAY",
        )

    return order


async def cancel_specific_trade(trade: Any) -> bool:
    """Cancel only this order; never sweep unrelated orders for the symbol."""
    if trade is None:
        return False

    status = trade_status(trade).lower()
    if status in ("filled", "cancelled", "canceled", "apicancelled", "inactive"):
        return False

    order = getattr(trade, "order", None)
    if order is None:
        return False

    try:
        ib.cancelOrder(order)
        return True
    except Exception as exc:
        print(f"[SPECIFIC CANCEL ERROR] order_id={trade_order_id(trade)} error={exc}")
        return False


async def place_repaired_target(
    contract: Any,
    symbol: str,
    side: str,
    qty: int,
    target_price: float,
    tif: str,
) -> Tuple[Any, str, bool]:
    """Place a standalone target sized to the actual broker position."""
    order = LimitOrder(
        action="SELL" if side == "LONG" else "BUY",
        totalQuantity=qty,
        lmtPrice=target_price,
        tif=tif,
    )
    order.orderId = ib.client.getReqId()
    order.transmit = True
    order.orderRef = target_order_ref(symbol, side)

    trade = ib.placeOrder(contract, order)
    rejection_reason = await wait_for_ib_confirmation(trade)
    working = trade_is_working_or_filled(trade) and not rejection_reason
    return trade, rejection_reason, working


async def safety_flatten_unprotected_fill(
    original_data: Dict[str, Any],
    symbol: str,
) -> Dict[str, Any]:
    """Flatten a real fill if no protective target can be restored."""
    position_size = await get_position_size(symbol)
    if abs(position_size) <= 0.000001:
        return {"status": "already_flat", "symbol": symbol}

    close_payload = dict(original_data)
    close_payload["event"] = "PARTIAL_FILL_SAFETY_CLOSE"
    close_payload["side"] = "LONG" if position_size > 0 else "SHORT"
    close_payload["qty"] = abs(int(round(position_size)))
    close_payload["reason"] = "UNPROTECTED_ENTRY_FILL"
    return await close_position_market(close_payload)


async def repair_entry_target_for_actual_position(
    original_data: Dict[str, Any],
    contract: Any,
    entry_trade: Any,
    target_trade: Any,
    base_result: Dict[str, Any],
    symbol: str,
    side: str,
    requested_entry_order_qty: int,
    entry_reference_price: float,
    target_price: float,
) -> Dict[str, Any]:
    """Cancel the unfinished bracket and protect the actual resulting position."""
    entry_order_filled_qty = trade_filled_qty(entry_trade)
    entry_fully_filled = trade_is_filled(entry_trade, requested_entry_order_qty)
    entry_fill_price = trade_fill_price(entry_trade, entry_reference_price)

    parent_cancel_requested = await cancel_specific_trade(entry_trade)
    original_child_cancel_requested = await cancel_specific_trade(target_trade)
    await asyncio.sleep(0.75)

    position_after_fill = await get_position_size(symbol)
    side_matches = (
        (side == "LONG" and position_after_fill > 0)
        or (side == "SHORT" and position_after_fill < 0)
    )
    actual_position_qty = abs(int(round(position_after_fill)))

    if side_matches and actual_position_qty > 0:
        repaired_trade, repaired_error, repaired_working = await place_repaired_target(
            contract=contract,
            symbol=symbol,
            side=side,
            qty=actual_position_qty,
            target_price=target_price,
            tif=target_order_tif(original_data),
        )

        if repaired_working:
            result = dict(base_result)
            result.update({
                "dry_run": False,
                "status": "submitted_with_repaired_target",
                "order_id": trade_order_id(entry_trade),
                "order_perm_id": trade_perm_id(entry_trade),
                "original_target_order_id": trade_order_id(target_trade),
                "target_order_id": trade_order_id(repaired_trade),
                "target_perm_id": trade_perm_id(repaired_trade),
                "target_parent_id": 0,
                "entry_status": trade_status(entry_trade),
                "target_status": trade_status(repaired_trade),
                "entry_filled": True,
                "entry_fully_filled": entry_fully_filled,
                "entry_fill_price": entry_fill_price,
                # Public OPEN quantity must be the actual final broker position,
                # not the parent delta quantity used during a reversal.
                "entry_filled_qty": actual_position_qty,
                "entry_order_filled_qty": entry_order_filled_qty,
                "target_position_qty": actual_position_qty,
                "desired_qty": actual_position_qty,
                "target_order_qty": actual_position_qty,
                "target_working": True,
                "partial_fill_repaired": not entry_fully_filled,
                "position_after_fill": position_after_fill,
                "parent_cancel_requested": parent_cancel_requested,
                "original_child_cancel_requested": original_child_cancel_requested,
            })

            if ENABLE_TARGET_FILL_MONITOR:
                spawn_execution_monitor(
                    monitor_target_fill(
                        original_data=dict(original_data),
                        target_trade=repaired_trade,
                        symbol=symbol,
                        side=side,
                        qty=actual_position_qty,
                        entry_fill_price=entry_fill_price,
                        target_price=target_price,
                    )
                )

            print(
                f"[PARTIAL FILL TARGET REPAIRED] symbol={symbol} side={side} "
                f"requested_order_qty={requested_entry_order_qty} "
                f"entry_order_filled_qty={entry_order_filled_qty} "
                f"actual_position={position_after_fill} target_qty={actual_position_qty} "
                f"target_order_id={trade_order_id(repaired_trade)}"
            )
            return result

        emergency_close = await safety_flatten_unprotected_fill(original_data, symbol)
        result = dict(base_result)
        result.update({
            "dry_run": False,
            "status": "rejected",
            "error": repaired_error or f"Repaired target is not working: status={trade_status(repaired_trade)}",
            "order_id": trade_order_id(entry_trade),
            "order_perm_id": trade_perm_id(entry_trade),
            "target_order_id": trade_order_id(repaired_trade),
            "target_perm_id": trade_perm_id(repaired_trade),
            "entry_filled": True,
            "entry_fill_price": entry_fill_price,
            "entry_filled_qty": actual_position_qty,
            "target_working": False,
            "emergency_close_result": emergency_close,
        })
        return result

    # A partial reversal can leave the broker on the old side. Never publish a
    # false OPEN for the requested new side; flatten the residue instead.
    emergency_close = await safety_flatten_unprotected_fill(original_data, symbol)
    result = dict(base_result)
    result.update({
        "dry_run": False,
        "status": "rejected",
        "error": (
            f"Filled order did not leave a matching {side} broker position: "
            f"position={position_after_fill}"
        ),
        "order_id": trade_order_id(entry_trade),
        "order_perm_id": trade_perm_id(entry_trade),
        "target_order_id": trade_order_id(target_trade),
        "target_perm_id": trade_perm_id(target_trade),
        "entry_filled": True,
        "entry_fill_price": entry_fill_price,
        "entry_filled_qty": entry_order_filled_qty,
        "target_working": False,
        "emergency_close_result": emergency_close,
    })
    return result


async def monitor_target_fill(
    original_data: Dict[str, Any],
    target_trade: Any,
    symbol: str,
    side: str,
    qty: int,
    entry_fill_price: float,
    target_price: float,
) -> None:
    if not ENABLE_TARGET_FILL_MONITOR or DRY_RUN:
        return

    waited = 0.0
    poll = max(TARGET_MONITOR_POLL_SECONDS, 0.25)
    max_wait = max(TARGET_MONITOR_SECONDS, poll)

    print(f"[TP MONITOR START] symbol={symbol} side={side} target_order_id={trade_order_id(target_trade)} target={target_price}")

    while waited <= max_wait:
        try:
            if trade_is_filled(target_trade, qty):
                if not await claim_target_report(symbol):
                    print(f"[TP MONITOR DEDUPE] symbol={symbol} side={side} another reporter already claimed this target fill")
                    return

                try:
                    actual_qty = trade_filled_qty(target_trade) or qty
                    fill_price = trade_fill_price(target_trade)
                    edge_target = is_vixale_edge_payload(original_data)
                    if edge_target and fill_price <= 0:
                        print(
                            f"[TP MONITOR RETRY ARMED] symbol={symbol} exact target is Filled "
                            "but actual execution price is unavailable; managed state retained"
                        )
                        return
                    if edge_target:
                        flat, position_after = await verify_position_flat(
                            symbol,
                            FORCE_EOD_POSITION_VERIFY_SECONDS,
                        )
                        if not flat:
                            print(
                                f"[TP MONITOR CRITICAL RETRY ARMED] symbol={symbol} "
                                f"exact target is Filled but broker position remains {position_after}; "
                                "TP callback withheld and managed state retained"
                            )
                            return
                    payload = dict(original_data)
                    payload["event"] = "TP"
                    payload["symbol"] = symbol
                    payload["side"] = side
                    payload["entry"] = entry_fill_price or to_float(original_data.get("entry"))
                    payload["price"] = fill_price
                    payload["target"] = target_price
                    payload["qty"] = actual_qty
                    payload["reason"] = (
                        "IB_TARGET_EXECUTION_CONFIRMED"
                        if edge_target
                        else payload.get("reason") or "IB_TARGET_FILLED"
                    )
                    payload["ib_target_order_id"] = trade_order_id(target_trade)
                    payload["ib_target_perm_id"] = trade_perm_id(target_trade)
                    payload["ib_target_order_ref"] = trade_order_ref_value(target_trade)
                    payload["ib_target_status"] = trade_status(target_trade)
                    if edge_target:
                        identity = execution_identity_text(
                            exec_ids=trade_execution_ids(target_trade),
                            perm_id=trade_perm_id(target_trade),
                            order_id=trade_order_id(target_trade),
                            order_ref_value=trade_order_ref_value(target_trade),
                        )
                        if not identity:
                            print(
                                f"[TP MONITOR RETRY ARMED] symbol={symbol} "
                                "target execution identity is unavailable; Render callback withheld"
                            )
                            return
                        setup_id = str(original_data.get("setup_id") or "").strip()
                        payload["source"] = "IB_BRIDGE"
                        payload["system_id"] = "VIXALE_EDGE"
                        payload["exit_execution_id"] = identity
                        payload["reconciliation_id"] = f"{setup_id or symbol}:{identity}"
                        payload["broker_confirmed_flat"] = True
                        payload["position_after_close"] = position_after
                        managed = load_managed_positions()
                        managed_row = dict(managed.get(symbol) or {})
                        managed_row["reconciliation_claim"] = {
                            "reconciliation_id": payload["reconciliation_id"],
                            "event": "TP",
                            "exit_execution_id": identity,
                            "render_payload": payload,
                            "claimed_at": now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE).isoformat(),
                        }
                        managed[symbol] = managed_row
                        if not save_managed_positions(managed):
                            print(
                                f"[TP MONITOR RETRY ARMED] symbol={symbol} "
                                "reconciliation claim persistence failed; Render callback withheld"
                            )
                            return

                    render_result = await forward_to_render(payload)
                    print(f"[TP MONITOR RENDER RESULT] symbol={symbol} side={side} {render_result}")

                    if render_delivery_succeeded(render_result):
                        clear_managed_position(symbol)
                        print(f"[TP MONITOR DONE] symbol={symbol} side={side} filled={qty}@{fill_price}")
                        if CANCEL_ORPHAN_TARGETS_AFTER_FLAT:
                            try:
                                await cleanup_orphan_targets_if_flat(symbol)
                            except Exception as cleanup_exc:
                                print(f"[TP MONITOR CLEANUP ERROR] symbol={symbol} error={cleanup_exc}")
                    else:
                        print(f"[TP MONITOR RETRY ARMED] symbol={symbol} Render delivery failed; managed state retained")
                finally:
                    await release_target_report_claim(symbol)
                return

            rejection_reason = trade_rejection_reason(target_trade)
            status = trade_status(target_trade).lower()
            if rejection_reason or status in ORDER_BAD_STATUSES:
                print(f"[TP MONITOR STOP] symbol={symbol} side={side} status={trade_status(target_trade)} reason={rejection_reason}")
                return

        except Exception as exc:
            print(f"[TP MONITOR ERROR] symbol={symbol} side={side} error={exc}")
            return

        await asyncio.sleep(poll)
        waited += poll

    print(f"[TP MONITOR TIMEOUT] symbol={symbol} side={side} target_order_id={trade_order_id(target_trade)}")


async def edge_entry_guard(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Block Edge stacking/reversal without canceling an existing target."""
    if not is_vixale_edge_payload(data):
        return None

    symbol = str(data.get("symbol") or "").upper().strip()
    setup_id = str(data.get("setup_id") or "").strip()
    position = await get_position_size(symbol)
    managed = load_managed_positions()
    active = dict(managed.get(symbol) or {})
    active_is_edge = bool(active) and is_vixale_edge_managed_position(active)
    active_setup_id = str(active.get("setup_id") or "").strip()

    if setup_id and active_is_edge and active_setup_id == setup_id:
        return {
            "dry_run": DRY_RUN,
            "status": "edge_duplicate_active_setup",
            "symbol": symbol,
            "side": str(data.get("side") or "").upper().strip(),
            "setup_id": setup_id,
            "position_before_entry": position,
            "canceled_replaced_orders": 0,
            "cancel_scope": "PENDING_ONLY",
            "cancel_reason": "EDGE_DUPLICATE_ACTIVE_SETUP",
            "message": "Existing managed Vixale Edge setup_id is already active; no broker order submitted.",
        }

    if abs(position) > 0.000001 or active_is_edge:
        return {
            "dry_run": DRY_RUN,
            "status": "edge_entry_blocked_existing_position",
            "symbol": symbol,
            "side": str(data.get("side") or "").upper().strip(),
            "setup_id": setup_id,
            "position_before_entry": position,
            "active_setup_id": active_setup_id,
            "canceled_replaced_orders": 0,
            "cancel_scope": "PENDING_ONLY",
            "cancel_reason": "EDGE_ENTRY_BLOCKED_EXISTING_POSITION",
            "message": "Vixale Edge permits one active position per symbol across all timeframes; no broker order submitted.",
        }

    return None


async def place_entry_order(data: Dict[str, Any]) -> Dict[str, Any]:
    await ensure_ib_connected()

    symbol = str(data.get("symbol", "")).upper().strip()
    side = str(data.get("side", "")).upper().strip()
    sec_type = normalize_sec_type(data)

    entry = round_price(to_float(data.get("entry")))
    qty = to_int_qty(data.get("qty")) or DEFAULT_STOCK_QTY
    edge_mode = is_vixale_edge_payload(data)
    entry_order_type = "MARKET" if edge_mode else get_entry_order_type(data)

    if not symbol:
        raise ValueError("Missing symbol")

    if side not in ["LONG", "SHORT"]:
        raise ValueError(f"Invalid side: {side}")

    if entry <= 0:
        raise ValueError(f"Invalid entry price: {entry}")

    if qty <= 0:
        raise ValueError(f"Invalid qty: {qty}")

    target_price = extract_target_price(data, side, entry) if edge_mode else 0.0
    if edge_mode and not valid_edge_target(side, entry, target_price):
        return edge_target_required_result(data, symbol, side, entry, target_price)

    validate_pretrade_risk(symbol, side, entry, qty, sec_type)
    validate_entry_timing(entry_order_type, sec_type)

    edge_block = await edge_entry_guard(data)
    if edge_block is not None:
        return edge_block

    no_target_mode = is_no_target_payload(data)
    opposite_flip_mode = is_opposite_flip_payload(data)

    if not edge_mode:
        if no_target_mode:
            target_price = 0.0
        else:
            target_price = extract_target_price(data, side, entry)
            validate_target_price(side, entry, target_price)

    canceled_replaced_orders = 0

    contract = await qualify_contract(data)

    # Opposite Flip SETUP means "make broker position equal to this final side/qty".
    # Do NOT blindly SELL qty when already long, because that only nets the old long
    # down and can leave a tiny accidental short (example: +408 then SELL 409 => -1).
    #
    # Correct reversal math:
    #   current +408, desired SHORT 409 => SELL 817
    #   current -415, desired LONG 429  => BUY 844
    #   current flat, desired LONG 429  => BUY 429
    position_before_entry = 0
    desired_position = desired_signed_position(side, qty)
    position_delta = desired_position
    order_qty = qty

    if opposite_flip_mode:
        current_position = await get_position_size(symbol)
        entry_action, order_qty, desired_position, position_before_entry = opposite_flip_delta_order(
            side=side,
            desired_qty=qty,
            current_position=current_position,
        )
        position_delta = desired_position - position_before_entry

        if order_qty <= 0:
            return {
                "dry_run": DRY_RUN,
                "status": "already_at_target_position",
                "action": "NONE",
                "symbol": symbol,
                "sec_type": sec_type,
                "exchange": contract_exchange_from_data(data),
                "currency": contract_currency_from_data(data),
                "contract_month": contract_month_from_data(data),
                "local_symbol": str(data.get("local_symbol") or data.get("localSymbol") or ""),
                "side": side,
                "qty": qty,
                "target_position_qty": qty,
                "desired_qty": qty,
                "ib_order_qty": 0,
                "position_before_entry": position_before_entry,
                "desired_position_after_entry": desired_position,
                "position_delta": position_delta,
                "entry_order_type": entry_order_type,
                "entry_reference_price": entry,
                "limit_price": entry if entry_order_type == "LIMIT" else None,
                "canceled_replaced_orders": canceled_replaced_orders,
                "no_target_mode": no_target_mode,
                "message": "Broker position is already at the desired Opposite Flip target position. Existing targets were not canceled.",
            }
    else:
        entry_action = "BUY" if side == "LONG" else "SELL"
        order_qty = qty
        position_before_entry = 0
        desired_position = desired_signed_position(side, qty)
        position_delta = desired_position

    # Only cancel existing working orders after we know this is a real new order.
    # For Shrek with attached targets, a reversal SETUP may arrive before the
    # separate CLOSE_STOP. Cancel all old target orders for this symbol before
    # submitting the new parent/child target, otherwise an old target can become
    # an accidental entry after the reversal.
    if opposite_flip_mode:
        canceled_replaced_orders = await cancel_open_orders_for_symbol(symbol, None)
    elif edge_mode:
        # An Edge entry is allowed only after proving broker-flat/no active Edge
        # state. Never sweep symbol orders or disturb an existing protective target.
        canceled_replaced_orders = 0
    else:
        canceled_replaced_orders = await cancel_open_orders_for_symbol(symbol, side)

    target_action = "SELL" if side == "LONG" else "BUY"
    # In an OppositeFlip reversal, the entry order quantity is the broker delta
    # needed to go from current position to desired final position. The attached
    # profit target must cover only the final desired position qty, not the delta.
    # Example: current +100 LONG, desired -100 SHORT => parent SELL 200, target BUY 100.
    target_order_qty = qty if opposite_flip_mode else order_qty

    entry_order = build_entry_order(entry_action, order_qty, entry, entry_order_type)
    entry_order.orderRef = order_ref(symbol, side)

    target_configured = target_price > 0
    target_payload = {
        "target_configured": target_configured,
        "target_action": target_action if target_configured else None,
        "target_price": target_price if target_configured else None,
        "target_order_qty": target_order_qty if target_configured else None,
        "target_order_ref": target_order_ref(symbol, side) if target_configured else None,
        "target_tif": target_order_tif(data) if target_configured else None,
    }

    base_payload = {
        "action": entry_action,
        "symbol": symbol,
        "sec_type": sec_type,
        "exchange": contract_exchange_from_data(data),
        "currency": contract_currency_from_data(data),
        "contract_month": contract_month_from_data(data),
        "local_symbol": str(data.get("local_symbol") or data.get("localSymbol") or ""),
        "side": side,
        "qty": qty,
        "target_position_qty": qty,
        "desired_qty": qty,
        "ib_order_qty": order_qty,
        "position_before_entry": position_before_entry,
        "desired_position_after_entry": desired_position,
        "position_delta": position_delta,
        "entry_order_type": entry_order_type,
        "entry_reference_price": entry,
        "limit_price": entry if entry_order_type == "LIMIT" else None,
        "order_ref": entry_order.orderRef,
        "setup_id": str(data.get("setup_id") or ""),
        "execution_family": classify_strategy_payload(data),
        "canceled_replaced_orders": canceled_replaced_orders,
        "no_target_mode": no_target_mode,
        **target_payload,
    }

    if DRY_RUN:
        return {
            "dry_run": True,
            "status": "dry_run_entry_order",
            **base_payload,
        }

    if target_configured:
        # IB bracket-style parent/child flow:
        # - Parent entry is sent with transmit=False.
        # - Child profit target is attached with parentId and transmit=True.
        # - IB/TWS activates the target only after the parent entry fills.
        entry_order.orderId = ib.client.getReqId()
        entry_order.transmit = False

        target_order = LimitOrder(
            action=target_action,
            totalQuantity=target_order_qty,
            lmtPrice=target_price,
            tif=target_order_tif(data),
        )
        target_order.orderId = ib.client.getReqId()
        target_order.parentId = entry_order.orderId
        target_order.transmit = True
        target_order.orderRef = target_order_ref(symbol, side)

        if edge_mode:
            reservation = {
                **base_payload,
                "order_id": entry_order.orderId,
                "target_order_id": target_order.orderId,
                "entry_status": "PendingSubmit",
                "target_status": "PendingSubmit",
                "entry_filled": False,
                "entry_submission_state": "RESERVED",
            }
            if not mark_edge_entry_submission(data, reservation):
                return {
                    "dry_run": False,
                    "status": "edge_entry_state_persistence_failed",
                    "symbol": symbol,
                    "side": side,
                    "setup_id": str(data.get("setup_id") or ""),
                    "cancel_scope": "PENDING_ONLY",
                    "cancel_reason": "EDGE_ENTRY_STATE_PERSISTENCE_FAILED",
                    "message": "Managed Edge order identity could not be persisted; no broker order submitted.",
                    **base_payload,
                }

        entry_trade = None
        try:
            entry_trade = ib.placeOrder(contract, entry_order)
            target_trade = ib.placeOrder(contract, target_order)
        except Exception:
            if edge_mode:
                if entry_trade is None:
                    clear_edge_submission_if_unfilled(symbol, str(data.get("setup_id") or ""))
                else:
                    mark_edge_entry_submission(data, {
                        **reservation,
                        "order_id": trade_order_id(entry_trade) or entry_order.orderId,
                        "order_perm_id": trade_perm_id(entry_trade),
                        "entry_status": trade_status(entry_trade) or "Submitted",
                        "entry_filled": trade_is_filled(entry_trade, order_qty),
                        "entry_filled_qty": trade_filled_qty(entry_trade),
                        "entry_fill_price": trade_fill_price(entry_trade),
                        "entry_submission_state": "ENTRY_SUBMITTED_TARGET_PLACE_FAILED",
                    })
            raise

        rejection_reason = await wait_for_ib_confirmation(entry_trade, target_trade)

        entry_filled_qty = trade_filled_qty(entry_trade)
        entry_filled = trade_is_filled(entry_trade, order_qty)
        target_working = trade_is_working_or_filled(target_trade)

        # A market parent can be genuinely partial while IB logs Warning 399.
        # Give the parent a short chance to complete before repairing the target.
        if entry_filled_qty > 0 and not entry_filled and PARTIAL_FILL_GRACE_SECONDS > 0:
            await asyncio.sleep(PARTIAL_FILL_GRACE_SECONDS)
            rejection_reason = trade_rejection_reason(entry_trade, target_trade)
            entry_filled_qty = trade_filled_qty(entry_trade)
            entry_filled = trade_is_filled(entry_trade, order_qty)
            target_working = trade_is_working_or_filled(target_trade)

        entry_fill_price = trade_fill_price(entry_trade, entry)
        identity_payload = {
            **base_payload,
            "order_id": trade_order_id(entry_trade),
            "order_perm_id": trade_perm_id(entry_trade),
            "target_order_id": trade_order_id(target_trade),
            "target_perm_id": trade_perm_id(target_trade),
            "entry_status": trade_status(entry_trade),
            "target_status": trade_status(target_trade),
            "entry_filled": entry_filled,
            "entry_fill_price": entry_fill_price,
            "entry_filled_qty": entry_filled_qty,
            "target_working": target_working,
        }
        mark_edge_entry_submission(data, identity_payload)

        # Any real fill must remain protected. Repair a partial parent, or a full
        # parent whose attached child is no longer working.
        if entry_filled_qty > 0 and (not entry_filled or not target_working or bool(rejection_reason)):
            repair_base = {**base_payload}
            repair_base.update({
                "original_rejection_reason": rejection_reason,
                "original_target_status": trade_status(target_trade),
            })
            return await repair_entry_target_for_actual_position(
                original_data=dict(data),
                contract=contract,
                entry_trade=entry_trade,
                target_trade=target_trade,
                base_result=repair_base,
                symbol=symbol,
                side=side,
                requested_entry_order_qty=order_qty,
                entry_reference_price=entry,
                target_price=target_price,
            )

        if rejection_reason:
            canceled_after_rejection = await cancel_open_orders_for_symbol(symbol, side)
            clear_edge_submission_if_unfilled(symbol, str(data.get("setup_id") or ""))
            return {
                "dry_run": False,
                "status": "rejected",
                "error": rejection_reason,
                "order_id": trade_order_id(entry_trade),
                "order_perm_id": trade_perm_id(entry_trade),
                "target_order_id": trade_order_id(target_trade),
                "target_perm_id": trade_perm_id(target_trade),
                "entry_filled": False,
                "entry_fill_price": entry_fill_price,
                "target_working": target_working,
                "canceled_after_rejection": canceled_after_rejection,
                **base_payload,
            }

        result_payload = {
            "dry_run": False,
            "status": "submitted_with_attached_target" if entry_filled else "submitted_awaiting_entry_fill",
            "order_id": trade_order_id(entry_trade),
            "order_perm_id": trade_perm_id(entry_trade),
            "target_order_id": trade_order_id(target_trade),
            "target_perm_id": trade_perm_id(target_trade),
            "target_parent_id": getattr(target_order, "parentId", None),
            "entry_status": trade_status(entry_trade),
            "target_status": trade_status(target_trade),
            "entry_filled": entry_filled,
            "entry_fill_price": entry_fill_price,
            "entry_filled_qty": entry_filled_qty,
            "target_working": target_working,
            **base_payload,
        }

        if entry_filled and target_working and ENABLE_TARGET_FILL_MONITOR:
            spawn_execution_monitor(
                monitor_target_fill(
                    original_data=dict(data),
                    target_trade=target_trade,
                    symbol=symbol,
                    side=side,
                    qty=target_order_qty,
                    entry_fill_price=entry_fill_price,
                    target_price=target_price,
                )
            )

        if not entry_filled and entry_order_type == "MARKET" and ENABLE_EXECUTION_FILL_MONITOR:
            spawn_execution_monitor(
                monitor_entry_fill_confirmation(
                    original_data=dict(data),
                    entry_trade=entry_trade,
                    target_trade=target_trade,
                    base_result=dict(result_payload),
                    symbol=symbol,
                    side=side,
                    expected_entry_order_qty=order_qty,
                    final_position_qty=target_order_qty,
                    entry_reference_price=entry,
                    target_price=target_price,
                )
            )

        return result_payload

    entry_trade = ib.placeOrder(contract, entry_order)
    rejection_reason = await wait_for_ib_confirmation(entry_trade)

    if rejection_reason:
        canceled_after_rejection = await cancel_open_orders_for_symbol(symbol, side)
        clear_edge_submission_if_unfilled(symbol, str(data.get("setup_id") or ""))
        return {
            "dry_run": False,
            "status": "rejected",
            "error": rejection_reason,
            "order_id": trade_order_id(entry_trade),
            "order_perm_id": trade_perm_id(entry_trade),
            "canceled_after_rejection": canceled_after_rejection,
            **base_payload,
        }

    entry_filled = trade_is_filled(entry_trade, order_qty)
    result_payload = {
        "dry_run": False,
        "status": "submitted_without_target_missing_target_price" if entry_filled else "submitted_awaiting_entry_fill",
        "order_id": trade_order_id(entry_trade),
        "order_perm_id": trade_perm_id(entry_trade),
        "entry_status": trade_status(entry_trade),
        "entry_filled": entry_filled,
        "entry_fill_price": trade_fill_price(entry_trade, entry),
        "entry_filled_qty": trade_filled_qty(entry_trade),
        **base_payload,
    }
    mark_edge_entry_submission(data, result_payload)

    if not entry_filled and entry_order_type == "MARKET" and ENABLE_EXECUTION_FILL_MONITOR:
        spawn_execution_monitor(
            monitor_entry_fill_confirmation(
                original_data=dict(data),
                entry_trade=entry_trade,
                target_trade=None,
                base_result=dict(result_payload),
                symbol=symbol,
                side=side,
                expected_entry_order_qty=order_qty,
                final_position_qty=qty,
                entry_reference_price=entry,
                target_price=0.0,
            )
        )

    return result_payload


# Backwards-compatible alias for old internal name.
async def place_entry_limit(data: Dict[str, Any]) -> Dict[str, Any]:
    return await place_entry_order(data)


def all_known_ib_trades() -> List[Any]:
    trades: List[Any] = []
    seen = set()
    for collection in (current_ib_trades(), list(ib.openTrades() or [])):
        for trade in collection:
            marker = id(trade)
            if marker in seen:
                continue
            seen.add(marker)
            trades.append(trade)
    return trades


def find_trade_by_expected_identity(
    row: Dict[str, Any],
    expected: Dict[str, Any],
) -> Optional[Any]:
    symbol = str(row.get("symbol") or "").upper().strip()
    exit_action = expected_exit_action(row)
    matches = []
    for trade in all_known_ib_trades():
        if trade_contract_symbol(trade) != symbol:
            continue
        if trade_action(trade) != exit_action:
            continue
        if identity_matches(
            trade_order_id(trade),
            trade_perm_id(trade),
            trade_order_ref_value(trade),
            expected,
        ):
            matches.append(trade)

    if len(matches) != 1:
        return None
    return matches[0]


def find_exact_managed_target_trade(row: Dict[str, Any]) -> Optional[Any]:
    return find_trade_by_expected_identity(
        row,
        managed_order_identity(row, "target"),
    )


async def cancel_and_verify_edge_target(
    row: Dict[str, Any],
) -> Dict[str, Any]:
    target_trade = find_exact_managed_target_trade(row)
    if target_trade is None:
        return {
            "ok": False,
            "status": "EDGE_STOP_TARGET_CANCEL_UNCONFIRMED",
            "canceled_targets": 0,
            "reason": "exact_managed_target_not_found_or_ambiguous",
        }

    expected_qty = (
        to_float(managed_order_identity(row, "target").get("expected_qty"))
        or to_float(row.get("qty"))
    )
    status = trade_status(target_trade).lower()
    if trade_is_filled(target_trade, expected_qty):
        return {
            "ok": True,
            "status": "target_filled",
            "canceled_targets": 0,
            "target_trade": target_trade,
            "target_filled_qty": trade_filled_qty(target_trade),
            "target_fill_price": trade_fill_price(target_trade),
        }
    if status in ORDER_BAD_STATUSES:
        return {
            "ok": True,
            "status": "target_cancelled",
            "canceled_targets": 0,
            "target_trade": target_trade,
            "target_filled_qty": trade_filled_qty(target_trade),
            "target_fill_price": trade_fill_price(target_trade),
        }

    ib.cancelOrder(target_trade.order)
    poll = max(FORCE_EOD_VERIFY_POLL_SECONDS, 0.10)
    waited = 0.0
    while waited <= max(FORCE_EOD_CANCEL_VERIFY_SECONDS, poll):
        status = trade_status(target_trade).lower()
        if trade_is_filled(target_trade, expected_qty):
            return {
                "ok": True,
                "status": "target_filled",
                "canceled_targets": 1,
                "target_trade": target_trade,
                "target_filled_qty": trade_filled_qty(target_trade),
                "target_fill_price": trade_fill_price(target_trade),
            }
        if status in ORDER_BAD_STATUSES:
            return {
                "ok": True,
                "status": "target_cancelled",
                "canceled_targets": 1,
                "target_trade": target_trade,
                "target_filled_qty": trade_filled_qty(target_trade),
                "target_fill_price": trade_fill_price(target_trade),
            }
        await asyncio.sleep(poll)
        waited += poll

    return {
        "ok": False,
        "status": "EDGE_STOP_TARGET_CANCEL_UNCONFIRMED",
        "canceled_targets": 1,
        "target_trade": target_trade,
        "target_status": trade_status(target_trade),
        "target_filled_qty": trade_filled_qty(target_trade),
        "reason": "target_still_working_or_cancellation_ambiguous",
    }


def is_edge_stop_close(data: Dict[str, Any]) -> bool:
    return (
        is_vixale_edge_payload(data)
        and str(data.get("event") or "").upper().strip() == "CLOSE_STOP"
    )


async def apply_edge_stop_close_flat_gate(
    data: Dict[str, Any],
    result: Dict[str, Any],
    symbol: str,
) -> Dict[str, Any]:
    if not is_edge_stop_close(data) or not result.get("close_filled"):
        return result

    flat, position_after = await verify_position_flat(
        symbol,
        FORCE_EOD_POSITION_VERIFY_SECONDS,
    )
    result["broker_confirmed_flat"] = flat
    result["position_after_close"] = position_after
    if not flat:
        result["status"] = "EDGE_STOP_CLOSE_POSITION_NOT_FLAT"
        result["critical_reason"] = "EDGE_STOP_CLOSE_POSITION_NOT_FLAT"
    return result


def edge_stop_close_result(
    data: Dict[str, Any],
    status: str,
    **values: Any,
) -> Dict[str, Any]:
    return {
        "dry_run": DRY_RUN,
        "status": status,
        "event": "CLOSE_STOP",
        "symbol": str(data.get("symbol") or "").upper().strip(),
        "side": str(data.get("side") or "").upper().strip(),
        "setup_id": str(data.get("setup_id") or "").strip(),
        **values,
    }


async def recover_reserved_edge_stop_close(
    data: Dict[str, Any],
    reserved: Dict[str, Any],
) -> Dict[str, Any]:
    row = dict(reserved.get("row") or {})
    reservation = dict(reserved.get("reservation") or {})
    expected = {
        "perm_id": reservation.get("perm_id"),
        "order_id": reservation.get("order_id"),
        "order_ref": reservation.get("order_ref"),
        "expected_qty": reservation.get("remaining_qty") or row.get("qty"),
    }
    close_trade = find_trade_by_expected_identity(row, expected)
    if close_trade is None:
        return edge_stop_close_result(
            data,
            "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
            reservation_state=reservation.get("state", ""),
            order_ref=reservation.get("order_ref", ""),
            managed_state_persisted=True,
        )

    expected_qty = (
        to_int_qty(reservation.get("remaining_qty"))
        or to_int_qty(row.get("qty"))
    )
    close_filled = trade_is_filled(close_trade, expected_qty)
    result = edge_stop_close_result(
        data,
        "submitted" if close_filled else "EDGE_STOP_CLOSE_ALREADY_IN_PROGRESS",
        action=trade_action(close_trade),
        qty=expected_qty,
        position_before_close=reservation.get("position_before_close", ""),
        canceled_open_orders=reservation.get("canceled_targets", 0),
        order_ref=trade_order_ref_value(close_trade),
        order_id=trade_order_id(close_trade),
        order_perm_id=trade_perm_id(close_trade),
        close_status=trade_status(close_trade),
        close_filled=close_filled,
        close_fill_price=trade_fill_price(close_trade),
        close_filled_qty=trade_filled_qty(close_trade),
        close_exec_ids=trade_execution_ids(close_trade),
    )
    if close_filled:
        result = await apply_edge_stop_close_flat_gate(
            data,
            result,
            result["symbol"],
        )
    persisted = mark_managed_bridge_close(data, result)
    result["managed_state_persisted"] = persisted
    if not persisted:
        result["status"] = "EDGE_STOP_STATE_PERSISTENCE_FAILED"
        result["critical_reason"] = "EDGE_STOP_STATE_PERSISTENCE_FAILED"
    return result


async def execute_edge_v2_stop_close(
    data: Dict[str, Any],
    reserved: Dict[str, Any],
) -> Dict[str, Any]:
    symbol = str(data.get("symbol") or "").upper().strip()
    side = str(data.get("side") or "").upper().strip()
    row = dict(reserved.get("row") or {})
    reservation = dict(reserved.get("reservation") or {})
    order_ref_value = str(reservation.get("order_ref") or "")

    # Qualify before canceling the target so a qualification failure never
    # leaves the position unprotected.
    contract = await qualify_contract(data)

    if DRY_RUN:
        return edge_stop_close_result(
            data,
            "dry_run_close_order",
            order_ref=order_ref_value,
            canceled_open_orders=0,
            managed_state_persisted=True,
        )

    if not update_edge_stop_close_reservation(
        data,
        "TARGET_CANCEL_PENDING",
        target_identity=managed_order_identity(row, "target"),
    ):
        return edge_stop_close_result(
            data,
            "EDGE_STOP_STATE_PERSISTENCE_FAILED",
            canceled_open_orders=0,
            managed_state_persisted=False,
        )

    target_resolution = await cancel_and_verify_edge_target(row)
    target_trade = target_resolution.pop("target_trade", None)
    if not target_resolution.get("ok"):
        persisted = update_edge_stop_close_reservation(
            data,
            "TARGET_CANCEL_UNCONFIRMED",
            **target_resolution,
        )
        if not persisted:
            return edge_stop_close_result(
                data,
                "EDGE_STOP_STATE_PERSISTENCE_FAILED",
                canceled_open_orders=target_resolution.get("canceled_targets", 0),
                managed_state_persisted=False,
            )
        return edge_stop_close_result(
            data,
            "EDGE_STOP_TARGET_CANCEL_UNCONFIRMED",
            canceled_open_orders=target_resolution.get("canceled_targets", 0),
            target_status=target_resolution.get("target_status", ""),
            target_filled_qty=target_resolution.get("target_filled_qty", 0),
            managed_state_persisted=True,
        )

    if not update_edge_stop_close_reservation(
        data,
        "TARGET_RESOLVED",
        target_resolution=target_resolution.get("status"),
        canceled_targets=target_resolution.get("canceled_targets", 0),
        target_filled_qty=target_resolution.get("target_filled_qty", 0),
        target_fill_price=target_resolution.get("target_fill_price", 0),
        target_order_id=trade_order_id(target_trade) if target_trade else "",
        target_perm_id=trade_perm_id(target_trade) if target_trade else "",
        target_order_ref=trade_order_ref_value(target_trade) if target_trade else "",
    ):
        return edge_stop_close_result(
            data,
            "EDGE_STOP_STATE_PERSISTENCE_FAILED",
            canceled_open_orders=target_resolution.get("canceled_targets", 0),
            managed_state_persisted=False,
        )

    # This is deliberately the first position quantity used for order sizing:
    # the target cancellation/fill race has already reached a proven outcome.
    position_size = await get_position_size(symbol)
    target_filled = target_resolution.get("status") == "target_filled"

    if target_filled:
        reservation_state = (
            "TARGET_FILLED_POSITION_FLAT"
            if abs(position_size) <= 0.000001
            else "TARGET_FILLED_POSITION_NOT_FLAT"
        )
        persisted = update_edge_stop_close_reservation(
            data,
            reservation_state,
            position_after_target_resolution=position_size,
        )
        if not persisted:
            return edge_stop_close_result(
                data,
                "EDGE_STOP_STATE_PERSISTENCE_FAILED",
                position_after_target_resolution=position_size,
                canceled_open_orders=target_resolution.get("canceled_targets", 0),
                managed_state_persisted=False,
            )
        return edge_stop_close_result(
            data,
            reservation_state,
            position_after_target_resolution=position_size,
            canceled_open_orders=target_resolution.get("canceled_targets", 0),
            target_filled_qty=target_resolution.get("target_filled_qty", 0),
            target_fill_price=target_resolution.get("target_fill_price", 0),
            managed_state_persisted=True,
        )

    if abs(position_size) <= 0.000001:
        persisted = update_edge_stop_close_reservation(
            data,
            "POSITION_FLAT_AFTER_TARGET_RESOLUTION",
            position_after_target_resolution=position_size,
        )
        if not persisted:
            return edge_stop_close_result(
                data,
                "EDGE_STOP_STATE_PERSISTENCE_FAILED",
                position_after_target_resolution=position_size,
                canceled_open_orders=target_resolution.get("canceled_targets", 0),
                managed_state_persisted=False,
            )
        return edge_stop_close_result(
            data,
            "EDGE_STOP_POSITION_FLAT_AFTER_TARGET_RESOLUTION",
            position_after_target_resolution=position_size,
            canceled_open_orders=target_resolution.get("canceled_targets", 0),
            managed_state_persisted=True,
        )

    if (side == "LONG" and position_size <= 0) or (
        side == "SHORT" and position_size >= 0
    ):
        persisted = update_edge_stop_close_reservation(
            data,
            "NO_MATCHING_POSITION_AFTER_TARGET_RESOLUTION",
            position_after_target_resolution=position_size,
        )
        if not persisted:
            return edge_stop_close_result(
                data,
                "EDGE_STOP_STATE_PERSISTENCE_FAILED",
                position_before_close=position_size,
                canceled_open_orders=target_resolution.get("canceled_targets", 0),
                managed_state_persisted=False,
            )
        return edge_stop_close_result(
            data,
            "no_matching_position",
            position_before_close=position_size,
            canceled_open_orders=target_resolution.get("canceled_targets", 0),
            managed_state_persisted=True,
        )

    qty = abs(int(position_size))
    action = "SELL" if position_size > 0 else "BUY"
    if not update_edge_stop_close_reservation(
        data,
        "CLOSE_SUBMISSION_PENDING",
        action=action,
        remaining_qty=qty,
        position_before_close=position_size,
        canceled_targets=target_resolution.get("canceled_targets", 0),
        order_ref=order_ref_value,
    ):
        return edge_stop_close_result(
            data,
            "EDGE_STOP_STATE_PERSISTENCE_FAILED",
            position_before_close=position_size,
            canceled_open_orders=target_resolution.get("canceled_targets", 0),
            managed_state_persisted=False,
        )

    order = MarketOrder(
        action=action,
        totalQuantity=qty,
        tif="DAY",
    )
    order.orderRef = order_ref_value
    trade = ib.placeOrder(contract, order)
    rejection_reason = await wait_for_ib_confirmation(trade)
    close_filled = trade_is_filled(trade, qty)
    result = edge_stop_close_result(
        data,
        "submitted" if close_filled else "submitted_awaiting_close_fill",
        action=action,
        sec_type=normalize_sec_type(data),
        qty=qty,
        position_before_close=position_size,
        canceled_open_orders=target_resolution.get("canceled_targets", 0),
        order_ref=order.orderRef,
        order_id=trade_order_id(trade),
        order_perm_id=trade_perm_id(trade),
        close_status=trade_status(trade),
        close_filled=close_filled,
        close_fill_price=trade_fill_price(
            trade,
            to_float(data.get("price")) or to_float(data.get("entry")),
        ),
        close_filled_qty=trade_filled_qty(trade),
        close_exec_ids=trade_execution_ids(trade),
    )
    if rejection_reason and not close_filled:
        result["status"] = "rejected"
        result["error"] = rejection_reason
    if close_filled:
        result = await apply_edge_stop_close_flat_gate(data, result, symbol)

    persisted = mark_managed_bridge_close(data, result)
    result["managed_state_persisted"] = persisted
    if not persisted:
        result["status"] = "EDGE_STOP_STATE_PERSISTENCE_FAILED"
        result["critical_reason"] = "EDGE_STOP_STATE_PERSISTENCE_FAILED"
        return result

    if (
        close_filled
        and result.get("broker_confirmed_flat")
        and CANCEL_ORPHAN_TARGETS_AFTER_FLAT
    ):
        await asyncio.sleep(0.50)
        result.update(await cleanup_orphan_targets_if_flat(symbol))

    if (
        not close_filled
        and not rejection_reason
        and ENABLE_EXECUTION_FILL_MONITOR
    ):
        spawn_execution_monitor(
            monitor_close_fill_confirmation(
                original_data=dict(data),
                close_trade=trade,
                base_result=dict(result),
                symbol=symbol,
                side=side,
                expected_close_qty=qty,
                fallback_price=(
                    to_float(data.get("price"))
                    or to_float(data.get("entry"))
                ),
            )
        )
    return result


async def close_position_market(data: Dict[str, Any]) -> Dict[str, Any]:
    if is_edge_v2_stop_close(data):
        async with _edge_stop_close_lock:
            return await _close_position_market(data)
    return await _close_position_market(data)


async def _close_position_market(data: Dict[str, Any]) -> Dict[str, Any]:

    symbol = str(data.get("symbol", "")).upper().strip()
    side = str(data.get("side", "")).upper().strip()
    sec_type = normalize_sec_type(data)

    if not symbol:
        raise ValueError("Missing symbol")

    reserved: Optional[Dict[str, Any]] = None
    if is_edge_v2_stop_close(data):
        reserved = reserve_edge_stop_close(data)
        if not reserved.get("ok"):
            return edge_stop_close_result(
                data,
                str(reserved.get("status") or "EDGE_STOP_STATE_PERSISTENCE_FAILED"),
                managed_setup_id=reserved.get("managed_setup_id", ""),
                canceled_open_orders=0,
                managed_state_persisted=(
                    reserved.get("status") != "EDGE_STOP_STATE_PERSISTENCE_FAILED"
                ),
            )
        if (
            sec_type == "STK"
            and BLOCK_MARKET_CLOSES_OUTSIDE_RTH
            and not is_us_stock_rth_now()
        ):
            return edge_stop_close_result(
                data,
                "blocked_outside_rth",
                position_before_close="",
                canceled_open_orders=0,
                order_ref=reserved.get("reservation", {}).get("order_ref", ""),
                message=(
                    f"Market close blocked outside regular stock hours "
                    f"({RTH_START}-{RTH_END} {RTH_TIMEZONE}); "
                    "the setup-scoped reservation remains durable and the "
                    "managed target was NOT canceled."
                ),
                managed_state_persisted=True,
            )
        if reserved.get("existing"):
            await ensure_ib_connected()
            reservation_state = str(
                reserved.get("reservation", {}).get("state") or ""
            ).upper()
            if reservation_state in {
                "RESERVED",
                "TARGET_CANCEL_PENDING",
                "TARGET_CANCEL_UNCONFIRMED",
                "TARGET_RESOLVED",
            }:
                return await execute_edge_v2_stop_close(data, reserved)
            return await recover_reserved_edge_stop_close(data, reserved)

    await ensure_ib_connected()

    # Hard safety: if we cannot send the market close now, do NOT cancel the
    # attached target first. The previous EOD bug was: cancel target -> market
    # close rejected because exchange closed -> naked overnight position.
    event = str(data.get("event", "")).upper()
    if sec_type == "STK" and BLOCK_MARKET_CLOSES_OUTSIDE_RTH and not is_us_stock_rth_now():
        position_size_now = await get_position_size(symbol)
        return {
            "dry_run": DRY_RUN,
            "status": "blocked_close_outside_rth_no_cancel",
            "event": event,
            "symbol": symbol,
            "sec_type": sec_type,
            "side": side,
            "position_before_close": position_size_now,
            "canceled_open_orders": 0,
            "message": f"Market close blocked outside regular stock hours ({RTH_START}-{RTH_END} {RTH_TIMEZONE}); target orders were NOT canceled.",
        }

    if reserved is not None:
        return await execute_edge_v2_stop_close(data, reserved)

    position_size = await get_position_size(symbol)

    # Cancel only same-side working orders/targets, and only after timing check.
    # This avoids killing a fresh opposite-side setup that may arrive at almost
    # the same time during reversal.
    cancel_side = side if side in ("LONG", "SHORT") else None
    canceled_open_orders = await cancel_open_orders_for_symbol(symbol, cancel_side)

    if side == "LONG" and position_size <= 0:
        orphan_cleanup = await cleanup_orphan_targets_if_flat(symbol) if CANCEL_ORPHAN_TARGETS_AFTER_FLAT else {}
        return {
            "status": "no_matching_position",
            "symbol": symbol,
            "sec_type": sec_type,
            "side": side,
            "position_before_close": position_size,
            "canceled_open_orders": canceled_open_orders,
            "message": "No matching LONG IB position to close",
            **orphan_cleanup,
        }

    if side == "SHORT" and position_size >= 0:
        orphan_cleanup = await cleanup_orphan_targets_if_flat(symbol) if CANCEL_ORPHAN_TARGETS_AFTER_FLAT else {}
        return {
            "status": "no_matching_position",
            "symbol": symbol,
            "sec_type": sec_type,
            "side": side,
            "position_before_close": position_size,
            "canceled_open_orders": canceled_open_orders,
            "message": "No matching SHORT IB position to close",
            **orphan_cleanup,
        }

    if position_size == 0:
        orphan_cleanup = await cleanup_orphan_targets_if_flat(symbol) if CANCEL_ORPHAN_TARGETS_AFTER_FLAT else {}
        return {
            "status": "no_position",
            "symbol": symbol,
            "sec_type": sec_type,
            "side": side,
            "canceled_open_orders": canceled_open_orders,
            "message": "No IB position to close",
            **orphan_cleanup,
        }

    contract = await qualify_contract(data)

    qty = abs(int(position_size))
    action = "SELL" if position_size > 0 else "BUY"

    order = MarketOrder(
        action=action,
        totalQuantity=qty,
        tif="DAY",
    )

    order.orderRef = f"TVFVG_CLOSE_{symbol}"

    if DRY_RUN:
        return {
            "dry_run": True,
            "status": "dry_run_close_order",
            "action": action,
            "symbol": symbol,
            "sec_type": sec_type,
            "side": side,
            "qty": qty,
            "position_before_close": position_size,
            "canceled_open_orders": canceled_open_orders,
            "order_ref": order.orderRef,
        }

    trade = ib.placeOrder(contract, order)
    rejection_reason = await wait_for_ib_confirmation(trade)
    close_filled = trade_is_filled(trade, qty)

    if rejection_reason and not close_filled:
        return {
            "dry_run": False,
            "status": "rejected",
            "event": str(data.get("event", "")).upper(),
            "action": action,
            "symbol": symbol,
            "sec_type": sec_type,
            "side": side,
            "qty": qty,
            "position_before_close": position_size,
            "canceled_open_orders": canceled_open_orders,
            "order_ref": order.orderRef,
            "order_id": trade_order_id(trade),
            "order_perm_id": trade_perm_id(trade),
            "close_filled": close_filled,
            "error": rejection_reason,
        }

    result_payload = {
        "dry_run": False,
        "status": "submitted" if close_filled else "submitted_awaiting_close_fill",
        "action": action,
        "symbol": symbol,
        "sec_type": sec_type,
        "side": side,
        "qty": qty,
        "position_before_close": position_size,
        "canceled_open_orders": canceled_open_orders,
        "order_ref": order.orderRef,
        "order_id": trade_order_id(trade),
        "order_perm_id": trade_perm_id(trade),
        "close_status": trade_status(trade),
        "close_filled": close_filled,
        "close_fill_price": trade_fill_price(trade, to_float(data.get("price")) or to_float(data.get("entry"))),
        "close_filled_qty": trade_filled_qty(trade),
        "close_exec_ids": trade_execution_ids(trade),
    }
    result_payload = await apply_edge_stop_close_flat_gate(data, result_payload, symbol)

    # Let TWS update portfolio state, then remove leftover TP orders only after
    # the Edge Stop Loss flat gate has succeeded. Prime/legacy behavior is
    # unchanged.
    if (
        close_filled
        and CANCEL_ORPHAN_TARGETS_AFTER_FLAT
        and (
            not is_edge_stop_close(data)
            or result_payload.get("broker_confirmed_flat")
        )
    ):
        await asyncio.sleep(0.50)
        result_payload.update(await cleanup_orphan_targets_if_flat(symbol))

    managed_state_persisted = mark_managed_bridge_close(data, result_payload)
    if is_vixale_edge_payload(data):
        result_payload["managed_state_persisted"] = managed_state_persisted
        if not managed_state_persisted:
            result_payload["status"] = "EDGE_STOP_STATE_PERSISTENCE_FAILED"
            result_payload["critical_reason"] = "EDGE_STOP_STATE_PERSISTENCE_FAILED"
            return result_payload

    if not close_filled and ENABLE_EXECUTION_FILL_MONITOR:
        spawn_execution_monitor(
            monitor_close_fill_confirmation(
                original_data=dict(data),
                close_trade=trade,
                base_result=dict(result_payload),
                symbol=symbol,
                side=side,
                expected_close_qty=qty,
                fallback_price=to_float(data.get("price")) or to_float(data.get("entry")),
            )
        )

    return result_payload


def forward_to_render_sync(data: Dict[str, Any]) -> Dict[str, Any]:
    if not RENDER_WEBHOOK_URL:
        return {"forwarded": False, "reason": "RENDER_WEBHOOK_URL missing"}

    try:
        r = requests.post(RENDER_WEBHOOK_URL, json=data, timeout=10)
        return {
            "forwarded": True,
            "status_code": r.status_code,
            "response": r.text[:500],
        }
    except Exception as exc:
        return {
            "forwarded": False,
            "error": str(exc),
        }


async def forward_to_render(data: Dict[str, Any]) -> Dict[str, Any]:
    # Run blocking requests.post outside the event loop.
    return await asyncio.to_thread(forward_to_render_sync, data)


async def handle_ib_action(data: Dict[str, Any]) -> Dict[str, Any]:
    event = str(data.get("event", "")).upper()
    symbol = str(data.get("symbol", "")).upper().strip()
    side = str(data.get("side", "")).upper().strip()

    async with ib_lock:
        try:
            if event == "SETUP":
                return await place_entry_order(data)

            if event in ["CANCEL_REPLACE", "EOD_RESET", "NEW_DAY_RESET", "CANCEL"]:
                canceled = await cancel_open_orders_for_symbol(symbol, side if side else None)
                return {
                    "status": "canceled_open_orders",
                    "symbol": symbol,
                    "side": side,
                    "canceled_count": canceled,
                    "dry_run": DRY_RUN,
                }

            if event in ["TP", "CLOSE_STOP", "EOD_CLOSE", "NEW_DAY_EMERGENCY_CLOSE"]:
                return await close_position_market(data)

            if event == "ENTRY_FILL":
                return {
                    "status": "entry_fill_received_no_action",
                    "message": "Profit target is attached to the IB parent entry order during SETUP",
                }

            return {
                "status": "unknown_event_no_action",
                "event": event,
                "symbol": symbol,
                "side": side,
            }

        except Exception as exc:
            return {
                "status": "ib_error",
                "event": event,
                "symbol": symbol,
                "side": side,
                "error": str(exc),
                "dry_run": DRY_RUN,
            }


def ib_setup_accepted(ib_result: Dict[str, Any]) -> bool:
    return str(ib_result.get("status", "")).lower() in SETUP_ACCEPTED_STATUSES


def ib_close_accepted(ib_result: Dict[str, Any]) -> bool:
    return (
        str(ib_result.get("status", "")).lower() in CLOSE_ACCEPTED_STATUSES
        and bool(ib_result.get("close_filled"))
    )


def make_cancel_payload(data: Dict[str, Any], ib_result: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["event"] = "CANCEL"

    edge_cancel_reason = str(ib_result.get("cancel_reason") or "").strip()
    reason = (
        edge_cancel_reason
        or ib_result.get("error")
        or ib_result.get("message")
        or ib_result.get("status")
        or "IB rejected or blocked setup"
    )

    payload["reason"] = reason if edge_cancel_reason else f"IB_REJECTED_OR_BLOCKED: {reason}"
    if edge_cancel_reason:
        payload["cancel_scope"] = "PENDING_ONLY"
    payload["ib_status"] = ib_result.get("status", "")
    payload["ib_result"] = ib_result

    return payload


def make_entry_fill_payload(data: Dict[str, Any], ib_result: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["event"] = "ENTRY_FILL"

    fill_price = to_float(ib_result.get("entry_fill_price")) or to_float(data.get("entry")) or to_float(data.get("price"))
    qty = (
        to_int_qty(ib_result.get("target_position_qty"))
        or to_int_qty(ib_result.get("desired_qty"))
        or to_int_qty(ib_result.get("qty"))
        or to_int_qty(data.get("qty"))
        or to_int_qty(ib_result.get("entry_filled_qty"))
    )

    if fill_price > 0:
        payload["entry"] = round_price(fill_price)
        payload["price"] = round_price(fill_price)

    if qty > 0:
        payload["qty"] = qty

    payload["ib_status"] = ib_result.get("status", "")
    payload["ib_order_id"] = ib_result.get("order_id", "")
    payload["ib_order_perm_id"] = ib_result.get("order_perm_id", "")
    payload["ib_order_ref"] = ib_result.get("order_ref", "")
    payload["ib_target_order_id"] = ib_result.get("target_order_id", "")
    payload["ib_target_perm_id"] = ib_result.get("target_perm_id", "")
    payload["ib_target_order_ref"] = ib_result.get("target_order_ref", "")
    payload["ib_entry_status"] = ib_result.get("entry_status", "")
    payload["ib_target_status"] = ib_result.get("target_status", "")
    payload["reason"] = payload.get("reason") or "IB_ENTRY_FILLED"

    return payload



def make_reversal_close_fill_payload(data: Dict[str, Any], ib_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Create the old-side close callback for a one-order Opposite Flip reversal.

    Example: broker is LONG 100 and the new Shrek SETUP wants SHORT 100.
    The bridge submits one SELL 200 market order. That single fill both closes the
    old LONG and opens the new SHORT. Render needs two ordered callbacks:
    CLOSE_STOP LONG first, then ENTRY_FILL SHORT.
    """
    if is_vixale_edge_payload(data):
        return None

    try:
        position_before = float(ib_result.get("position_before_entry", 0) or 0)
    except Exception:
        return None

    new_side = str(data.get("side", "")).upper().strip()
    old_side = "LONG" if position_before > 0 else "SHORT" if position_before < 0 else ""

    if not old_side or old_side == new_side:
        return None

    fill_price = to_float(ib_result.get("entry_fill_price")) or to_float(data.get("price")) or to_float(data.get("entry"))
    old_qty = abs(int(round(position_before)))

    if fill_price <= 0 or old_qty <= 0:
        return None

    payload = dict(data)
    payload["event"] = "CLOSE_STOP"
    payload["side"] = old_side
    payload["price"] = round_price(fill_price)
    payload["qty"] = old_qty
    payload["target"] = 0
    payload["ib_status"] = "submitted"
    payload["ib_order_id"] = ib_result.get("order_id", "")
    payload["ib_close_status"] = "Filled"
    payload["close_filled"] = True
    payload["position_before_close"] = position_before
    payload["position_after_close"] = ib_result.get("desired_position_after_entry", "")
    payload["reason"] = "IB_OPPOSITE_FLIP_REVERSAL_FILL"
    return payload


def make_close_fill_payload(data: Dict[str, Any], ib_result: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)

    close_price = to_float(ib_result.get("close_fill_price")) or to_float(data.get("price")) or to_float(data.get("entry"))
    qty = to_int_qty(ib_result.get("close_filled_qty")) or to_int_qty(ib_result.get("qty")) or to_int_qty(data.get("qty"))

    if close_price > 0:
        payload["price"] = round_price(close_price)

    if qty > 0:
        payload["qty"] = qty

    payload["ib_status"] = ib_result.get("status", "")
    payload["ib_order_id"] = ib_result.get("order_id", "")
    payload["ib_order_perm_id"] = ib_result.get("order_perm_id", "")
    payload["ib_order_ref"] = ib_result.get("order_ref", "")
    payload["ib_close_status"] = ib_result.get("close_status", "")
    payload["close_filled"] = bool(ib_result.get("close_filled"))
    payload["position_after_close"] = ib_result.get("position_after_close", "")
    payload["canceled_orphan_targets"] = ib_result.get("canceled_orphan_targets", 0)
    if is_edge_stop_close(data):
        payload["source"] = "IB_BRIDGE"
        payload["system_id"] = "VIXALE_EDGE"
        payload["broker_confirmed_flat"] = bool(ib_result.get("broker_confirmed_flat"))
    exit_identity = execution_identity_text(
        exec_ids=ib_result.get("close_exec_ids") or [],
        perm_id=ib_result.get("order_perm_id"),
        order_id=ib_result.get("order_id"),
        order_ref_value=ib_result.get("order_ref"),
    )
    if exit_identity:
        payload["exit_execution_id"] = exit_identity
        setup_id = str(data.get("setup_id") or "").strip()
        payload["reconciliation_id"] = f"{setup_id or payload.get('symbol') or ''}:{exit_identity}"
    if is_vixale_edge_payload(data) and str(data.get("event") or "").upper() == "CLOSE_STOP":
        payload["reason"] = "IB_STOP_CLOSE_EXECUTION_CONFIRMED"
    else:
        payload["reason"] = payload.get("reason") or "IB_CLOSE_FILLED"

    return payload


async def monitor_entry_fill_confirmation(
    original_data: Dict[str, Any],
    entry_trade: Any,
    target_trade: Any,
    base_result: Dict[str, Any],
    symbol: str,
    side: str,
    expected_entry_order_qty: int,
    final_position_qty: int,
    entry_reference_price: float,
    target_price: float,
) -> None:
    poll = max(ENTRY_FILL_MONITOR_POLL_SECONDS, 0.10)
    max_wait = max(ENTRY_FILL_MONITOR_SECONDS, poll)
    waited = 0.0
    partial_seen_at: Optional[float] = None

    print(
        f"[ENTRY FILL MONITOR START] symbol={symbol} side={side} "
        f"order_id={trade_order_id(entry_trade)} expected_order_qty={expected_entry_order_qty}"
    )

    while waited <= max_wait:
        try:
            filled_qty = trade_filled_qty(entry_trade)
            fully_filled = trade_is_filled(entry_trade, expected_entry_order_qty)

            if fully_filled:
                if is_vixale_edge_payload(original_data) and target_trade is None:
                    print(
                        f"[ENTRY FILL MONITOR CRITICAL] symbol={symbol} side={side} "
                        "Edge entry filled without its mandatory target; publication withheld"
                    )
                    return

                result = dict(base_result)
                result["status"] = (
                    "submitted_with_attached_target"
                    if target_trade is not None
                    else "submitted_without_target_missing_target_price"
                )
                result["entry_status"] = trade_status(entry_trade)
                result["entry_filled"] = True
                result["entry_fill_price"] = trade_fill_price(entry_trade, entry_reference_price)
                result["entry_filled_qty"] = filled_qty
                result["target_position_qty"] = final_position_qty
                result["desired_qty"] = final_position_qty

                if target_trade is not None:
                    result["target_status"] = trade_status(target_trade)
                    result["target_working"] = trade_is_working_or_filled(target_trade)

                    if not result["target_working"]:
                        contract = await qualify_contract(original_data)
                        result = await repair_entry_target_for_actual_position(
                            original_data=dict(original_data),
                            contract=contract,
                            entry_trade=entry_trade,
                            target_trade=target_trade,
                            base_result=result,
                            symbol=symbol,
                            side=side,
                            requested_entry_order_qty=expected_entry_order_qty,
                            entry_reference_price=entry_reference_price,
                            target_price=target_price,
                        )
                        if not ib_setup_accepted(result):
                            if FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL:
                                cancel_payload = make_cancel_payload(original_data, result)
                                render_result = await forward_to_render(cancel_payload)
                                print(f"[ENTRY FILL MONITOR CANCEL RESULT] symbol={symbol} side={side} {render_result}")
                            return

                mark_managed_position(original_data, result)

                reversal_close_payload = make_reversal_close_fill_payload(original_data, result)
                if reversal_close_payload is not None:
                    reversal_result = await forward_to_render(reversal_close_payload)
                    print(f"[ENTRY FILL MONITOR REVERSAL CLOSE RESULT] symbol={symbol} side={side} {reversal_result}")

                render_payload = make_entry_fill_payload(original_data, result)
                render_payload["entry_filled"] = True
                render_result = await forward_to_render(render_payload)
                print(f"[ENTRY FILL MONITOR RENDER RESULT] symbol={symbol} side={side} {render_result}")

                # Repaired targets start their own monitor inside the repair helper.
                if (
                    target_trade is not None
                    and result.get("status") != "submitted_with_repaired_target"
                    and ENABLE_TARGET_FILL_MONITOR
                ):
                    spawn_execution_monitor(
                        monitor_target_fill(
                            original_data=dict(original_data),
                            target_trade=target_trade,
                            symbol=symbol,
                            side=side,
                            qty=final_position_qty,
                            entry_fill_price=to_float(result.get("entry_fill_price")),
                            target_price=target_price,
                        )
                    )

                print(
                    f"[ENTRY FILL MONITOR DONE] symbol={symbol} side={side} "
                    f"filled={result.get('entry_filled_qty')}@{result.get('entry_fill_price')}"
                )
                return

            # A real partial fill is not a rejection. Give it a short grace, then
            # cancel the remainder and repair the target for the actual position.
            if target_trade is not None and filled_qty > 0:
                if partial_seen_at is None:
                    partial_seen_at = waited

                if waited - partial_seen_at >= max(PARTIAL_FILL_GRACE_SECONDS, 0.0):
                    contract = await qualify_contract(original_data)
                    result = await repair_entry_target_for_actual_position(
                        original_data=dict(original_data),
                        contract=contract,
                        entry_trade=entry_trade,
                        target_trade=target_trade,
                        base_result=dict(base_result),
                        symbol=symbol,
                        side=side,
                        requested_entry_order_qty=expected_entry_order_qty,
                        entry_reference_price=entry_reference_price,
                        target_price=target_price,
                    )

                    if ib_setup_accepted(result) and result.get("entry_filled"):
                        mark_managed_position(original_data, result)

                        reversal_close_payload = make_reversal_close_fill_payload(original_data, result)
                        if reversal_close_payload is not None:
                            reversal_result = await forward_to_render(reversal_close_payload)
                            print(f"[ENTRY FILL MONITOR REVERSAL CLOSE RESULT] symbol={symbol} side={side} {reversal_result}")

                        render_payload = make_entry_fill_payload(original_data, result)
                        render_payload["entry_filled"] = True
                        render_result = await forward_to_render(render_payload)
                        print(f"[ENTRY FILL MONITOR RENDER RESULT] symbol={symbol} side={side} {render_result}")
                    elif FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL:
                        cancel_payload = make_cancel_payload(original_data, result)
                        render_result = await forward_to_render(cancel_payload)
                        print(f"[ENTRY FILL MONITOR CANCEL RESULT] symbol={symbol} side={side} {render_result}")
                    return

            rejection_reason = trade_rejection_reason(entry_trade, target_trade)
            status = trade_status(entry_trade).lower()
            if rejection_reason or status in ORDER_BAD_STATUSES:
                # If any shares actually filled, first attempt to protect or flatten
                # them; never classify a real fill as a harmless rejected setup.
                if target_trade is not None and filled_qty > 0:
                    contract = await qualify_contract(original_data)
                    result = await repair_entry_target_for_actual_position(
                        original_data=dict(original_data),
                        contract=contract,
                        entry_trade=entry_trade,
                        target_trade=target_trade,
                        base_result=dict(base_result),
                        symbol=symbol,
                        side=side,
                        requested_entry_order_qty=expected_entry_order_qty,
                        entry_reference_price=entry_reference_price,
                        target_price=target_price,
                    )
                    if ib_setup_accepted(result) and result.get("entry_filled"):
                        mark_managed_position(original_data, result)
                        reversal_close_payload = make_reversal_close_fill_payload(original_data, result)
                        if reversal_close_payload is not None:
                            reversal_result = await forward_to_render(reversal_close_payload)
                            print(f"[ENTRY FILL MONITOR REVERSAL CLOSE RESULT] symbol={symbol} side={side} {reversal_result}")
                        render_payload = make_entry_fill_payload(original_data, result)
                        render_payload["entry_filled"] = True
                        render_result = await forward_to_render(render_payload)
                        print(f"[ENTRY FILL MONITOR RENDER RESULT] symbol={symbol} side={side} {render_result}")
                    elif FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL:
                        cancel_payload = make_cancel_payload(original_data, result)
                        render_result = await forward_to_render(cancel_payload)
                        print(f"[ENTRY FILL MONITOR CANCEL RESULT] symbol={symbol} side={side} {render_result}")
                    return

                result = dict(base_result)
                result["status"] = "rejected"
                result["error"] = rejection_reason or f"entry_status={trade_status(entry_trade)}"
                result["entry_status"] = trade_status(entry_trade)
                result["entry_filled"] = False

                if FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL:
                    cancel_payload = make_cancel_payload(original_data, result)
                    render_result = await forward_to_render(cancel_payload)
                    print(f"[ENTRY FILL MONITOR CANCEL RESULT] symbol={symbol} side={side} {render_result}")

                print(
                    f"[ENTRY FILL MONITOR STOP] symbol={symbol} side={side} "
                    f"status={trade_status(entry_trade)} reason={rejection_reason}"
                )
                return
        except Exception as exc:
            print(f"[ENTRY FILL MONITOR ERROR] symbol={symbol} side={side} error={exc}")
            return

        await asyncio.sleep(poll)
        waited += poll

    filled_qty = trade_filled_qty(entry_trade)
    print(
        f"[ENTRY FILL MONITOR TIMEOUT] symbol={symbol} side={side} "
        f"order_id={trade_order_id(entry_trade)} status={trade_status(entry_trade)} filled_qty={filled_qty}"
    )

    if filled_qty <= 0:
        try:
            canceled = await cancel_open_orders_for_symbol(symbol, side)
            result = dict(base_result)
            result["status"] = "entry_fill_timeout_canceled"
            result["error"] = f"No confirmed fill within {max_wait:.1f}s; canceled_orders={canceled}"
            result["entry_status"] = trade_status(entry_trade)
            result["entry_filled"] = False

            if FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL:
                cancel_payload = make_cancel_payload(original_data, result)
                render_result = await forward_to_render(cancel_payload)
                print(f"[ENTRY FILL TIMEOUT CANCEL RESULT] symbol={symbol} side={side} {render_result}")
        except Exception as exc:
            print(f"[ENTRY FILL TIMEOUT CANCEL ERROR] symbol={symbol} side={side} error={exc}")
    elif target_trade is not None:
        try:
            contract = await qualify_contract(original_data)
            result = await repair_entry_target_for_actual_position(
                original_data=dict(original_data),
                contract=contract,
                entry_trade=entry_trade,
                target_trade=target_trade,
                base_result=dict(base_result),
                symbol=symbol,
                side=side,
                requested_entry_order_qty=expected_entry_order_qty,
                entry_reference_price=entry_reference_price,
                target_price=target_price,
            )
            if ib_setup_accepted(result) and result.get("entry_filled"):
                mark_managed_position(original_data, result)
                reversal_close_payload = make_reversal_close_fill_payload(original_data, result)
                if reversal_close_payload is not None:
                    reversal_result = await forward_to_render(reversal_close_payload)
                    print(f"[ENTRY FILL MONITOR REVERSAL CLOSE RESULT] symbol={symbol} side={side} {reversal_result}")
                render_payload = make_entry_fill_payload(original_data, result)
                render_payload["entry_filled"] = True
                render_result = await forward_to_render(render_payload)
                print(f"[ENTRY FILL MONITOR RENDER RESULT] symbol={symbol} side={side} {render_result}")
            elif FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL:
                cancel_payload = make_cancel_payload(original_data, result)
                render_result = await forward_to_render(cancel_payload)
                print(f"[ENTRY FILL MONITOR CANCEL RESULT] symbol={symbol} side={side} {render_result}")
        except Exception as exc:
            print(f"[ENTRY FILL PARTIAL REPAIR ERROR] symbol={symbol} side={side} error={exc}")
    else:
        print(
            f"[ENTRY FILL PARTIAL CRITICAL] symbol={symbol} side={side} filled_qty={filled_qty}. "
            "No target was configured; manual TWS reconciliation required."
        )


async def monitor_close_fill_confirmation(
    original_data: Dict[str, Any],
    close_trade: Any,
    base_result: Dict[str, Any],
    symbol: str,
    side: str,
    expected_close_qty: int,
    fallback_price: float,
) -> None:
    poll = max(CLOSE_FILL_MONITOR_POLL_SECONDS, 0.10)
    max_wait = max(CLOSE_FILL_MONITOR_SECONDS, poll)
    waited = 0.0

    print(
        f"[CLOSE FILL MONITOR START] symbol={symbol} side={side} "
        f"order_id={trade_order_id(close_trade)} expected_qty={expected_close_qty}"
    )

    while waited <= max_wait:
        try:
            if trade_is_filled(close_trade, expected_close_qty):
                result = dict(base_result)
                result["status"] = "submitted"
                result["close_status"] = trade_status(close_trade)
                result["close_filled"] = True
                result["close_fill_price"] = trade_fill_price(close_trade, fallback_price)
                result["close_filled_qty"] = trade_filled_qty(close_trade)
                result["order_perm_id"] = trade_perm_id(close_trade)
                result["close_exec_ids"] = trade_execution_ids(close_trade)

                edge_close = is_vixale_edge_payload(original_data)
                edge_stop_close = is_edge_stop_close(original_data)
                result = await apply_edge_stop_close_flat_gate(
                    original_data,
                    result,
                    symbol,
                )
                managed_state_persisted = mark_managed_bridge_close(
                    original_data,
                    result,
                )
                result["managed_state_persisted"] = managed_state_persisted
                if edge_close and not managed_state_persisted:
                    print(
                        f"[CLOSE FILL MONITOR CRITICAL] symbol={symbol} side={side} "
                        "status=EDGE_STOP_STATE_PERSISTENCE_FAILED. "
                        "Render callback withheld; managed state was not cleared"
                    )
                    return

                if (
                    edge_stop_close
                    and not result.get("broker_confirmed_flat")
                ):
                    print(
                        f"[CLOSE FILL MONITOR CRITICAL] symbol={symbol} side={side} "
                        f"status=EDGE_STOP_CLOSE_POSITION_NOT_FLAT "
                        f"position_after_close={result.get('position_after_close')}. "
                        "CLOSE_STOP and RECONCILE_FLAT callbacks withheld; managed state retained"
                    )
                    return

                if CANCEL_ORPHAN_TARGETS_AFTER_FLAT:
                    await asyncio.sleep(0.50)
                    result.update(await cleanup_orphan_targets_if_flat(symbol))

                if not edge_close:
                    clear_managed_position(symbol)

                render_payload = make_close_fill_payload(original_data, result)
                if (
                    edge_stop_close
                    and not str(render_payload.get("exit_execution_id") or "").strip()
                ):
                    print(
                        f"[CLOSE FILL MONITOR CRITICAL] symbol={symbol} side={side} "
                        "Edge Stop Loss execution identity is unavailable; "
                        "Render callback withheld and managed state retained"
                    )
                    return
                render_result = await forward_to_render(render_payload)
                print(f"[CLOSE FILL MONITOR RENDER RESULT] symbol={symbol} side={side} {render_result}")
                if edge_close and render_delivery_succeeded(render_result):
                    clear_managed_position(symbol)

                event = str(original_data.get("event", "")).upper()
                if not edge_stop_close and should_send_flat_reconcile(event, result):
                    reconcile_payload = make_reconcile_flat_payload(original_data, result)
                    reconcile_result = await forward_to_render(reconcile_payload)
                    print(f"[CLOSE FILL MONITOR RECONCILE RESULT] symbol={symbol} {reconcile_result}")

                print(
                    f"[CLOSE FILL MONITOR DONE] symbol={symbol} side={side} "
                    f"filled={result.get('close_filled_qty')}@{result.get('close_fill_price')}"
                )
                return

            rejection_reason = trade_rejection_reason(close_trade)
            status = trade_status(close_trade).lower()
            if rejection_reason or status in ORDER_BAD_STATUSES:
                print(
                    f"[CLOSE FILL MONITOR STOP] symbol={symbol} side={side} "
                    f"status={trade_status(close_trade)} reason={rejection_reason}. "
                    "Open position remains in Render because TWS did not confirm a close fill."
                )
                return
        except Exception as exc:
            print(f"[CLOSE FILL MONITOR ERROR] symbol={symbol} side={side} error={exc}")
            return

        await asyncio.sleep(poll)
        waited += poll

    print(
        f"[CLOSE FILL MONITOR TIMEOUT CRITICAL] symbol={symbol} side={side} "
        f"order_id={trade_order_id(close_trade)} status={trade_status(close_trade)} "
        f"filled_qty={trade_filled_qty(close_trade)}. No false CLOSED callback was sent."
    )


def make_reconcile_flat_payload(data: Dict[str, Any], ib_result: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["event"] = "RECONCILE_FLAT"
    payload["symbol"] = str(data.get("symbol", "")).upper().strip()
    # Leave side empty on purpose: app.js v4 will remove all stale Open Positions
    # rows for the symbol after IB confirms the symbol is flat.
    payload["side"] = ""
    payload["qty"] = 0
    payload["reason"] = "IB_CONFIRMED_FLAT_CLEANUP"
    payload["ib_status"] = ib_result.get("status", "")
    payload["position_after_close"] = ib_result.get("position_after_close", "")
    payload["canceled_orphan_targets"] = ib_result.get("canceled_orphan_targets", 0)
    return payload


def should_send_flat_reconcile(event: str, ib_result: Dict[str, Any]) -> bool:
    if not ENABLE_RENDER_FLAT_RECONCILE:
        return False

    event = event.upper()
    if event not in RECONCILE_FLAT_EVENTS:
        return False

    if not ib_close_accepted(ib_result):
        return False

    try:
        position_after = float(ib_result.get("position_after_close", 999999) or 999999)
    except Exception:
        return False

    return abs(position_after) <= 0.000001


def should_forward_to_render(event: str, ib_result: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]]]:
    event = event.upper()
    status = str(ib_result.get("status", "")).lower()

    if event == "SETUP":
        if ib_setup_accepted(ib_result):
            # Execution-first: only an actual TWS fill may create OPEN in Render.
            # Submitted / PreSubmitted / dry-run orders do not produce public OPEN.
            if ib_result.get("entry_filled"):
                return True, "ENTRY_FILL"

            return False, None

        if FORWARD_REJECTED_SETUPS_TO_RENDER_AS_CANCEL:
            return True, "CANCEL"

        return False, None

    if event in ["TP", "CLOSE_STOP", "EOD_CLOSE", "NEW_DAY_EMERGENCY_CLOSE"]:
        if ib_close_accepted(ib_result):
            return True, "CLOSE_FILL"

        if status in ("no_position", "no_matching_position") and FORWARD_NO_POSITION_CLOSES_TO_RENDER:
            return True, None

        return False, None

    if event in ["CANCEL_REPLACE", "EOD_RESET", "NEW_DAY_RESET", "CANCEL"]:
        return True, None

    # Unknown / no-op events should not pollute Telegram/Sheets.
    return False, None


async def process_signal_background(data: Dict[str, Any]) -> None:
    event = str(data.get("event", "")).upper()
    symbol = str(data.get("symbol", "")).upper().strip()
    side = str(data.get("side", "")).upper().strip()

    print(f"[BG START] event={event} symbol={symbol} side={side}")

    ib_result = await handle_ib_action(data)
    print(f"[IB RESULT] {ib_result}")

    if event == "SETUP" and ib_setup_accepted(ib_result) and ib_result.get("entry_filled"):
        mark_managed_position(data, ib_result)

    edge_close = is_vixale_edge_payload(data) and event in ["TP", "CLOSE_STOP", "EOD_CLOSE", "NEW_DAY_EMERGENCY_CLOSE"]
    edge_stop_close = is_edge_stop_close(data)
    if (
        event in ["TP", "CLOSE_STOP", "EOD_CLOSE", "NEW_DAY_EMERGENCY_CLOSE"]
        and ib_close_accepted(ib_result)
        and not edge_close
    ):
        clear_managed_position(symbol)

    # Execution-first architecture: successful fills must be echoed back to Render.
    # app.js publishes Telegram/Sheets/dashboard only from these bridge callbacks.
    if edge_stop_close and ib_result.get("managed_state_persisted") is False:
        print(
            f"[RENDER SKIPPED CRITICAL] event={event} symbol={symbol} side={side} "
            "status=EDGE_STOP_STATE_PERSISTENCE_FAILED. "
            "Close identity/state must be durable before callback publication"
        )
        return

    if edge_stop_close and not ib_result.get("broker_confirmed_flat"):
        print(
            f"[RENDER SKIPPED CRITICAL] event={event} symbol={symbol} side={side} "
            f"status={ib_result.get('status')} "
            f"position_after_close={ib_result.get('position_after_close')}. "
            "Broker-flat Edge Stop Loss confirmation is required"
        )
        return

    forward, transform = should_forward_to_render(event, ib_result)

    if not forward:
        print(f"[RENDER SKIPPED] event={event} symbol={symbol} side={side} ib_status={ib_result.get('status')}")
        print(f"[BG DONE] event={event} symbol={symbol} side={side}")
        return

    if transform == "CANCEL":
        render_payload = make_cancel_payload(data, ib_result)
    elif transform == "ENTRY_FILL":
        reversal_close_payload = make_reversal_close_fill_payload(data, ib_result)
        if reversal_close_payload is not None:
            reversal_result = await forward_to_render(reversal_close_payload)
            print(f"[REVERSAL CLOSE RENDER RESULT] symbol={symbol} side={side} {reversal_result}")
        render_payload = make_entry_fill_payload(data, ib_result)
    elif transform == "CLOSE_FILL":
        render_payload = make_close_fill_payload(data, ib_result)
    else:
        render_payload = data

    if (
        edge_stop_close
        and not str(render_payload.get("exit_execution_id") or "").strip()
    ):
        print(
            f"[RENDER SKIPPED CRITICAL] event={event} symbol={symbol} side={side} "
            "Edge Stop Loss execution identity is unavailable"
        )
        return

    render_result = await forward_to_render(render_payload)
    print(f"[RENDER RESULT] {render_result}")
    if edge_close and ib_close_accepted(ib_result):
        mark_managed_bridge_close(data, ib_result)
        if render_delivery_succeeded(render_result):
            clear_managed_position(symbol)

    if not edge_stop_close and should_send_flat_reconcile(event, ib_result):
        reconcile_payload = make_reconcile_flat_payload(data, ib_result)
        reconcile_result = await forward_to_render(reconcile_payload)
        print(f"[RECONCILE_FLAT RENDER RESULT] symbol={symbol} {reconcile_result}")

    print(f"[BG DONE] event={event} symbol={symbol} side={side}")


def render_quote_update_url() -> str:
    if RENDER_QUOTE_URL:
        return RENDER_QUOTE_URL.rstrip('/')

    if not RENDER_WEBHOOK_URL:
        return ''

    base = RENDER_WEBHOOK_URL.rstrip('/')
    if base.endswith('/tv'):
        base = base[:-3]
    return f"{base}/bridge/quotes"


def valid_price(value: Any) -> float:
    try:
        price = float(value)
        if price != price or price <= 0:  # NaN or non-positive
            return 0.0
        return price
    except Exception:
        return 0.0


def ticker_price_snapshot(ticker: Any) -> Dict[str, Any]:
    """Return the best available TWS/API quote snapshot.

    Important IBKR behavior:
    - Without API real-time subscriptions, TWS may print Error 10089 and then
      still provide delayed fields such as delayedLast / delayedBid / delayedAsk.
    - The previous quote pusher only checked live fields (last/bid/ask/close),
      so delayed API data could arrive but never be sent to Render, making the
      dashboard stale.
    """
    live_last = valid_price(getattr(ticker, 'last', 0.0))
    live_close = valid_price(getattr(ticker, 'close', 0.0))
    live_bid = valid_price(getattr(ticker, 'bid', 0.0))
    live_ask = valid_price(getattr(ticker, 'ask', 0.0))

    delayed_last = valid_price(getattr(ticker, 'delayedLast', 0.0))
    delayed_close = valid_price(getattr(ticker, 'delayedClose', 0.0))
    delayed_bid = valid_price(getattr(ticker, 'delayedBid', 0.0))
    delayed_ask = valid_price(getattr(ticker, 'delayedAsk', 0.0))

    market_price = 0.0
    try:
        market_price = valid_price(ticker.marketPrice())
    except Exception:
        market_price = 0.0

    # Prefer live/top fields first when they are actually present.
    if market_price > 0 and (live_last > 0 or live_bid > 0 or live_ask > 0 or live_close > 0):
        price = market_price
        source = 'TWS'
    elif live_last > 0:
        price = live_last
        source = 'TWS'
    elif live_bid > 0 and live_ask > 0:
        price = (live_bid + live_ask) / 2.0
        source = 'TWS'
    elif live_close > 0:
        price = live_close
        source = 'TWS'
    # Then fall back to IBKR delayed fields. This is the important 10089 fix.
    elif delayed_last > 0:
        price = delayed_last
        source = 'TWS delayed'
    elif delayed_bid > 0 and delayed_ask > 0:
        price = (delayed_bid + delayed_ask) / 2.0
        source = 'TWS delayed'
    elif delayed_close > 0:
        price = delayed_close
        source = 'TWS delayed'
    elif market_price > 0:
        # Last resort. Some ib_async versions may return delayed marketPrice()
        # even when live fields are empty. Mark it according to requested mode.
        price = market_price
        source = 'TWS delayed' if int(QUOTE_MARKET_DATA_TYPE) in (3, 4) else 'TWS'
    else:
        price = 0.0
        source = 'TWS'

    return {
        'price': round_price(price) if price > 0 else 0.0,
        'source': source,
        'last': live_last or delayed_last,
        'bid': live_bid or delayed_bid,
        'ask': live_ask or delayed_ask,
        'close': live_close or delayed_close,
        'live_last': live_last,
        'live_bid': live_bid,
        'live_ask': live_ask,
        'live_close': live_close,
        'delayed_last': delayed_last,
        'delayed_bid': delayed_bid,
        'delayed_ask': delayed_ask,
        'delayed_close': delayed_close,
    }


def best_ticker_price(ticker: Any) -> float:
    return float(ticker_price_snapshot(ticker).get('price') or 0.0)


def render_quote_payload(symbols: List[str]) -> Dict[str, Any]:
    now_dt = datetime.now(ZoneInfo(RTH_TIMEZONE))
    now = now_dt.isoformat()
    now_ms = int(datetime.now().timestamp() * 1000)
    quotes = []

    for symbol in symbols:
        ticker = _quote_tickers.get(symbol)
        if ticker is None:
            continue

        snap = ticker_price_snapshot(ticker)
        price = float(snap.get('price') or 0.0)
        if price <= 0:
            continue

        quotes.append({
            'symbol': symbol,
            'price': price,
            'last': snap.get('last') or 0.0,
            'bid': snap.get('bid') or 0.0,
            'ask': snap.get('ask') or 0.0,
            'close': snap.get('close') or 0.0,
            'live_last': snap.get('live_last') or 0.0,
            'live_bid': snap.get('live_bid') or 0.0,
            'live_ask': snap.get('live_ask') or 0.0,
            'live_close': snap.get('live_close') or 0.0,
            'delayed_last': snap.get('delayed_last') or 0.0,
            'delayed_bid': snap.get('delayed_bid') or 0.0,
            'delayed_ask': snap.get('delayed_ask') or 0.0,
            'delayed_close': snap.get('delayed_close') or 0.0,
            'source': snap.get('source') or 'TWS',
            'market_data_type': QUOTE_MARKET_DATA_TYPE,
            'timestamp': now,
            'timestamp_ms': now_ms,
        })

    return {
        'source': 'IB_BRIDGE_TWS_QUOTES',
        'timestamp': now,
        'timestamp_ms': now_ms,
        'market_data_type': QUOTE_MARKET_DATA_TYPE,
        'quotes': quotes,
    }


def forward_quotes_to_render_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    url = render_quote_update_url()
    if not url:
        return {'forwarded': False, 'reason': 'quote url missing'}

    try:
        r = requests.post(url, json=payload, timeout=5)
        return {
            'forwarded': True,
            'status_code': r.status_code,
            'response': r.text[:500],
        }
    except Exception as exc:
        return {'forwarded': False, 'error': str(exc)}


async def forward_quotes_to_render(payload: Dict[str, Any]) -> Dict[str, Any]:
    return await asyncio.to_thread(forward_quotes_to_render_sync, payload)


def managed_quote_symbols() -> List[str]:
    symbols = set()

    managed = load_managed_positions()
    for symbol, row in managed.items():
        sec_type = str(row.get('sec_type') or row.get('last_payload', {}).get('sec_type') or 'STK').upper()
        if sec_type == 'STK':
            clean = str(symbol or row.get('symbol') or '').upper().strip()
            if clean:
                symbols.add(clean)

    if not QUOTE_ONLY_MANAGED_POSITIONS:
        try:
            for pos in ib.positions():
                contract = getattr(pos, 'contract', None)
                sec_type = str(getattr(contract, 'secType', '') or '').upper()
                symbol = str(getattr(contract, 'symbol', '') or '').upper().strip()
                if sec_type == 'STK' and symbol and abs(float(getattr(pos, 'position', 0.0) or 0.0)) > 0.000001:
                    symbols.add(symbol)
        except Exception as exc:
            print(f"[QUOTE SYMBOLS ERROR] {exc}")

    return sorted(symbols)


async def ensure_quote_subscriptions(symbols: List[str]) -> None:
    await ensure_ib_connected()

    try:
        ib.reqMarketDataType(int(QUOTE_MARKET_DATA_TYPE))
    except Exception as exc:
        print(f"[QUOTE MARKET DATA TYPE ERROR] {exc}")

    wanted = {str(s or '').upper().strip() for s in symbols if str(s or '').strip()}

    # Cancel subscriptions that are no longer needed.
    for symbol in list(_quote_tickers.keys()):
        if symbol in wanted:
            continue
        try:
            contract = _quote_contracts.get(symbol)
            if contract is not None:
                ib.cancelMktData(contract)
        except Exception as exc:
            print(f"[QUOTE CANCEL ERROR] symbol={symbol} error={exc}")
        _quote_tickers.pop(symbol, None)
        _quote_contracts.pop(symbol, None)

    # Add new subscriptions.
    for symbol in sorted(wanted):
        if symbol in _quote_tickers:
            continue
        try:
            contract = await qualify_contract({'symbol': symbol, 'sec_type': 'STK'})
            ticker = ib.reqMktData(contract, '', False, False)
            _quote_contracts[symbol] = contract
            _quote_tickers[symbol] = ticker
            print(f"[QUOTE SUBSCRIBE] symbol={symbol}")
        except Exception as exc:
            print(f"[QUOTE SUBSCRIBE ERROR] symbol={symbol} error={exc}")


async def live_quote_push_loop() -> None:
    poll = max(QUOTE_PUSH_POLL_SECONDS, 2.0)
    print(f"[QUOTE PUSH START] enabled={ENABLE_RENDER_QUOTE_PUSH} poll={poll}s url={render_quote_update_url() or 'missing'} market_data_type={QUOTE_MARKET_DATA_TYPE}")

    while True:
        try:
            if ENABLE_RENDER_QUOTE_PUSH:
                async with ib_lock:
                    symbols = managed_quote_symbols()
                    await ensure_quote_subscriptions(symbols)

                # Let TWS update newly-created tickers without holding the order lock.
                await asyncio.sleep(0.25)

                payload = render_quote_payload(symbols)
                if payload.get('quotes'):
                    result = await forward_quotes_to_render(payload)
                    print(f"[QUOTE PUSH] symbols={len(payload.get('quotes', []))} result={result}")
        except Exception as exc:
            print(f"[QUOTE PUSH ERROR] {exc}")

        await asyncio.sleep(poll)


def managed_order_identity(row: Dict[str, Any], kind: str) -> Dict[str, Any]:
    nested_key = "target_order" if kind == "target" else "bridge_close_order"
    nested = row.get(nested_key) if isinstance(row.get(nested_key), dict) else {}
    if kind == "target":
        return {
            "order_id": nested.get("order_id") or row.get("ib_target_order_id"),
            "perm_id": nested.get("perm_id") or row.get("ib_target_perm_id"),
            "order_ref": nested.get("order_ref") or row.get("ib_target_order_ref"),
            "expected_qty": to_float(nested.get("expected_qty")) or to_float(row.get("qty")),
        }
    reservation = (
        row.get("close_reservation")
        if isinstance(row.get("close_reservation"), dict)
        else {}
    )
    return {
        "order_id": (
            nested.get("order_id")
            or reservation.get("order_id")
            or row.get("ib_close_order_id")
        ),
        "perm_id": (
            nested.get("perm_id")
            or reservation.get("perm_id")
            or row.get("ib_close_perm_id")
        ),
        "order_ref": (
            nested.get("order_ref")
            or reservation.get("order_ref")
            or row.get("ib_close_order_ref")
        ),
        "expected_qty": (
            to_float(nested.get("filled_qty"))
            or to_float(reservation.get("remaining_qty"))
            or to_float(row.get("qty"))
        ),
    }


def identity_matches(
    actual_order_id: Any,
    actual_perm_id: Any,
    actual_order_ref: Any,
    expected: Dict[str, Any],
) -> bool:
    expected_perm_id = expected.get("perm_id")
    if expected_perm_id not in (None, "", 0, "0"):
        return str(actual_perm_id or "") == str(expected_perm_id)

    expected_order_id = expected.get("order_id")
    if expected_order_id not in (None, "", 0, "0"):
        return str(actual_order_id or "") == str(expected_order_id)

    expected_order_ref = str(expected.get("order_ref") or "").upper().strip()
    if expected_order_ref:
        return str(actual_order_ref or "").upper().strip() == expected_order_ref

    return False


def uses_order_ref_identity_fallback(expected: Dict[str, Any]) -> bool:
    return (
        expected.get("perm_id") in (None, "", 0, "0")
        and expected.get("order_id") in (None, "", 0, "0")
        and bool(str(expected.get("order_ref") or "").strip())
    )


def parse_execution_time(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if value in (None, ""):
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def entry_filled_time(row: Dict[str, Any]) -> Optional[datetime]:
    entry_order = row.get("entry_order") if isinstance(row.get("entry_order"), dict) else {}
    return parse_execution_time(row.get("entry_filled_at") or entry_order.get("filled_at"))


def execution_at_or_after_entry(value: Any, row: Dict[str, Any]) -> bool:
    execution_time = parse_execution_time(value)
    entry_time = entry_filled_time(row)
    if execution_time is None or entry_time is None:
        return False

    comparable_execution = execution_time
    comparable_entry = entry_time
    if comparable_execution.tzinfo is None and comparable_entry.tzinfo is not None:
        comparable_execution = comparable_execution.replace(tzinfo=comparable_entry.tzinfo)
    elif comparable_execution.tzinfo is not None and comparable_entry.tzinfo is None:
        comparable_entry = comparable_entry.replace(tzinfo=comparable_execution.tzinfo)
    return comparable_execution >= comparable_entry


def normalized_execution_action(value: Any) -> str:
    action = str(value or "").upper().strip()
    if action in ("BOT", "BUY"):
        return "BUY"
    if action in ("SLD", "SELL"):
        return "SELL"
    return action


def expected_exit_action(row: Dict[str, Any]) -> str:
    return "SELL" if str(row.get("side") or "").upper().strip() == "LONG" else "BUY"


def trade_contract_symbol(trade: Any) -> str:
    return str(getattr(getattr(trade, "contract", None), "symbol", "") or "").upper().strip()


def trade_execution_ids(trade: Any) -> List[str]:
    values = []
    for fill in getattr(trade, "fills", []) or []:
        exec_id = str(getattr(getattr(fill, "execution", None), "execId", "") or "").strip()
        if exec_id:
            values.append(exec_id)
    return sorted(set(values))


def trade_execution_times(trade: Any) -> List[datetime]:
    values = []
    for fill in getattr(trade, "fills", []) or []:
        execution_time = parse_execution_time(
            getattr(getattr(fill, "execution", None), "time", None)
            or getattr(fill, "time", None)
        )
        if execution_time is not None:
            values.append(execution_time)
    return values


def execution_identity_text(
    *,
    exec_ids: Optional[List[str]] = None,
    perm_id: Any = None,
    order_id: Any = None,
    order_ref_value: Any = None,
) -> str:
    if exec_ids:
        return "EXEC:" + ",".join(sorted(set(str(value) for value in exec_ids if value)))
    if perm_id not in (None, "", 0, "0"):
        return f"PERM:{perm_id}"
    if order_id not in (None, "", 0, "0"):
        return f"ORDER:{order_id}"
    if str(order_ref_value or "").strip():
        return f"REF:{str(order_ref_value).upper().strip()}"
    return ""


def trade_execution_evidence(
    trade: Any,
    row: Dict[str, Any],
    expected: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    if not identity_matches(
        trade_order_id(trade),
        trade_perm_id(trade),
        trade_order_ref_value(trade),
        expected,
    ):
        return None

    if trade_contract_symbol(trade) != str(row.get("symbol") or "").upper().strip():
        return None
    if normalized_execution_action(trade_action(trade)) != expected_exit_action(row):
        return None

    if uses_order_ref_identity_fallback(expected):
        execution_times = trade_execution_times(trade)
        if not execution_times or not all(
            execution_at_or_after_entry(execution_time, row)
            for execution_time in execution_times
        ):
            return None

    qty = trade_filled_qty(trade)
    expected_qty = to_float(expected.get("expected_qty"))
    if not trade_is_filled(trade, expected_qty) or qty <= 0:
        return None
    if expected_qty > 0 and qty + 0.000001 < expected_qty:
        return None

    price = trade_fill_price(trade)
    if price <= 0:
        return None

    exec_ids = trade_execution_ids(trade)
    identity = execution_identity_text(
        exec_ids=exec_ids,
        perm_id=trade_perm_id(trade),
        order_id=trade_order_id(trade),
        order_ref_value=trade_order_ref_value(trade),
    )
    if not identity:
        return None
    return {
        "identity": identity,
        "price": price,
        "qty": qty,
        "order_id": trade_order_id(trade),
        "perm_id": trade_perm_id(trade),
        "order_ref": trade_order_ref_value(trade),
        "status": trade_status(trade),
        "exec_ids": exec_ids,
    }


def fill_contract_symbol(fill: Any) -> str:
    return str(getattr(getattr(fill, "contract", None), "symbol", "") or "").upper().strip()


def fill_execution_details(fill: Any) -> Dict[str, Any]:
    execution = getattr(fill, "execution", None)
    return {
        "order_id": getattr(execution, "orderId", None),
        "perm_id": getattr(execution, "permId", None),
        "order_ref": getattr(execution, "orderRef", ""),
        "exec_id": str(getattr(execution, "execId", "") or "").strip(),
        "action": normalized_execution_action(getattr(execution, "side", "")),
        "qty": to_float(getattr(execution, "shares", 0)),
        "price": to_float(getattr(execution, "price", 0)),
        "time": getattr(execution, "time", None) or getattr(fill, "time", None),
    }


def fill_execution_evidence(
    fills: List[Any],
    row: Dict[str, Any],
    expected: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    symbol = str(row.get("symbol") or "").upper().strip()
    order_ref_fallback = uses_order_ref_identity_fallback(expected)
    matches = []
    for fill in fills:
        details = fill_execution_details(fill)
        if fill_contract_symbol(fill) != symbol:
            continue
        if details["action"] != expected_exit_action(row):
            continue
        if not identity_matches(
            details["order_id"],
            details["perm_id"],
            details["order_ref"],
            expected,
        ):
            continue
        if order_ref_fallback and not execution_at_or_after_entry(details["time"], row):
            continue
        if details["qty"] <= 0 or details["price"] <= 0:
            continue
        matches.append(details)

    if order_ref_fallback:
        groups: Dict[str, List[Dict[str, Any]]] = {}
        for details in matches:
            group_key = (
                f"PERM:{details['perm_id']}"
                if details["perm_id"] not in (None, "", 0, "0")
                else f"ORDER:{details['order_id']}"
                if details["order_id"] not in (None, "", 0, "0")
                else f"EXEC:{details['exec_id']}"
                if details["exec_id"]
                else ""
            )
            if not group_key:
                return None
            groups.setdefault(group_key, []).append(details)
        if len(groups) != 1:
            return None
        matches = next(iter(groups.values()))

    qty = sum(item["qty"] for item in matches)
    expected_qty = to_float(expected.get("expected_qty"))
    if qty <= 0 or (expected_qty > 0 and qty + 0.000001 < expected_qty):
        return None
    price = sum(item["price"] * item["qty"] for item in matches) / qty
    exec_ids = [item["exec_id"] for item in matches if item["exec_id"]]
    first = matches[0]
    identity = execution_identity_text(
        exec_ids=exec_ids,
        perm_id=first["perm_id"],
        order_id=first["order_id"],
        order_ref_value=first["order_ref"],
    )
    if not identity:
        return None
    return {
        "identity": identity,
        "price": round_price(price),
        "qty": qty,
        "order_id": first["order_id"],
        "perm_id": first["perm_id"],
        "order_ref": first["order_ref"],
        "status": "Filled",
        "exec_ids": exec_ids,
    }


def current_ib_trades() -> List[Any]:
    try:
        return list(ib.trades() or [])
    except Exception:
        return []


def current_ib_fills() -> List[Any]:
    try:
        return list(ib.fills() or [])
    except Exception:
        return []


def find_managed_execution_evidence(row: Dict[str, Any], kind: str) -> Optional[Dict[str, Any]]:
    expected = managed_order_identity(row, kind)
    if not any(expected.get(key) not in (None, "") for key in ("order_id", "perm_id", "order_ref")):
        return None

    trade_matches = []
    for trade in current_ib_trades():
        evidence = trade_execution_evidence(trade, row, expected)
        if evidence:
            trade_matches.append(evidence)

    if uses_order_ref_identity_fallback(expected):
        if len(trade_matches) == 1:
            return trade_matches[0]
        if len(trade_matches) > 1:
            return None
    elif trade_matches:
        return trade_matches[0]

    return fill_execution_evidence(current_ib_fills(), row, expected)


def find_external_close_execution(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Use a single unambiguous non-managed closing execution when available."""
    symbol = str(row.get("symbol") or "").upper().strip()
    target_identity = managed_order_identity(row, "target")
    close_identity = managed_order_identity(row, "close")
    groups: Dict[str, List[Dict[str, Any]]] = {}
    if entry_filled_time(row) is None:
        return None

    for fill in current_ib_fills():
        details = fill_execution_details(fill)
        if fill_contract_symbol(fill) != symbol:
            continue
        if details["action"] != expected_exit_action(row):
            continue
        if details["qty"] <= 0 or details["price"] <= 0:
            continue
        if not execution_at_or_after_entry(details.get("time"), row):
            continue
        if identity_matches(details["order_id"], details["perm_id"], details["order_ref"], target_identity):
            continue
        if identity_matches(details["order_id"], details["perm_id"], details["order_ref"], close_identity):
            continue
        identity = execution_identity_text(
            exec_ids=[details["exec_id"]] if details["exec_id"] else [],
            perm_id=details["perm_id"],
            order_id=details["order_id"],
            order_ref_value=details["order_ref"],
        )
        if not identity:
            continue
        group_key = (
            f"PERM:{details['perm_id']}" if details["perm_id"] not in (None, "", 0, "0")
            else f"ORDER:{details['order_id']}" if details["order_id"] not in (None, "", 0, "0")
            else identity
        )
        groups.setdefault(group_key, []).append(details)

    if len(groups) != 1:
        return None

    matches = next(iter(groups.values()))
    qty = sum(item["qty"] for item in matches)
    price = sum(item["price"] * item["qty"] for item in matches) / qty
    exec_ids = [item["exec_id"] for item in matches if item["exec_id"]]
    first = matches[0]
    return {
        "identity": execution_identity_text(
            exec_ids=exec_ids,
            perm_id=first["perm_id"],
            order_id=first["order_id"],
            order_ref_value=first["order_ref"],
        ),
        "price": round_price(price),
        "qty": qty,
        "order_id": first["order_id"],
        "perm_id": first["perm_id"],
        "order_ref": first["order_ref"],
        "status": "Filled",
        "exec_ids": exec_ids,
    }


def edge_reconciliation_payload(row: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    target_evidence = find_managed_execution_evidence(row, "target")
    close_evidence = find_managed_execution_evidence(row, "close")
    external_evidence = None if target_evidence or close_evidence else find_external_close_execution(row)
    payload = dict(row.get("last_payload") or {})
    setup_id = str(row.get("setup_id") or payload.get("setup_id") or "").strip()
    symbol = str(row.get("symbol") or payload.get("symbol") or "").upper().strip()
    side = str(row.get("side") or payload.get("side") or "").upper().strip()

    evidence = target_evidence or close_evidence or external_evidence
    execution_identity = str(evidence.get("identity")) if evidence else "FLAT_NO_EXECUTION_HISTORY"
    reconciliation_id = f"{setup_id or symbol}:{execution_identity}"
    event = "TP" if target_evidence else "CLOSE_STOP" if close_evidence else "EXTERNAL_CLOSE"
    reason = (
        "IB_TARGET_EXECUTION_CONFIRMED"
        if target_evidence
        else "IB_STOP_CLOSE_EXECUTION_CONFIRMED"
        if close_evidence
        else "IB_POSITION_FLAT_EXTERNAL_EXECUTION"
    )

    payload.update({
        "source": "IB_BRIDGE",
        "system_id": payload.get("system_id") or row.get("system_id") or "VIXALE_EDGE",
        "strategy": payload.get("strategy") or row.get("strategy") or "",
        "variant": payload.get("variant") or row.get("variant") or "FIONA_LIMIT_PULLBACK_ATR_TARGET",
        "setup_id": setup_id,
        "event": event,
        "symbol": symbol,
        "side": side,
        "entry": row.get("entry") or payload.get("entry") or "",
        "target": row.get("target") or payload.get("target") or "",
        "stop": row.get("stop") or payload.get("stop") or "",
        "reason": reason,
        "broker_confirmed_flat": True,
        "position_after_close": 0,
        "ib_status": "position_flat_reconciled",
        "exit_execution_id": execution_identity,
        "reconciliation_id": reconciliation_id,
    })

    if evidence:
        payload["price"] = evidence["price"]
        payload["qty"] = evidence["qty"]
        payload["exit_price_available"] = True
        payload["exit_quantity_available"] = True
        payload["ib_exit_order_id"] = evidence.get("order_id", "")
        payload["ib_exit_perm_id"] = evidence.get("perm_id", "")
        payload["ib_exit_order_ref"] = evidence.get("order_ref", "")
    else:
        payload["price"] = ""
        payload["qty"] = ""
        payload["exit_price_available"] = False
        payload["exit_quantity_available"] = False

    return payload, reconciliation_id


async def reconcile_managed_target_fills_once() -> Dict[str, Any]:
    await ensure_ib_connected()

    managed = load_managed_positions()
    checked = 0
    reported = 0
    details = []

    for symbol, row in list(managed.items()):
        symbol = str(symbol or row.get("symbol") or "").upper().strip()
        if not symbol:
            continue

        target_price = to_float(row.get("target"))
        if target_price <= 0:
            continue

        checked += 1
        if (
            is_vixale_edge_managed_position(row)
            and str(row.get("entry_submission_state") or "FILLED").upper() != "FILLED"
        ):
            details.append({
                "symbol": symbol,
                "status": "awaiting_edge_entry_fill",
                "setup_id": row.get("setup_id", ""),
            })
            continue

        position_size = await get_position_size(symbol)

        if abs(position_size) > 0.000001:
            details.append({
                "symbol": symbol,
                "status": "still_open",
                "position": position_size,
                "target": target_price,
            })
            continue

        if not await claim_target_report(symbol):
            details.append({
                "symbol": symbol,
                "status": "target_report_in_progress",
                "target": target_price,
            })
            continue

        try:
            if is_vixale_edge_managed_position(row):
                claim = row.get("reconciliation_claim") if isinstance(row.get("reconciliation_claim"), dict) else {}
                payload = dict(claim.get("render_payload") or {})
                reconciliation_id = str(claim.get("reconciliation_id") or "")

                if not payload:
                    payload, reconciliation_id = edge_reconciliation_payload(row)
                    now_iso = now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE).isoformat()
                    row["reconciliation_claim"] = {
                        "reconciliation_id": reconciliation_id,
                        "event": payload.get("event"),
                        "exit_execution_id": payload.get("exit_execution_id"),
                        "render_payload": payload,
                        "claimed_at": now_iso,
                    }
                    row["updated_at"] = now_iso
                    managed[symbol] = row
                    if not save_managed_positions(managed):
                        details.append({
                            "symbol": symbol,
                            "status": "reconciliation_claim_persistence_failed",
                            "event": payload.get("event"),
                            "reason": payload.get("reason"),
                            "reconciliation_id": reconciliation_id,
                            "target": target_price,
                        })
                        continue

                render_result = await forward_to_render(payload)
                cleanup = {}
                if render_delivery_succeeded(render_result):
                    clear_managed_position(symbol)
                    if CANCEL_ORPHAN_TARGETS_AFTER_FLAT:
                        try:
                            cleanup = await cleanup_orphan_targets_if_flat(symbol)
                        except Exception as cleanup_exc:
                            cleanup = {"cleanup_error": str(cleanup_exc)}
                    reported += 1
                    status = f"reported_{str(payload.get('event') or '').lower()}_flat"
                else:
                    status = "render_delivery_failed_retry_retained"

                details.append({
                    "symbol": symbol,
                    "status": status,
                    "event": payload.get("event"),
                    "reason": payload.get("reason"),
                    "reconciliation_id": reconciliation_id,
                    "target": target_price,
                    "render_result": render_result,
                    **cleanup,
                })
                continue

            payload = dict(row.get("last_payload") or {})
            side = str(row.get("side") or payload.get("side") or "").upper().strip()
            qty = to_int_qty(row.get("qty")) or to_int_qty(payload.get("qty"))
            entry = to_float(row.get("entry")) or to_float(payload.get("entry")) or to_float(payload.get("price"))

            payload.update({
                "source": payload.get("source") or "IB_BRIDGE",
                "strategy": payload.get("strategy") or row.get("strategy") or "MANAGED_TARGET_RECONCILE",
                "event": "TP",
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "entry": round_price(entry) if entry > 0 else entry,
                "price": round_price(target_price),
                "target": round_price(target_price),
                "reason": "IB_TARGET_FILLED_RECONCILE",
                "ib_status": "position_flat_target_reconcile",
            })

            render_result = await forward_to_render(payload)
            cleanup = {}

            if render_delivery_succeeded(render_result):
                clear_managed_position(symbol)
                if CANCEL_ORPHAN_TARGETS_AFTER_FLAT:
                    try:
                        cleanup = await cleanup_orphan_targets_if_flat(symbol)
                    except Exception as cleanup_exc:
                        cleanup = {"cleanup_error": str(cleanup_exc)}

                reported += 1
                status = "reported_tp_flat"
            else:
                status = "render_delivery_failed_retry_retained"

            details.append({
                "symbol": symbol,
                "status": status,
                "target": target_price,
                "render_result": render_result,
                **cleanup,
            })
        finally:
            await release_target_report_claim(symbol)

    return {
        "ok": True,
        "checked": checked,
        "reported": reported,
        "details": details,
    }


async def managed_target_reconcile_loop() -> None:
    poll = max(MANAGED_TARGET_RECONCILE_POLL_SECONDS, 2.0)
    print(f"[TARGET RECONCILE START] enabled={ENABLE_MANAGED_TARGET_RECONCILE} poll={poll}s")

    while True:
        try:
            if ENABLE_MANAGED_TARGET_RECONCILE:
                async with ib_lock:
                    result = await reconcile_managed_target_fills_once()
                if int(result.get("reported", 0) or 0) > 0:
                    print(f"[TARGET RECONCILE RESULT] {result}")
        except Exception as exc:
            print(f"[TARGET RECONCILE ERROR] {exc}")

        await asyncio.sleep(poll)



def find_trade_by_order_ref(order_ref_value: str) -> Optional[Any]:
    expected = str(order_ref_value or "").upper().strip()
    if not expected:
        return None
    for trade in ib.trades():
        ref = str(getattr(getattr(trade, "order", None), "orderRef", "") or "").upper().strip()
        if ref == expected:
            return trade
    return None


async def verify_position_flat(symbol: str, timeout_seconds: float) -> Tuple[bool, float]:
    poll = max(FORCE_EOD_VERIFY_POLL_SECONDS, 0.10)
    waited = 0.0
    position = await get_position_size(symbol)
    while abs(position) > 0.000001 and waited <= max(timeout_seconds, poll):
        await asyncio.sleep(poll)
        waited += poll
        position = await get_position_size(symbol)
    return abs(position) <= 0.000001, position


async def deliver_confirmed_shrek_eod_callback(
    key: str,
    state: Dict[str, Any],
    all_state: Dict[str, Any],
) -> Dict[str, Any]:
    if state.get("callback_delivered"):
        return {"forwarded": True, "reason": "already_delivered"}

    render_payload = dict(state.get("render_payload") or {})
    if not render_payload:
        return {"forwarded": False, "reason": "missing_persisted_render_payload"}

    render_result = await forward_to_render(render_payload)
    if render_delivery_succeeded(render_result):
        state["callback_delivered"] = True
        state["callback_delivered_at"] = now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE).isoformat()
        all_state[key] = state
        save_force_eod_state(all_state)
    return render_result


async def flatten_one_shrek_position(
    day_key: str,
    symbol: str,
    row: Dict[str, Any],
    reason: str,
    all_state: Dict[str, Any],
) -> Dict[str, Any]:
    strategy = managed_strategy_id(row)
    key = shrek_eod_idempotency_key(day_key, symbol, strategy)
    state = dict(all_state.get(key) or {})

    if state.get("status") == "confirmed_flat":
        render_result = await deliver_confirmed_shrek_eod_callback(key, state, all_state)
        return {"symbol": symbol, "status": "confirmed_flat_callback_retry", "idempotency_key": key, "render_result": render_result}

    position_before = await get_position_size(symbol)
    if abs(position_before) <= 0.000001:
        return {"symbol": symbol, "status": "already_flat", "idempotency_key": key, "position": position_before}

    cancel_result = await cancel_and_verify_targets_for_shrek_eod(symbol)
    if cancel_result.get("status") == "position_flat_during_target_cancel":
        return {
            "symbol": symbol,
            "status": "target_fill_race_flat",
            "idempotency_key": key,
            "cancel_result": cancel_result,
        }
    if not cancel_result.get("ok"):
        logger.critical("[SHREK EOD TARGET CANCEL UNCONFIRMED] symbol=%s key=%s result=%s", symbol, key, cancel_result)
        return {"symbol": symbol, "status": "target_cancel_unconfirmed", "idempotency_key": key, "cancel_result": cancel_result}

    position_after_cancel = await get_position_size(symbol)
    if abs(position_after_cancel) <= 0.000001:
        return {"symbol": symbol, "status": "target_fill_race_flat", "idempotency_key": key, "cancel_result": cancel_result}

    side = "LONG" if position_after_cancel > 0 else "SHORT"
    action = "SELL" if position_after_cancel > 0 else "BUY"
    qty = abs(int(position_after_cancel))
    order_ref_value = state.get("order_ref") or f"VIXALE_EOD_{day_key.replace('-', '')}_{symbol}_{strategy}"
    close_trade = find_trade_by_order_ref(order_ref_value)

    if close_trade is None and state.get("order_submitted"):
        logger.critical("[SHREK EOD ORDER STATE AMBIGUOUS] symbol=%s key=%s. Refusing duplicate close.", symbol, key)
        return {"symbol": symbol, "status": "ambiguous_prior_submission", "idempotency_key": key}

    payload = dict(row.get("last_payload") or {})
    payload.update({
        "source": "IB_BRIDGE",
        "strategy": strategy,
        "event": "EOD_CLOSE",
        "symbol": symbol,
        "sec_type": row.get("sec_type") or payload.get("sec_type") or "STK",
        "side": side,
        "qty": qty,
        "entry": row.get("entry") or payload.get("entry") or 0,
        "target": row.get("target") or payload.get("target") or 0,
        "stop": row.get("stop") or payload.get("stop") or 0,
        "profile": row.get("profile") or payload.get("profile") or "",
        "timeframe": row.get("timeframe") or payload.get("timeframe") or "",
        "reason": f"BRIDGE_SHREK_1559_EOD_{reason}",
        "broker_eod_watchdog": True,
        "eod_idempotency_key": key,
    })

    if close_trade is None:
        contract = await qualify_contract(payload)
        order = MarketOrder(action=action, totalQuantity=qty, tif="DAY")
        order.orderRef = order_ref_value
        state.update({
            "status": "submitting",
            "symbol": symbol,
            "strategy": strategy,
            "side": side,
            "qty": qty,
            "order_ref": order_ref_value,
            "order_submitted": False,
            "submitted_at": now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE).isoformat(),
        })
        all_state[key] = state
        save_force_eod_state(all_state)

        if DRY_RUN:
            return {"symbol": symbol, "status": "dry_run_no_order", "idempotency_key": key, "action": action, "qty": qty}

        close_trade = ib.placeOrder(contract, order)
        state["order_id"] = trade_order_id(close_trade)
        state["order_submitted"] = True
        state["status"] = "submitted"
        all_state[key] = state
        save_force_eod_state(all_state)

    poll = max(FORCE_EOD_VERIFY_POLL_SECONDS, 0.10)
    waited = 0.0
    while waited <= max(FORCE_EOD_FILL_VERIFY_SECONDS, poll):
        if trade_is_filled(close_trade, qty):
            break
        rejection_reason = trade_rejection_reason(close_trade)
        if rejection_reason or trade_status(close_trade).lower() in ORDER_BAD_STATUSES:
            logger.critical("[SHREK EOD CLOSE REJECTED] symbol=%s key=%s reason=%s", symbol, key, rejection_reason)
            state["status"] = "rejected"
            state["error"] = rejection_reason or trade_status(close_trade)
            all_state[key] = state
            save_force_eod_state(all_state)
            return {"symbol": symbol, "status": "rejected", "idempotency_key": key, "error": state["error"]}
        await asyncio.sleep(poll)
        waited += poll

    flat, position_after = await verify_position_flat(symbol, FORCE_EOD_POSITION_VERIFY_SECONDS)
    if not flat:
        logger.critical(
            "[SHREK EOD POSITION REMAINS OPEN] symbol=%s key=%s order_status=%s filled=%s position=%s",
            symbol, key, trade_status(close_trade), trade_filled_qty(close_trade), position_after,
        )
        return {
            "symbol": symbol,
            "status": "position_remains_open",
            "idempotency_key": key,
            "position": position_after,
            "order_status": trade_status(close_trade),
        }

    ib_result = {
        "status": "submitted",
        "close_filled": True,
        "close_status": "Filled",
        "close_fill_price": trade_fill_price(close_trade, to_float(payload.get("entry"))),
        "close_filled_qty": trade_filled_qty(close_trade) or qty,
        "position_before_close": position_after_cancel,
        "position_after_close": position_after,
        "canceled_open_orders": cancel_result.get("canceled_targets", 0),
        "order_id": trade_order_id(close_trade),
        "order_ref": order_ref_value,
    }
    render_payload = make_close_fill_payload(payload, ib_result)
    render_payload["broker_eod_watchdog"] = True
    render_payload["eod_idempotency_key"] = key
    state.update({
        "status": "confirmed_flat",
        "confirmed_flat_at": now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE).isoformat(),
        "render_payload": render_payload,
    })
    all_state[key] = state
    save_force_eod_state(all_state)
    clear_managed_position(symbol)

    render_result = await deliver_confirmed_shrek_eod_callback(key, state, all_state)
    return {
        "symbol": symbol,
        "status": "confirmed_flat",
        "idempotency_key": key,
        "render_result": render_result,
        "position_after_close": position_after,
    }


async def force_eod_flatten_locked(reason: str = "SCHEDULED") -> Dict[str, Any]:
    """Flatten only bridge-managed Shrek positions at 15:59 ET."""
    await ensure_ib_connected()
    if not is_us_stock_rth_now():
        return {
            "ok": False,
            "reason": reason,
            "status": "blocked_close_outside_rth_no_cancel",
            "details": [],
        }
    now = now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE)
    day_key = now.date().isoformat()
    managed = load_managed_positions()
    all_state = load_force_eod_state()
    rows = []

    for key, state in list(all_state.items()):
        if (
            key.startswith(f"{day_key}:")
            and state.get("status") == "confirmed_flat"
            and not state.get("callback_delivered")
        ):
            render_result = await deliver_confirmed_shrek_eod_callback(key, state, all_state)
            rows.append({
                "symbol": state.get("symbol", ""),
                "status": "confirmed_flat_callback_retry",
                "idempotency_key": key,
                "render_result": render_result,
            })

    for symbol, row in list(managed.items()):
        symbol = str(symbol or row.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        if not is_shrek_managed_position(row):
            rows.append({"symbol": symbol, "status": "skipped_unrelated_strategy", "strategy": managed_strategy_id(row)})
            continue
        rows.append(await flatten_one_shrek_position(day_key, symbol, row, reason, all_state))

    return {
        "ok": True,
        "reason": reason,
        "managed_symbols_checked": len(managed),
        "shrek_symbols_checked": sum(1 for row in managed.values() if is_shrek_managed_position(row)),
        "details": rows,
    }


async def forced_eod_scheduler_loop() -> None:
    global _last_force_eod_date

    poll = max(FORCE_EOD_SCHEDULER_POLL_SECONDS, 5.0)
    print(f"[FORCE EOD SCHEDULER START] enabled={FORCE_EOD_FLATTEN_ENABLED} time={FORCE_EOD_FLATTEN_TIME} tz={FORCE_EOD_FLATTEN_TIMEZONE}")

    while True:
        try:
            if FORCE_EOD_FLATTEN_ENABLED:
                now = now_in_tz(FORCE_EOD_FLATTEN_TIMEZONE)
                today_key = now.date().isoformat()
                should_run_today = (not FORCE_EOD_WEEKDAYS_ONLY) or is_weekday(now)
                current_time = now.time().replace(tzinfo=None)
                force_time = parse_hhmm(FORCE_EOD_FLATTEN_TIME, 15, 59)
                session_end = parse_hhmm(RTH_END, 16, 0)

                # Keep verifying/retrying during the final session minute. The
                # persistent idempotency state prevents a second flatten order.
                if should_run_today and force_time <= current_time < session_end:
                    _last_force_eod_date = today_key
                    print(f"[FORCE EOD TRIGGER] date={today_key} time={now.isoformat()}")
                    async with ib_lock:
                        result = await force_eod_flatten_locked("SCHEDULED")
                    print(f"[FORCE EOD RESULT] {result}")

        except Exception as exc:
            print(f"[FORCE EOD ERROR] {exc}")

        await asyncio.sleep(poll)


@app.on_event("startup")
async def startup_event() -> None:
    global _force_eod_task, _target_reconcile_task, _quote_push_task
    if ENABLE_MANAGED_TARGET_RECONCILE and _target_reconcile_task is None:
        _target_reconcile_task = asyncio.create_task(managed_target_reconcile_loop())
    if ENABLE_RENDER_QUOTE_PUSH and _quote_push_task is None:
        _quote_push_task = asyncio.create_task(live_quote_push_loop())
    if FORCE_EOD_FLATTEN_ENABLED and _force_eod_task is None:
        _force_eod_task = asyncio.create_task(forced_eod_scheduler_loop())

@app.get("/")
async def root():
    return {
        "ok": True,
        "service": "IB Bridge",
        "mode": "v6_multi_tf_with_bridge_forced_eod_partial_fill_399_repair",
        "dry_run": DRY_RUN,
        "ib_connected": ib.isConnected(),
        "ib_host": IB_HOST,
        "ib_port": IB_PORT,
        "client_id": IB_CLIENT_ID,
        "render_webhook_configured": bool(RENDER_WEBHOOK_URL),
        "target_mode": "attached_parent_child_limit_order",
        "enable_target_fill_monitor": ENABLE_TARGET_FILL_MONITOR,
        "target_monitor_seconds": TARGET_MONITOR_SECONDS,
        "enable_managed_target_reconcile": ENABLE_MANAGED_TARGET_RECONCILE,
        "managed_target_reconcile_poll_seconds": MANAGED_TARGET_RECONCILE_POLL_SECONDS,
        "enable_render_quote_push": ENABLE_RENDER_QUOTE_PUSH,
        "render_quote_url_configured": bool(render_quote_update_url()),
        "quote_push_poll_seconds": QUOTE_PUSH_POLL_SECONDS,
        "quote_market_data_type": QUOTE_MARKET_DATA_TYPE,
        "entry_order_type_default": ENTRY_ORDER_TYPE_DEFAULT,
        "max_order_notional": MAX_ORDER_NOTIONAL,
        "max_share_qty": MAX_SHARE_QTY,
        "default_stock_qty": DEFAULT_STOCK_QTY,
        "allow_shorts": ALLOW_SHORTS,
        "allow_futures": ALLOW_FUTURES,
        "max_future_qty": MAX_FUTURE_QTY,
        "max_future_notional": MAX_FUTURE_NOTIONAL,
        "futures_default_exchange": FUTURES_DEFAULT_EXCHANGE,
        "futures_default_currency": FUTURES_DEFAULT_CURRENCY,
        "order_confirm_delay": ORDER_CONFIRM_DELAY,
        "partial_fill_grace_seconds": PARTIAL_FILL_GRACE_SECONDS,
        "block_market_entries_outside_rth": BLOCK_MARKET_ENTRIES_OUTSIDE_RTH,
        "block_market_closes_outside_rth": BLOCK_MARKET_CLOSES_OUTSIDE_RTH,
        "eod_close_should_be_sent_before": EOD_CLOSE_SHOULD_BE_SENT_BEFORE,
        "enable_target_fill_monitor": ENABLE_TARGET_FILL_MONITOR,
        "target_monitor_seconds": TARGET_MONITOR_SECONDS,
        "cancel_orphan_targets_after_flat": CANCEL_ORPHAN_TARGETS_AFTER_FLAT,
        "enable_render_flat_reconcile": ENABLE_RENDER_FLAT_RECONCILE,
        "reconcile_flat_events": RECONCILE_FLAT_EVENTS,
        "rth_timezone": RTH_TIMEZONE,
        "rth_start": RTH_START,
        "rth_end": RTH_END,
        "is_stock_rth_now": is_us_stock_rth_now(),
        "managed_positions_file": managed_positions_path(),
        "force_eod_flatten_enabled": FORCE_EOD_FLATTEN_ENABLED,
        "force_eod_flatten_time": FORCE_EOD_FLATTEN_TIME,
        "force_eod_flatten_timezone": FORCE_EOD_FLATTEN_TIMEZONE,
        "force_eod_scope": "SHREK,SHREK_1_4",
        "force_eod_state_file": force_eod_state_path(),
        "force_eod_block_new_stock_entries_after": FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER,
        "force_eod_weekdays_only": FORCE_EOD_WEEKDAYS_ONLY,
        "force_eod_last_run_date": _last_force_eod_date,
    }


@app.get("/ib/status")
async def ib_status():
    try:
        async with ib_lock:
            await ensure_ib_connected()
            accounts = ib.managedAccounts()

        return {
            "ok": True,
            "connected": ib.isConnected(),
            "accounts": accounts,
            "dry_run": DRY_RUN,
            "entry_order_type_default": ENTRY_ORDER_TYPE_DEFAULT,
            "max_order_notional": MAX_ORDER_NOTIONAL,
            "max_share_qty": MAX_SHARE_QTY,
        "default_stock_qty": DEFAULT_STOCK_QTY,
            "allow_shorts": ALLOW_SHORTS,
            "allow_futures": ALLOW_FUTURES,
            "max_future_qty": MAX_FUTURE_QTY,
            "max_future_notional": MAX_FUTURE_NOTIONAL,
            "futures_default_exchange": FUTURES_DEFAULT_EXCHANGE,
            "futures_default_currency": FUTURES_DEFAULT_CURRENCY,
            "order_confirm_delay": ORDER_CONFIRM_DELAY,
            "partial_fill_grace_seconds": PARTIAL_FILL_GRACE_SECONDS,
            "block_market_entries_outside_rth": BLOCK_MARKET_ENTRIES_OUTSIDE_RTH,
            "block_market_closes_outside_rth": BLOCK_MARKET_CLOSES_OUTSIDE_RTH,
            "eod_close_should_be_sent_before": EOD_CLOSE_SHOULD_BE_SENT_BEFORE,
            "enable_target_fill_monitor": ENABLE_TARGET_FILL_MONITOR,
            "target_monitor_seconds": TARGET_MONITOR_SECONDS,
            "cancel_orphan_targets_after_flat": CANCEL_ORPHAN_TARGETS_AFTER_FLAT,
            "enable_render_flat_reconcile": ENABLE_RENDER_FLAT_RECONCILE,
            "reconcile_flat_events": RECONCILE_FLAT_EVENTS,
            "rth_timezone": RTH_TIMEZONE,
            "rth_start": RTH_START,
            "rth_end": RTH_END,
            "is_stock_rth_now": is_us_stock_rth_now(),
            "managed_positions_file": managed_positions_path(),
            "force_eod_flatten_enabled": FORCE_EOD_FLATTEN_ENABLED,
            "force_eod_flatten_time": FORCE_EOD_FLATTEN_TIME,
            "force_eod_flatten_timezone": FORCE_EOD_FLATTEN_TIMEZONE,
            "force_eod_scope": "SHREK,SHREK_1_4",
            "force_eod_state_file": force_eod_state_path(),
            "force_eod_block_new_stock_entries_after": FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER,
            "force_eod_weekdays_only": FORCE_EOD_WEEKDAYS_ONLY,
            "force_eod_last_run_date": _last_force_eod_date,
        }
    except Exception as exc:
        return {
            "ok": False,
            "connected": False,
            "error": str(exc),
            "dry_run": DRY_RUN,
        }


@app.get("/ib/open-orders")
async def ib_open_orders():
    try:
        async with ib_lock:
            await ensure_ib_connected()

            rows = []
            for trade in ib.openTrades():
                contract = trade.contract
                order = trade.order
                rows.append({
                    "symbol": getattr(contract, "symbol", ""),
                    "sec_type": getattr(contract, "secType", ""),
                    "exchange": getattr(contract, "exchange", ""),
                    "currency": getattr(contract, "currency", ""),
                    "local_symbol": getattr(contract, "localSymbol", ""),
                    "contract_month": getattr(contract, "lastTradeDateOrContractMonth", ""),
                    "trading_class": getattr(contract, "tradingClass", ""),
                    "action": getattr(order, "action", ""),
                    "qty": getattr(order, "totalQuantity", ""),
                    "order_type": getattr(order, "orderType", ""),
                    "limit_price": getattr(order, "lmtPrice", ""),
                    "order_ref": getattr(order, "orderRef", ""),
                    "order_id": getattr(order, "orderId", ""),
                    "parent_id": getattr(order, "parentId", ""),
                    "status": trade_status(trade),
                })

        return {
            "ok": True,
            "count": len(rows),
            "orders": rows,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }


@app.get("/ib/positions")
async def ib_positions():
    try:
        async with ib_lock:
            await ensure_ib_connected()

            rows = []
            for pos in ib.positions():
                rows.append({
                    "symbol": getattr(pos.contract, "symbol", ""),
                    "sec_type": getattr(pos.contract, "secType", ""),
                    "exchange": getattr(pos.contract, "exchange", ""),
                    "currency": getattr(pos.contract, "currency", ""),
                    "local_symbol": getattr(pos.contract, "localSymbol", ""),
                    "contract_month": getattr(pos.contract, "lastTradeDateOrContractMonth", ""),
                    "trading_class": getattr(pos.contract, "tradingClass", ""),
                    "position": float(pos.position),
                    "avg_cost": float(pos.avgCost),
                })

        return {
            "ok": True,
            "count": len(rows),
            "positions": rows,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }




@app.get("/ib/quotes/status")
async def ib_quotes_status():
    try:
        symbols = managed_quote_symbols() if ib.isConnected() else []
        payload = render_quote_payload(symbols) if symbols else {"quotes": []}
        return {
            "ok": True,
            "enabled": ENABLE_RENDER_QUOTE_PUSH,
            "render_quote_url": render_quote_update_url(),
            "market_data_type": QUOTE_MARKET_DATA_TYPE,
            "subscribed_symbols": sorted(_quote_tickers.keys()),
            "quotes": payload.get("quotes", []),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/ib/managed-positions")
async def ib_managed_positions():
    try:
        managed = load_managed_positions()
        return {
            "ok": True,
            "count": len(managed),
            "managed_positions_file": managed_positions_path(),
            "managed": managed,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }


@app.post("/ib/force-eod-close-now")
async def ib_force_eod_close_now():
    try:
        async with ib_lock:
            result = await force_eod_flatten_locked("MANUAL")
        return result
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }

@app.get("/ib/cancel-orphan-targets")
async def ib_cancel_orphan_targets():
    try:
        async with ib_lock:
            result = await cancel_all_orphan_target_orders()
        return result
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }


@app.post("/ib/qualify-contract")
async def ib_qualify_contract(request: Request):
    """Safety test endpoint: qualify a stock or futures contract without placing an order."""
    try:
        data = await request.json()
    except Exception:
        return {"ok": False, "status": "bad_json"}

    try:
        async with ib_lock:
            await ensure_ib_connected()
            contract = await qualify_contract(data)

        return {
            "ok": True,
            "symbol": getattr(contract, "symbol", ""),
            "sec_type": getattr(contract, "secType", ""),
            "exchange": getattr(contract, "exchange", ""),
            "currency": getattr(contract, "currency", ""),
            "local_symbol": getattr(contract, "localSymbol", ""),
            "contract_month": getattr(contract, "lastTradeDateOrContractMonth", ""),
            "trading_class": getattr(contract, "tradingClass", ""),
            "con_id": getattr(contract, "conId", ""),
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }


@app.post("/tv")
async def tv_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        data = await request.json()
    except Exception:
        return {
            "ok": False,
            "status": "bad_json",
        }

    event = str(data.get("event", "")).upper()
    symbol = str(data.get("symbol", "")).upper().strip()
    side = str(data.get("side", "")).upper().strip()

    # Fast response to TradingView.
    # Heavy work goes to background.
    background_tasks.add_task(process_signal_background, data)

    return {
        "ok": True,
        "status": "accepted",
        "processing": "background",
        "event": event,
        "symbol": symbol,
        "side": side,
        "dry_run": DRY_RUN,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "ib_bridge:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
