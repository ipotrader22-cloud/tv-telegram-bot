import unittest
from bridge.smio_close_recovery_proof import candidate_close_proof


class TestSMIOCloseProof(unittest.TestCase):
    def setUp(self):
        self.row = {
            "state": "CLOSE_PENDING", "filled_qty": 693,
            "payload": {"setup_id": "COP:exact"},
            "entry": {"id": 101431, "ref": "SMIOE_COP", "action": "BUY",
                      "executions": {"e1": {"qty": 693, "price": 146.4}}},
            "target": {"id": 101432, "ref": "SMIOT_COP", "executions": {}},
            "close": {"id": 122237, "ref": "SMIOC_COP", "action": "SELL",
                      "executions": {"x1": {"qty": 693, "price": 145.95}}},
        }
        self.proof = dict(setup_id="COP:exact", entry_order_ref="SMIOE_COP",
                          close_order_ref="SMIOC_COP",
                          broker_flat_verified=True, account_ownership_verified=True,
                          complete_execution_history_verified=True,
                          no_foreign_fills_verified=True,
                          no_working_orders_verified=True, exact_order_refs_verified=True)

    def test_no_independent_history_fails_closed(self):
        proof = dict(self.proof, complete_execution_history_verified=False)
        self.assertFalse(candidate_close_proof(self.row, proof)[0])

    def test_missing_proof_fails_closed(self):
        self.assertFalse(candidate_close_proof(self.row, {})[0])

    def test_complete_exact_evidence_review_only(self):
        self.assertEqual(candidate_close_proof(self.row, self.proof),
                         (True, "eligible_for_review_only"))

    def test_duplicate_callback_rejected(self):
        self.row["exit_delivery_id"] = "already-sent"
        self.assertFalse(candidate_close_proof(self.row, self.proof)[0])

    def test_target_execution_rejected(self):
        self.row["target"]["executions"] = {"t1": {"qty": 100, "price": 147.23}}
        self.assertFalse(candidate_close_proof(self.row, self.proof)[0])

    def test_partial_exit_rejected(self):
        self.row["close"]["executions"]["x1"]["qty"] = 400
        self.assertFalse(candidate_close_proof(self.row, self.proof)[0])

    def test_foreign_setup_rejected(self):
        self.proof["setup_id"] = "different"
        self.assertFalse(candidate_close_proof(self.row, self.proof)[0])

    def test_non_finite_execution_rejected(self):
        self.row["close"]["executions"]["x1"]["price"] = float("nan")
        self.assertFalse(candidate_close_proof(self.row, self.proof)[0])


if __name__ == "__main__":
    unittest.main()
