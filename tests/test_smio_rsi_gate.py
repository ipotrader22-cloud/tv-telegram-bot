"""Offline routing tests: no IB imports or connections."""
import asyncio
import unittest
from types import SimpleNamespace
from bridge.smio_rsi_gate import install_smio_rsi_gate


class GateTests(unittest.IsolatedAsyncioTestCase):
    async def test_research_never_delegates_even_with_live_label(self):
        async def forbidden(data):
            raise AssertionError("broker path reached")
        core = SimpleNamespace(handle_ib_action=forbidden, process_signal_background=forbidden)
        install_smio_rsi_gate(core)
        handler = core.handle_ib_action
        install_smio_rsi_gate(core)
        self.assertIs(handler, core.handle_ib_action)
        for key in ("system_id", "strategy_id", "strategy", "setup_id"):
            for signal in ("BUY", "SELL", "CLOSE"):
                for qty in (None, 0, -1, 1.5, 100):
                    result = await core.handle_ib_action({key: "smio_rsi_research",
                        "mode": "LIVE", "signal": signal, "qty": qty})
                    self.assertFalse(result["ok"])
                    self.assertEqual(result["status"], "smio_rsi_not_approved")
                    await core.process_signal_background({key: "smio_rsi_research", "event": "SETUP"})

    async def test_foreign_paths_delegate_unchanged_concurrently(self):
        calls = []
        async def original(data):
            calls.append(data)
            return data
        core = SimpleNamespace(handle_ib_action=original)
        install_smio_rsi_gate(core)
        payloads = [{"strategy": s} for s in ("SHREK_1_4",
            "VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1", "SMI_HISTOGRAM_V0_4_FWD")]
        results = await asyncio.gather(*(core.handle_ib_action(p) for p in payloads))
        self.assertEqual(calls, payloads)
        for result, payload in zip(results, payloads):
            self.assertIs(result, payload)


if __name__ == "__main__":
    unittest.main()
