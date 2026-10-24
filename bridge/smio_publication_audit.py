"""Read-only SMIO publication outbox audit. No broker, Sheets, or outbox mutations."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any

def read_object(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as source:
        result = json.load(source)
    if not isinstance(result, dict):
        raise ValueError(f"expected JSON object: {path}")
    return result

def audit(outbox: dict[str, Any], journal: dict[str, Any] | None = None) -> dict[str, Any]:
    setups = (journal or {}).get("setups")
    if not isinstance(setups, dict):
        setups = None
    counts = {"quarantined": 0, "retrying": 0, "pending": 0, "malformed": 0, "other": 0}
    findings = []
    for delivery_id, item in sorted(outbox.items()):
        if not isinstance(item, dict) or not isinstance(item.get("payload"), dict):
            counts["malformed"] += 1
            findings.append({"delivery_id": delivery_id, "status": "malformed"})
            continue
        if not str(delivery_id).startswith("SMIO:"):
            counts["other"] += 1
            continue
        payload = item["payload"]
        result = item.get("last_result")
        result = result if isinstance(result, dict) else {}
        try:
            code = int(result.get("status_code") or 0)
        except (ValueError, TypeError, OverflowError):
            code = 0
        status = "quarantined" if item.get("quarantined") is True else "retrying" if code == 503 else "pending"
        counts[status] += 1
        setup_id = str(payload.get("setup_id") or payload.get("trade_id") or "")
        ownership = ("journal_unavailable" if setups is None else
                     "setup_id_missing" if not setup_id else
                     "setup_not_in_journal" if setup_id not in setups else
                     "journal_setup_present" if isinstance(setups[setup_id], dict) else
                     "journal_setup_malformed")
        findings.append({"delivery_id": str(delivery_id),
                         "symbol": str(payload.get("symbol") or ""),
                         "event": str(payload.get("event") or "").upper(),
                         "setup_id": setup_id, "status": status,
                         "attempts": item.get("attempts"),
                         "http_status": code or None,
                         "ownership_evidence": ownership})
    return {"read_only": True, "counts": counts, "findings": findings,
            "note": "Journal presence is not proof of a current broker position. No repair performed."}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--outbox", required=True, type=Path)
    parser.add_argument("--journal", type=Path)
    args = parser.parse_args()
    try:
        result = audit(read_object(args.outbox),
                       read_object(args.journal) if args.journal else None)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        parser.exit(2, f"audit unavailable: {exc}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
