"""Fail-closed publication-only guard for delayed SMIO entry callbacks."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")

def stale_smio_entry_callback(payload, now=None):
    if payload.get("event") != "ENTRY_FILL":
        return False
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("aware current time required")
    signal = payload.get("signal_bar_time")
    if isinstance(signal, bool):
        return True
    try:
        stamp = float(signal)
        if stamp <= 0 or stamp != stamp or stamp == float("inf"):
            return True
        signal_day = datetime.fromtimestamp(stamp / 1000, timezone.utc).astimezone(NY).date()
    except (OverflowError, OSError, ValueError, TypeError):
        return True
    return signal_day < current.astimezone(NY).date()
