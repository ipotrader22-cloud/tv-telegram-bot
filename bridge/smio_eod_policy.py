"""Isolated opt-in SMIO experimental-demo EOD policy. No broker imports/actions."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
_LEAD = timedelta(minutes=5)


def eod_due(now: datetime, enabled: str, session_close: datetime | None = None) -> bool:
    """Fail closed unless IB confirms an aware actual session closing instant."""
    if str(enabled).strip().lower() not in ("1", "true", "yes", "on"):
        return False
    if now.tzinfo is None or session_close is None or session_close.tzinfo is None:
        return False
    ny = now.astimezone(NY)
    end = session_close.astimezone(NY)
    return (ny.weekday() < 5 and ny.date() == end.date()
            and end - _LEAD <= ny < end)


def session_close_from_ib(details, now: datetime, session_tz, parse_stamp) -> datetime | None:
    """Require exactly one valid stock RTH liquidHours session for this NY date.

    IB contract details are the session authority. Missing/ambiguous or CLOSED
    schedules never authorize a broker action.
    """
    if now.tzinfo is None or session_tz is None:
        return None
    ny = now.astimezone(NY)
    found = []
    hours = str(getattr(details, "liquidHours", "") or "")
    for segment in hours.split(";"):
        segment = segment.strip()
        if not segment:
            continue
        if "CLOSED" in segment.upper():
            continue
        if "-" not in segment:
            return None
        left, right = segment.split("-", 1)
        day = left.split(":", 1)[0]
        begin = parse_stamp(left, day, session_tz)
        end = parse_stamp(right, day, session_tz)
        if begin is None or end is None or end <= begin:
            return None
        bny, eny = begin.astimezone(NY), end.astimezone(NY)
        if bny.date() != ny.date() or eny.date() != ny.date():
            continue
        if (bny.hour, bny.minute) != (9, 30) or not (
            (12, 0) <= (eny.hour, eny.minute) <= (16, 0)
        ):
            return None
        found.append(eny)
    return found[0] if len(found) == 1 else None


def eod_close_payload(entry: dict, now: datetime, session_close: datetime) -> dict:
    """Create an Engineering-owned EOD CLOSE using the approved demo contract.

    This is a broker safety intent, not a new TradingView research signal.
    The bridge's existing strict CLOSE path proves identity/ownership, persists
    the intent, cancels the exact target and proves broker-flat before callback.
    """
    if not eod_due(now, "true", session_close):
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
