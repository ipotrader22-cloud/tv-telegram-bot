"""Offline SMIO demo EOD schedule tests. No broker connection."""
import unittest
from datetime import datetime
from types import SimpleNamespace as N
from zoneinfo import ZoneInfo

from bridge.smio_eod_policy import eod_due, eod_close_payload, session_close_from_ib

NY = ZoneInfo("America/New_York")


def stamp(text, day, tz):
    try:
        date, hour = text.split(":")
        return datetime.strptime(date + hour, "%Y%m%d%H%M").replace(tzinfo=tz)
    except Exception:
        return None


class EodPolicyTests(unittest.TestCase):
    def setUp(self):
        self.end = datetime(2026, 10, 22, 16, 0, tzinfo=NY)

    def test_disabled_or_unknown_schedule_fails_closed(self):
        now = datetime(2026, 10, 22, 15, 55, tzinfo=NY)
        self.assertFalse(eod_due(now, "", self.end))
        self.assertFalse(eod_due(now, "true"))
        self.assertFalse(eod_due(now, "true", datetime(2026, 10, 22, 16, 0)))

    def test_normal_session_boundaries(self):
        for hour, minute, expected in [(15,54,False),(15,55,True),(15,59,True),(16,0,False)]:
            with self.subTest(hour=hour, minute=minute):
                self.assertEqual(eod_due(datetime(2026,10,22,hour,minute,tzinfo=NY),
                                         "true", self.end), expected)

    def test_early_close_and_holiday(self):
        now = datetime(2026, 11, 27, 12, 55, tzinfo=NY)
        early = N(liquidHours="20261127:0930-20261127:1300", timeZoneId="America/New_York")
        end = session_close_from_ib(early, now, NY, stamp)
        self.assertEqual(end, datetime(2026, 11, 27, 13, 0, tzinfo=NY))
        self.assertTrue(eod_due(now, "true", end))
        self.assertFalse(eod_due(datetime(2026,11,27,15,55,tzinfo=NY),"true",end))
        holiday = N(liquidHours="20261126:CLOSED", timeZoneId="America/New_York")
        self.assertIsNone(session_close_from_ib(holiday, now, NY, stamp))

    def test_ambiguous_or_bad_sessions_block(self):
        now = datetime(2026,10,22,15,55,tzinfo=NY)
        for hours in ("", "20261022:CLOSED", "BROKEN",
                      "20261022:0930-20261022:1600;20261022:0930-20261022:1600",
                      "20261022:0930-20261022:1800",
                      "20261022:0400-20261022:1600"):
            with self.subTest(hours=hours):
                self.assertIsNone(session_close_from_ib(N(liquidHours=hours),now,NY,stamp))

    def test_weekend_and_naive_fail_closed(self):
        self.assertFalse(eod_due(datetime(2026,10,24,15,55,tzinfo=NY),"true",self.end))
        self.assertFalse(eod_due(datetime(2026,10,22,15,55),"true",self.end))

    def test_payload_identity(self):
        now = datetime(2026,10,22,15,55,tzinfo=NY)
        base={"setup_id":"existing:setup","symbol":"APA","side":"LONG"}
        result=eod_close_payload(base,now,self.end)
        self.assertEqual(result["setup_id"],base["setup_id"])
        self.assertEqual(result["reason"],"RTH_EOD")
        self.assertEqual(result["event"],"CLOSE_POSITION")
        self.assertEqual(result["eod_initiator"],"IB_BRIDGE_SMIO_DEMO_FAILSAFE")
        self.assertTrue(result["event_id"].endswith(":CLOSE:"+str(result["signal_bar_close"])+":RTH_EOD"))
        self.assertEqual(base,{"setup_id":"existing:setup","symbol":"APA","side":"LONG"})


if __name__ == "__main__":
    unittest.main()
