"""Isolated opt-in SMIO experimental-demo EOD policy. No broker imports/actions."""
from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
_START = time(15, 55)
_END = time(16, 0)


def eod_due(now: datetime, enabled: str) -> bool:
    if str(enabled).strip().lower() not in ("1", "true", "yes", "on"):
        return False
    if now.tzinfo is None:
        return False
    ny = now.astimezone(NY)
    return ny.weekday() < 5 and _START <= ny.time().replace(tzinfo=None) < _END


def eod_close_payload(entry: dict, now: datetime) -> dict:
    """Create an Engineering-owned EOD CLOSE using the approved demo contract.

    This is a broker safety intent, not a new TradingView research signal.
    The bridge's existing strict CLOSE path proves identity/ownership, persists
    the intent, cancels the exact target and proves broker-flat before callback.
    """
    if not eod_due(now, "true"):
        raise ValueError("outside SMIO EOD window")
    if not isinstance(entry, dict):
        raise ValueError("entry payload required")
    signal_close = int(now.timestamp() * 1000)
    start = signal_close - 1000
    result = dict(entry)
    result.update(
        signal="CLOSE", event="CLOSE_POSITION", reason="RTH_EOD",
        source="TradingView", signal_bar_time=start,
        signal_bar_close=signal_close,
        eod_initiator="IB_BRIDGE_SMIO_DEMO_FAILSAFE",
    )
    result["event_id"] = (
        f"{result['setup_id']}:CLOSE:{signal_close}:RTH_EOD"
    )
    return result
