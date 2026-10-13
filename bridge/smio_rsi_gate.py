"""Reserve SMIO_RSI research identities before any shared broker action.

No broker imports, state writes, callbacks, quantity fallback or enable switch.
"""
from __future__ import annotations


def is_smio_rsi_payload(data):
    return isinstance(data, dict) and any(
        isinstance(data.get(key), str) and "SMIO_RSI" in data[key].upper()
        for key in ("system_id", "strategy_id", "strategy", "setup_id")
    )


def install_smio_rsi_gate(core):
    if getattr(core, "_smio_rsi_gate_installed", False):
        return core
    original = core.handle_ib_action

    async def gated_handle(data):
        if is_smio_rsi_payload(data):
            return {
                "ok": False,
                "status": "smio_rsi_not_approved",
                "reason": "SMIO_RSI_RESEARCH_FREEZE_AND_LIVE_SIZING_REQUIRED",
            }
        return await original(data)

    core.handle_ib_action = gated_handle
    original_background = getattr(core, "process_signal_background", None)
    if original_background is not None:
        async def gated_background(data):
            if is_smio_rsi_payload(data):
                return
            return await original_background(data)
        core.process_signal_background = gated_background
    core._smio_rsi_gate_installed = True
    return core
