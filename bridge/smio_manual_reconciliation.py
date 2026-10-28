"""Offline, owner-authorized reconciliation of already executed manual closes.

No broker connection, orders, callbacks or automatic adoption of foreign fills.
Callers must capture broker evidence independently and apply journal results only
with the bridge stopped, after exact ledger readback. Flat alone never suffices.
"""
from copy import deepcopy
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from zoneinfo import ZoneInfo


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def number(value):
    if isinstance(value, bool):
        raise ValueError("boolean quantity/price")
    result = Decimal(str(value))
    if not result.is_finite() or result <= 0:
        raise ValueError("invalid execution quantity/price")
    return result


def stamp(value):
    result = datetime.fromisoformat(value)
    if result.tzinfo is None:
        raise ValueError("execution timestamp lacks timezone")
    return result


def plan_manual_close(row, broker, cancellations, authorization):
    """Prove one exact, fully closed LONG setup; partial/ambiguous cases fail closed."""
    payload = row["payload"]
    setup, symbol = payload["setup_id"], payload["symbol"]
    if authorization.get("setup_id") != setup or authorization.get("manual_close_confirmed") is not True:
        raise ValueError("exact owner authorization required")
    qty = number(row["filled_qty"])
    if qty != number(authorization["quantity"]) or qty != number(payload["qty"]) or payload["side"] != "LONG":
        raise ValueError("authorized setup quantity/side mismatch")
    if broker.get("account_match") is not True or broker.get("read_only") is not True:
        raise ValueError("attested broker capture required")
    if row.get("close") or row.get("retired_closes") or row.get("retired_targets"):
        raise ValueError("automatic/multiple exit ownership requires separate review")
    if any(p["symbol"] == symbol and (p.get("account_match") is not True or Decimal(str(p["position"])) != 0) for p in broker["positions"]):
        raise ValueError("broker not flat on verified account")
    if any(o["symbol"] == symbol for o in broker["open_orders"]):
        raise ValueError("working order remains")
    fills = {}
    for fill in broker["executions"]:
        if fill["symbol"] != symbol:
            continue
        eid = fill.get("exec_id")
        if not eid or fill.get("account_match") is not True:
            raise ValueError("execution account/identity unavailable")
        number(fill["qty"]); number(fill["price"]); stamp(fill["time"])
        if eid in fills and fills[eid] != fill:
            raise ValueError("conflicting execution ID")
        fills[eid] = fill
    entries = {k:v for k,v in fills.items() if v["side"] == "BOT"}
    exits = {k:v for k,v in fills.items() if v["side"] == "SLD"}
    known = row["entry"].get("executions", {})
    if not known or set(entries) != set(known) or len(entries) + len(exits) != len(fills):
        raise ValueError("entry execution history missing or competing ownership")
    for eid, fill in entries.items():
        if (fill["order_ref"] != row["entry"]["ref"] or fill["order_id"] != row["entry"]["id"]
                or number(fill["qty"]) != number(known[eid]["qty"]) or number(fill["price"]) != number(known[eid]["price"])):
            raise ValueError("entry execution identity conflict")
    contracts = {fingerprint(f.get("contract")) for f in fills.values()}
    contract = next(iter(entries.values()))["contract"]
    if len(contracts) != 1 or not contract.get("con_id") or contract.get("sec_type") != "STK" or contract.get("symbol") != symbol or contract.get("currency") != "USD":
        raise ValueError("contract identity conflict")
    if not exits or any(f["client_id"] != 0 or f["order_ref"] or not f["perm_id"] for f in exits.values()):
        raise ValueError("manual execution identity missing/ambiguous")
    if min(stamp(f["time"]) for f in exits.values()) < max(stamp(f["time"]) for f in entries.values()):
        raise ValueError("manual exit precedes completed entry")
    if any(sum(number(f["qty"]) for f in group.values()) != qty for group in (entries, exits)):
        raise ValueError("partial or excess execution coverage; no terminal repair")
    target = row.get("target")
    cancelled = None
    if target:
        matches = [c for c in cancellations if c.get("order_ref") == target["ref"] and c.get("symbol") == symbol
                   and c.get("account_match") is True and c.get("action") == "SELL"
                   and c.get("status") in ("Cancelled", "ApiCancelled") and c.get("completed_time")
                   and number(c["qty"]) == qty and c.get("perm_id")]
        if not matches or target.get("executions"):
            raise ValueError("terminal target cancellation proof unavailable")
        cancelled = matches[0]
    entry_value = sum(number(f["qty"]) * number(f["price"]) for f in entries.values())
    exit_value = sum(number(f["qty"]) * number(f["price"]) for f in exits.values())
    proof = {"setup_id": setup, "symbol": symbol, "quantity": float(qty), "contract": contract,
             "account_verified": True, "entry_executions": entries, "exit_executions": exits,
             "target_cancellation": cancelled, "authorization": authorization,
             "broker_capture_at": broker["captured_at"], "entry_price": float(entry_value / qty),
             "exit_price": float(exit_value / qty), "gross_realized_pnl": float(exit_value - entry_value),
             "close_time_et": max(stamp(f["time"]) for f in exits.values()).astimezone(ZoneInfo("America/New_York")).strftime("%Y-%m-%d %H:%M:%S"),
             "reason": "MANUAL_CLOSE", "no_broker_mutations": True}
    proof["reconciliation_id"] = reconciliation_id(proof)
    return proof


def reconciliation_id(proof):
    # Capture time may change on a retry; execution identity must not.
    return "SMIO_MANUAL:" + fingerprint({k:v for k,v in proof.items()
        if k not in ("reconciliation_id", "broker_capture_at")})


def finalize_manual_close(row, proof, ledger):
    """Return a new terminal row only after exact durable ledger readback.

Never marks a nonexistent callback delivered; publication is an explicit audited
ledger repair. Retains historical diagnostics and all original order identities.
"""
    if proof.get("setup_id") != row["payload"]["setup_id"] or not proof.get("exit_executions"):
        raise ValueError("proof does not bind setup")
    if proof["reconciliation_id"] != reconciliation_id(proof):
        raise ValueError("proof fingerprint mismatch")
    if (proof.get("quantity") != row["filled_qty"] or proof.get("symbol") != row["payload"]["symbol"]
            or set(proof.get("entry_executions", {})) != set(row["entry"].get("executions", {}))):
        raise ValueError("journal changed since proof")
    if (ledger.get("setup_id") != proof["setup_id"] or ledger.get("reconciliation_id") != proof["reconciliation_id"]
            or ledger.get("open_rows") != 0 or ledger.get("pending_rows") != 0 or ledger.get("closed_rows") != 1
            or ledger.get("close_time_et") != proof["close_time_et"]
            or ledger.get("quantity") != proof["quantity"] or ledger.get("exit_price") != proof["exit_price"]
            or ledger.get("entry_price") != proof["entry_price"]
            or ledger.get("gross_realized_pnl") != proof["gross_realized_pnl"]):
        raise ValueError("exact ledger readback required")
    old = row.get("manual_reconciliation")
    if old and old["reconciliation_id"] != proof["reconciliation_id"]:
        raise ValueError("conflicting prior reconciliation")
    result = deepcopy(row)
    result.update(state="CLOSED", result="VERIFIED_MANUAL_CLOSE", manual_reconciliation=deepcopy(proof),
                  manual_publication=deepcopy(ledger))
    result.pop("recovery_blocker", None)
    return result
