"""Pure offline EOD policy tests; never opens a broker connection."""
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from bridge.smio_eod_policy import eod_due, eod_close_payload

NY = ZoneInfo("America/New_York")


class EodPolicyTests(unittest.TestCase):
    def test_disabled_by_default(self):
        self.assertFalse(eod_due(datetime(2026, 10, 22, 15, 55, tzinfo=NY), ""))

    def test_clock_boundaries(self):
        for hour, minute, expected in [(15,54,False),(15,55,True),(15,59,True),(16,0,False)]:
            with self.subTest(hour=hour,minute=minute):
                self.assertEqual(eod_due(datetime(2026,10,22,hour,minute,tzinfo=NY),"true"),expected)

    def test_weekend_and_naive_fail_closed(self):
        self.assertFalse(eod_due(datetime(2026,10,24,15,55,tzinfo=NY),"true"))
        self.assertFalse(eod_due(datetime(2026,10,22,15,55),"true"))

    def test_payload_identity(self):
        now=datetime(2026,10,22,15,55,tzinfo=NY)
        base={"setup_id":"existing:setup", "symbol":"APA", "side":"LONG"}
        result=eod_close_payload(base,now)
        self.assertEqual(result["setup_id"],base["setup_id"])
        self.assertEqual(result["reason"],"RTH_EOD")
        self.assertEqual(result["event"],"CLOSE_POSITION")
        self.assertEqual(result["eod_initiator"],"IB_BRIDGE_SMIO_DEMO_FAILSAFE")
        self.assertTrue(result["event_id"].endswith(":CLOSE:"+str(result["signal_bar_close"])+":RTH_EOD"))
        self.assertEqual(base,{"setup_id":"existing:setup","symbol":"APA","side":"LONG"})


if __name__ == "__main__":
    unittest.main()
