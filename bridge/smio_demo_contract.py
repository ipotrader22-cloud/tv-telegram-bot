"""User-confirmed experimental Pine v0.1 contract; never a research freeze."""
import math
import re
import time

SYSTEM = "TRADING_LAB_SMIO_RSI_PAPER"
STRATEGY = "SMIO_RSI_RESEARCH"
CONTRACT = "SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013"


def positive(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def validate(data, now_ms=None):
    if not isinstance(data, dict):
        raise ValueError("JSON object required")
    for key, expected in (("system_id", SYSTEM), ("strategy_id", STRATEGY),
                          ("experimental_contract", CONTRACT),
                          ("source", "TradingView"), ("mode", "PAPER"),
                          ("research_version", "PINE_0.1"), ("sec_type", "STK"),
                          ("qty_source", "TV Strategy Properties")):
        if data.get(key) != expected:
            raise ValueError(key + " mismatch")
    if data.get("paper_contract_version") != 1 or data.get("initial_capital") != 1000000:
        raise ValueError("paper version / initial capital mismatch")
    if data.get("strategy", STRATEGY) != STRATEGY:
        raise ValueError("conflicting strategy identity")
    symbol, tf = data.get("symbol"), data.get("timeframe")
    if not isinstance(symbol, str) or not re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,15}", symbol):
        raise ValueError("invalid stock symbol")
    if not isinstance(tf, str) or not re.fullmatch(r"[1-9][0-9]{0,3}", tf):
        raise ValueError("invalid minute timeframe")
    ticker = data.get("tickerid", "")
    if not isinstance(ticker, str) or ticker.split(":")[-1] != symbol:
        raise ValueError("ticker identity mismatch")
    config = data.get("configuration_id", "")
    if not isinstance(config, str) or not config.startswith("PINE01:"):
        raise ValueError("configuration missing")
    parts = config.split(":")
    if len(parts) != 14 or any(not re.fullmatch(r"[1-9][0-9]*", parts[i]) for i in (1, 2, 3, 4, 7, 8, 9)) or any(parts[i] not in ("true", "false") for i in (5, 6, 13)):
        raise ValueError("configuration fields invalid")
    modes = {"ATR": "ATR", "RSI 80/20": "RSI_80_20", "First of either": "FirstOfEither"}
    if modes.get(parts[10]) != data.get("target_mode") or parts[12] not in ("Auto", "Stocks RTH"):
        raise ValueError("configuration target / stock session mismatch")
    try:
        multiplier = float(parts[11])
    except ValueError:
        multiplier = 0
    if not positive(multiplier):
        raise ValueError("configuration ATR multiplier invalid")
    side, signal, event = (data.get(k) for k in ("side", "signal", "event"))
    if signal in ("BUY", "SELL"):
        if (side, event) != (("LONG", "SETUP") if signal == "BUY" else ("SHORT", "SETUP")):
            raise ValueError("entry event / side mismatch")
        if data.get("reason") != "RSI_ENTRY":
            raise ValueError("entry reason mismatch")
    elif signal == "CLOSE":
        if side not in ("LONG", "SHORT") or event != "CLOSE_POSITION" or data.get("reason") not in ("RSI_STOP", "RSI_PROFIT", "RTH_EOD"):
            raise ValueError("close event / side / reason mismatch")
    else:
        raise ValueError("unsupported signal")
    prefix = f"{STRATEGY}:{config}:{ticker}:{tf}:{side}:"
    setup = data.get("setup_id", "")
    if not isinstance(setup, str) or not setup.startswith(prefix) or not setup[len(prefix):].isdigit():
        raise ValueError("setup identity mismatch")
    start, end = data.get("signal_bar_time"), data.get("signal_bar_close")
    if not positive(start) or not positive(end) or int(start) != start or int(end) != end or end <= start:
        raise ValueError("invalid bar timestamps")
    if signal != "CLOSE" and int(setup[len(prefix):]) != start:
        raise ValueError("entry setup timestamp mismatch")
    expected_event = f"{setup}:{signal}:{int(end)}:{data['reason']}"
    if data.get("event_id") != expected_event:
        raise ValueError("event identity mismatch")
    now_ms = time.time() * 1000 if now_ms is None else now_ms
    if end > now_ms + 5000 or (signal != "CLOSE" and now_ms - end > 90000):
        raise ValueError("stale or future entry")
    qty = data.get("qty")
    if not positive(qty) or int(qty) != qty:
        raise ValueError("exact positive whole shares required; fractional qty is rejected")
    if not positive(data.get("entry")) or not positive(data.get("price")):
        raise ValueError("positive reference prices required")
    if data.get("session_timezone") != "America/New_York" or data.get("entry_order_type") != "MARKET":
        raise ValueError("session / entry type mismatch")
    mode, target = data.get("target_mode"), data.get("target")
    if mode == "RSI_80_20":
        if target is not None or data.get("target_price") is not None:
            raise ValueError("RSI-only target must be null")
    elif mode in ("ATR", "FirstOfEither"):
        if not positive(target) or data.get("target_price") != target:
            raise ValueError("frozen target missing / inconsistent")
        if (side == "LONG" and target <= data["entry"]) or (side == "SHORT" and target >= data["entry"]):
            raise ValueError("target direction mismatch")
    else:
        raise ValueError("target mode mismatch")
    return data
