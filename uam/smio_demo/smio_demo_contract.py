"""Settings contract for the expressly authorised experimental demo workflow."""
import hashlib
import json
import os
from pathlib import Path

CONTRACT = "SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013"


def is_demo(profile):
    return profile.raw.get("experimental_contract") == CONTRACT


def configuration_id(winner):
    values = {spec["label"]: spec["value"] for spec in winner.tv_inputs}
    labels = ["SMIO fast EMA", "SMIO slow EMA", "SMIO signal EMA", "RSI of SMIO period",
              "Allow longs", "Allow shorts", "EMA fast", "EMA medium", "EMA long",
              "Profit target mode", "ATR target multiplier", "Session mode", "Close stocks at RTH end"]
    def pine_string(value):
        if isinstance(value, bool):
            return str(value).lower()
        if isinstance(value, float):
            return format(value, ".8f").rstrip("0").rstrip(".")
        return str(value)
    return "PINE01:" + ":".join(pine_string(values[label]) for label in labels)


def validate_candidate(profile, winner):
    if not is_demo(profile):
        return
    if winner.contract_id != profile.contract_id:
        raise ValueError("SMIO candidate/profile contract mismatch; run Preview again")
    if winner.params.get("ResearchStartingCapital") != 1000000 or winner.params.get("CapitalAllocationPercent") != 10:
        raise ValueError("SMIO demo requires Excel capital 1,000,000 and allocation 10%; no fallback")
    expected = profile.build_tv_inputs(winner.params, winner.symbol, winner.alert_name)
    if expected != winner.tv_inputs:
        raise ValueError("SMIO Inputs snapshot does not match the selected Excel parameters")
    if not 1 <= winner.timeframe <= 1440:
        raise ValueError("SMIO demo requires an intraday minute chart")


def save_snapshot(profile, winner, status):
    config = configuration_id(winner)
    suffix = hashlib.sha256(json.dumps(config, separators=(",", ":")).encode()).hexdigest()[:16]
    directory = profile.path.parent.parent / "output" / "smio_snapshots"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{winner.symbol}_{winner.timeframe}_{suffix}.json"
    snapshot = {"experimental_contract": CONTRACT, "symbol": winner.symbol, "timeframe": str(winner.timeframe),
                "configuration_id": config, "script_title": profile.script_title,
                "pine_reference": profile.raw["pine_reference"], "contract_id": profile.contract_id,
                "alert_name": winner.alert_name, "inputs": winner.tv_inputs,
                "strategy_properties": profile.raw["alert_contract"]["strategy_properties"],
                "properties_verified": True, "status": status,
                "source_file": winner.source_file, "source_sheet": winner.source_sheet, "source_row": winner.source_row}
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as stream:
        json.dump(snapshot, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)
    return str(path)
