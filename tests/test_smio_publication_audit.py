"""Regression checks for the read-only SMIO outbox audit."""
import unittest
from bridge.smio_publication_audit import audit

class SMIOPublicationAuditTests(unittest.TestCase):
    def test_quarantined_old_exits_and_retry(self):
        data = {
            "SMIO:exit:be": {"payload": {"event": "TP", "symbol": "BE", "setup_id": "BE:1"}, "quarantined": True, "attempts": 78, "last_result": {"status_code": 503}},
            "SMIO:exit:apa": {"payload": {"event": "EOD_CLOSE", "symbol": "APA", "setup_id": "APA:2"}, "attempts": 60, "last_result": {"status_code": 503}},
            "EDGE:other": {"payload": {"symbol": "QQQ"}},
        }
        before = repr(data)
        result = audit(data, {"setups": {"BE:1": {"state": "CLOSED"}}})
        self.assertEqual(repr(data), before)
        self.assertEqual(result["counts"]["quarantined"], 1)
        self.assertEqual(result["counts"]["retrying"], 1)
        self.assertEqual(result["counts"]["other"], 1)
        self.assertEqual(result["findings"][0]["ownership_evidence"], "setup_not_in_journal")
        self.assertEqual(result["findings"][1]["ownership_evidence"], "journal_setup_present")

    def test_missing_journal_is_unverified(self):
        result = audit({"SMIO:entry:x": {"payload": {"event": "ENTRY_FILL"}}})
        self.assertEqual(result["findings"][0]["ownership_evidence"], "journal_unavailable")

    def test_malformed_records_are_reported(self):
        result = audit({"SMIO:exit:a": None, "SMIO:exit:b": {"payload": []}})
        self.assertEqual(result["counts"]["malformed"], 2)

if __name__ == "__main__":
    unittest.main()
