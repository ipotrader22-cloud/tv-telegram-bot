import unittest
from datetime import datetime, timezone
from bridge.smio_stale_entry_guard import stale_smio_entry_callback

UTC = timezone.utc

class SMIOStaleEntryGuardTests(unittest.TestCase):
    def test_prior_day_retry_quarantined(self):
        self.assertTrue(stale_smio_entry_callback(
            {"event": "ENTRY_FILL", "signal_bar_time": 1792693800000},
            datetime(2026, 10, 23, 12, 0, tzinfo=UTC)))

    def test_same_day_allowed(self):
        self.assertFalse(stale_smio_entry_callback(
            {"event": "ENTRY_FILL", "signal_bar_time": 1792693800000},
            datetime(2026, 10, 22, 19, 10, tzinfo=UTC)))

    def test_exit_unaffected(self):
        self.assertFalse(stale_smio_entry_callback(
            {"event": "EOD_CLOSE", "signal_bar_time": 1792693800000},
            datetime(2026, 10, 23, 12, 0, tzinfo=UTC)))

    def test_invalid_time_fails_closed(self):
        now = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)
        for stamp in (None, "", "x", 0, -1, float("nan"), float("inf"), True):
            self.assertTrue(stale_smio_entry_callback(
                {"event": "ENTRY_FILL", "signal_bar_time": stamp}, now))

    def test_new_york_day_boundary(self):
        self.assertFalse(stale_smio_entry_callback(
            {"event": "ENTRY_FILL", "signal_bar_time": 1792693800000},
            datetime(2026, 10, 23, 3, 30, tzinfo=UTC)))

if __name__ == "__main__":
    unittest.main()
