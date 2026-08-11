import unittest
from unittest.mock import AsyncMock, patch

from bridge import ib_bridge


class ShrekEodWatchdogTests(unittest.IsolatedAsyncioTestCase):
    async def test_duplicate_close_uses_persisted_confirmation_without_new_order(self):
        key = "2026-07-27:SPY:SHREK_1_4"
        state = {
            key: {
                "status": "confirmed_flat",
                "callback_delivered": True,
                "render_payload": {"event": "EOD_CLOSE"},
            }
        }
        row = {"strategy": "SHREK_1_4", "last_payload": {"strategy": "SHREK_1_4"}}

        with patch.object(ib_bridge.ib, "placeOrder") as place_order:
            result = await ib_bridge.flatten_one_shrek_position(
                "2026-07-27", "SPY", row, "TEST", state
            )

        self.assertEqual(result["status"], "confirmed_flat_callback_retry")
        place_order.assert_not_called()

    async def test_already_flat_does_not_submit_close(self):
        row = {"strategy": "SHREK_1_4", "last_payload": {"strategy": "SHREK_1_4"}}
        with (
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=0.0)),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.flatten_one_shrek_position(
                "2026-07-27", "SPY", row, "TEST", {}
            )

        self.assertEqual(result["status"], "already_flat")
        place_order.assert_not_called()

    async def test_target_fill_race_does_not_submit_close(self):
        row = {"strategy": "SHREK_1_4", "last_payload": {"strategy": "SHREK_1_4"}}
        with (
            patch.object(ib_bridge, "get_position_size", AsyncMock(return_value=100.0)),
            patch.object(
                ib_bridge,
                "cancel_and_verify_targets_for_shrek_eod",
                AsyncMock(return_value={
                    "ok": True,
                    "status": "position_flat_during_target_cancel",
                    "position": 0.0,
                }),
            ),
            patch.object(ib_bridge.ib, "placeOrder") as place_order,
        ):
            result = await ib_bridge.flatten_one_shrek_position(
                "2026-07-27", "SPY", row, "TEST", {}
            )

        self.assertEqual(result["status"], "target_fill_race_flat")
        place_order.assert_not_called()

    async def test_unrelated_managed_positions_are_isolated(self):
        managed = {
            "SPY": {"strategy": "SHREK_1_4"},
            "QQQ": {"strategy": "FIONA_LIMIT_PULLBACK_ATR_TARGET"},
            "IWM": {"strategy": "ELVIS"},
            "DIA": {"strategy": ""},
        }
        flatten = AsyncMock(return_value={"symbol": "SPY", "status": "confirmed_flat"})

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "load_managed_positions", return_value=managed),
            patch.object(ib_bridge, "load_force_eod_state", return_value={}),
            patch.object(ib_bridge, "flatten_one_shrek_position", flatten),
            patch.object(ib_bridge, "is_us_stock_rth_now", return_value=True),
        ):
            result = await ib_bridge.force_eod_flatten_locked("TEST")

        self.assertEqual(result["shrek_symbols_checked"], 1)
        flatten.assert_awaited_once()
        self.assertEqual(
            {row["symbol"] for row in result["details"] if row["status"] == "skipped_unrelated_strategy"},
            {"QQQ", "IWM", "DIA"},
        )

    async def test_explicit_no_eod_close_policy_is_never_flattened(self):
        managed = {
            "SPY": {
                "strategy": "SHREK_1_4",
                "last_payload": {
                    "strategy": "SHREK_1_4",
                    "eod_policy": "NO_EOD_CLOSE",
                },
            }
        }
        flatten = AsyncMock()

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "load_managed_positions", return_value=managed),
            patch.object(ib_bridge, "load_force_eod_state", return_value={}),
            patch.object(ib_bridge, "flatten_one_shrek_position", flatten),
            patch.object(ib_bridge, "is_us_stock_rth_now", return_value=True),
        ):
            result = await ib_bridge.force_eod_flatten_locked("TEST")

        self.assertEqual(result["shrek_symbols_checked"], 0)
        self.assertEqual(
            result["details"],
            [{"symbol": "SPY", "status": "skipped_no_eod_close_policy"}],
        )
        flatten.assert_not_awaited()

    async def test_pending_durable_close_handoff_is_never_flattened_again(self):
        managed = {
            "SPY": {
                "strategy": "SHREK_1_4",
                "pending_close_payload": {
                    "event": "EOD_CLOSE",
                    "symbol": "SPY",
                    "bridge_delivery_id": "EOD:SPY:pending",
                },
            }
        }
        flatten = AsyncMock()

        with (
            patch.object(ib_bridge, "ensure_ib_connected", AsyncMock()),
            patch.object(ib_bridge, "load_managed_positions", return_value=managed),
            patch.object(ib_bridge, "load_force_eod_state", return_value={}),
            patch.object(ib_bridge, "flatten_one_shrek_position", flatten),
            patch.object(ib_bridge, "is_us_stock_rth_now", return_value=True),
        ):
            result = await ib_bridge.force_eod_flatten_locked("TEST")

        self.assertEqual(result["shrek_symbols_checked"], 0)
        self.assertEqual(
            result["details"],
            [{"symbol": "SPY", "status": "pending_close_delivery_preserved"}],
        )
        flatten.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
