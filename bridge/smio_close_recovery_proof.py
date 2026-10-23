"""Fail-closed, read-only eligibility check for SMIO historical close recovery.

This module does not change the lifecycle, lift the execution-history gate,
publish a callback, or submit/cancel broker orders. An independent broker-history
coverage attestation must be supplied by a separately reviewed recovery workflow.
"""
from math import isfinite


def _order_total(order):
    if not isinstance(order, dict) or not order.get("id") or not order.get("ref"):
        return None
    executions = order.get("executions")
    if not isinstance(executions, dict) or not executions:
        return None
    total = 0.0
    for exec_id, fill in executions.items():
        if not exec_id or not isinstance(fill, dict):
            return None
        try:
            qty, price = float(fill["qty"]), float(fill["price"])
        except (KeyError, TypeError, ValueError):
            return None
        if not all(map(isfinite, (qty, price))) or qty <= 0 or price <= 0:
            return None
        total += qty
    return total


def candidate_close_proof(row, broker_proof):
    """Return (eligible, reason); NEVER use this alone to authorize publication.

    broker_proof is a separately obtained *authoritative* verification result,
    not the journal's own coverage flag or the current position alone.
    """
    if not isinstance(row, dict) or not isinstance(broker_proof, dict):
        return False, "missing_evidence"
    if row.get("state") not in ("CLOSE_PENDING", "TARGET_CANCEL_PENDING"):
        return False, "unexpected_state"
    if row.get("exit_delivery_id") or row.get("exit_callback"):
        return False, "already_published_or_queued"
    if row.get("recovery_blocker", "").startswith("foreign execution"):
        return False, "foreign_execution"
    entry, close, target = (row.get(k) for k in ("entry", "close", "target"))
    entry_qty, close_qty = _order_total(entry), _order_total(close)
    if entry_qty is None or close_qty is None or not isinstance(target, dict):
        return False, "incomplete_order_evidence"
    if target.get("executions") not in ({}, None):
        return False, "target_fills_need_separate_reconciliation"
    if row.get("retired_closes") or row.get("retired_targets"):
        return False, "retired_orders_need_separate_reconciliation"
    if entry.get("action") != "BUY" or close.get("action") != "SELL":
        return False, "unexpected_order_sides"
    if abs(entry_qty - close_qty) > 0.000001 or entry_qty <= 0:
        return False, "unbalanced_executions"
    if abs(entry_qty - float(row.get("filled_qty") or 0)) > 0.000001:
        return False, "entry_quantity_mismatch"
    for key in ("broker_flat_verified", "account_ownership_verified",
                "complete_execution_history_verified", "no_foreign_fills_verified",
                "no_working_orders_verified", "exact_order_refs_verified"):
        if broker_proof.get(key) is not True:
            return False, "independent_" + key + "_missing"
    if broker_proof.get("setup_id") != row.get("payload", {}).get("setup_id"):
        return False, "setup_identity_mismatch"
    if broker_proof.get("entry_order_ref") != entry["ref"] or broker_proof.get("close_order_ref") != close["ref"]:
        return False, "order_reference_mismatch"
    return True, "eligible_for_review_only"
