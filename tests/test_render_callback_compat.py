import unittest
from types import SimpleNamespace

from bridge.render_callback_compat import (
    install_render_callback_compat,
    normalize_render_callback_payload,
)


class RenderCallbackCompatTests(unittest.TestCase):
    def test_smi_target_reconcile_aliases_exit_identity(self):
        payload = {
            "system_id": "VIXALE_SMI_FWD",
            "source": "IB_BRIDGE",
            "event": "TP",
            "reason": "IB_TARGET_EXECUTION_CONFIRMED",
            "broker_confirmed_flat": True,
            "position_after_close": 0,
            "exit_execution_id": "EXEC:abc.01",
            "ib_exit_order_id": 101,
            "ib_exit_perm_id": 202,
            "ib_exit_order_ref": "TVFVG_X_LONG_TP",
        }
        normalized = normalize_render_callback_payload(payload)
        self.assertEqual(normalized["ib_target_order_id"], 101)
        self.assertEqual(normalized["ib_target_perm_id"], 202)
        self.assertEqual(normalized["ib_target_order_ref"], "TVFVG_X_LONG_TP")
        self.assertNotIn("ib_target_order_id", payload)

    def test_smi_alias_requires_confirmed_flat_execution(self):
        payload = {
            "system_id": "VIXALE_SMI_FWD",
            "source": "IB_BRIDGE",
            "event": "TP",
            "reason": "IB_TARGET_EXECUTION_CONFIRMED",
            "broker_confirmed_flat": False,
            "position_after_close": 1,
            "exit_execution_id": "EXEC:abc.01",
            "ib_exit_order_id": 101,
        }
        self.assertNotIn("ib_target_order_id", normalize_render_callback_payload(payload))

    def test_edge_repaired_fill_projects_filled_status_and_preserves_terminal(self):
        payload = {
            "system_id": "VIXALE_EDGE",
            "source": "IB_BRIDGE",
            "event": "ENTRY_FILL",
            "entry_filled": True,
            "ib_status": "submitted_with_repaired_target",
            "ib_entry_status": "Cancelled",
            "entry_execution_id": "PERM:392867725",
            "ib_order_id": 27450,
            "ib_order_perm_id": 392867725,
            "ib_order_ref": "TVFVG_NET_SHORT",
            "ib_target_order_id": 27452,
            "ib_target_perm_id": 392867727,
            "ib_target_order_ref": "TVFVG_NET_SHORT_TP",
            "ib_entry_fill_price": 280.76,
            "ib_entry_filled_qty": 68,
            "entry": 280.76,
            "price": 280.76,
            "qty": 68,
            "target": 278.77,
        }
        normalized = normalize_render_callback_payload(payload)
        self.assertEqual(normalized["ib_entry_status"], "Filled")
        self.assertEqual(normalized["ib_entry_terminal_status"], "Cancelled")
        self.assertEqual(payload["ib_entry_status"], "Cancelled")
        self.assertNotIn("ib_entry_terminal_status", payload)

    def test_edge_repaired_fill_requires_matching_fill_evidence(self):
        payload = {
            "system_id": "VIXALE_EDGE",
            "source": "IB_BRIDGE",
            "event": "ENTRY_FILL",
            "entry_filled": True,
            "ib_status": "submitted_with_repaired_target",
            "ib_entry_status": "Cancelled",
            "entry_execution_id": "PERM:392867725",
            "ib_order_id": 27450,
            "ib_target_order_id": 27452,
            "ib_entry_fill_price": 280.76,
            "ib_entry_filled_qty": 68,
            "entry": 280.76,
            "qty": 67,
            "target": 278.77,
        }
        normalized = normalize_render_callback_payload(payload)
        self.assertEqual(normalized["ib_entry_status"], "Cancelled")
        self.assertNotIn("ib_entry_terminal_status", normalized)

    def test_unrelated_payload_is_unchanged(self):
        payload = {
            "system_id": "VIXALE_EDGE",
            "source": "IB_BRIDGE",
            "event": "TP",
            "broker_confirmed_flat": True,
            "position_after_close": 0,
            "exit_execution_id": "EXEC:net",
        }
        self.assertEqual(normalize_render_callback_payload(payload), payload)


class InstallRenderCallbackCompatTests(unittest.IsolatedAsyncioTestCase):
    async def test_installed_wrapper_normalizes_copy_before_forwarding(self):
        seen = []

        async def forward(payload):
            seen.append(payload)
            return {"forwarded": True, "status_code": 200}

        core = SimpleNamespace(forward_to_render=forward)
        install_render_callback_compat(core)
        original_payload = {
            "system_id": "VIXALE_SMI_FWD",
            "source": "IB_BRIDGE",
            "event": "TP",
            "reason": "IB_TARGET_EXECUTION_CONFIRMED",
            "broker_confirmed_flat": True,
            "position_after_close": 0,
            "exit_execution_id": "EXEC:abc",
            "ib_exit_order_ref": "TVFVG_X_LONG_TP",
        }
        result = await core.forward_to_render(original_payload)
        self.assertEqual(result["status_code"], 200)
        self.assertEqual(seen[0]["ib_target_order_ref"], "TVFVG_X_LONG_TP")
        self.assertNotIn("ib_target_order_ref", original_payload)

        wrapped = core.forward_to_render
        install_render_callback_compat(core)
        self.assertIs(core.forward_to_render, wrapped)


if __name__ == "__main__":
    unittest.main()
