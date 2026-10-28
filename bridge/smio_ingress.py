"""Durable SMIO receipt journal. Single bridge writer; no broker imports/actions."""
import hashlib
import json
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    from .smio_demo_contract import validate
except ImportError:
    from smio_demo_contract import validate


class IngressConflict(ValueError):
    pass


class IngressInvalid(ValueError):
    pass


class DurableIngress:
    """Atomic receipt/claim/result writes, separate from the broker lifecycle lock.

    Only fresh work in this process can be retried automatically. A prior process
    may have submitted before dying, so its unfinished receipts require review.
    """
    def __init__(self, path):
        self.path = Path(path)
        self.process_id = uuid.uuid4().hex

    def load(self):
        if not self.path.exists():
            return {"version": 1, "receipts": {}}
        state = json.loads(self.path.read_text(encoding="utf-8"))
        if state.get("version") != 1 or not isinstance(state.get("receipts"), dict):
            raise ValueError("invalid SMIO receipt journal")
        for key, row in state["receipts"].items():
            if not isinstance(row, dict) or row.get("payload", {}).get("event_id") != key:
                raise ValueError("invalid SMIO receipt identity")
            if row.get("hash") != self.fingerprint(row["payload"]):
                raise ValueError("SMIO receipt body integrity conflict")
            if row.get("state") not in ("RECEIVED", "PROCESSING", "RETRY", "HANDLED", "QUARANTINED"):
                raise ValueError("invalid SMIO receipt state")
        return state

    def save(self, state):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as stream:
            json.dump(state, stream, sort_keys=True, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, self.path)

    @staticmethod
    def body(data):
        # Transport timestamps may change on a retry; execution mode may not.
        value = {k: v for k, v in data.items() if not k.startswith("render_")}
        value["dry_run"] = data.get("dry_run") is True
        return value

    @staticmethod
    def same_day(data, now):
        ny = ZoneInfo("America/New_York")
        return datetime.fromtimestamp(data["signal_bar_close"] / 1000, ny).date() == datetime.fromtimestamp(now, ny).date()

    @classmethod
    def fingerprint(cls, data):
        return hashlib.sha256(json.dumps(cls.body(data), sort_keys=True, allow_nan=False).encode()).hexdigest()

    def accept(self, data):
        now = time.time()
        try:
            validate(data, now_ms=data.get("signal_bar_close"))
        except (ValueError, TypeError, AttributeError):
            raise IngressInvalid("invalid SMIO signal") from None
        fingerprint = self.fingerprint(data)
        state = self.load()
        existing = state["receipts"].get(data["event_id"])
        if existing:
            if existing["hash"] != fingerprint:
                raise IngressConflict("SMIO event body conflict")
            return existing, False
        try:
            validate(data, now_ms=now * 1000)
        except ValueError:
            raise IngressInvalid("expired or future SMIO signal") from None
        if not self.same_day(data, now):
            raise IngressInvalid("prior-day SMIO signal requires review; no replay")
        row = {"payload": dict(data), "hash": fingerprint, "received_at": now,
               "process_id": self.process_id, "state": "RECEIVED", "attempts": 0}
        state["receipts"][data["event_id"]] = row
        self.save(state)  # Must succeed before the HTTP acknowledgement.
        return row, True

    def claim(self, event_id):
        state = self.load()
        row = state["receipts"].get(event_id)
        if not row or row["state"] not in ("RECEIVED", "RETRY", "PROCESSING"):
            return None
        reason = None
        if row["process_id"] != self.process_id:
            reason = "prior_process_requires_broker_review"
        elif row["state"] == "PROCESSING":
            return None  # A background task already owns this receipt.
        elif time.time() < row.get("retry_after", 0):
            return None
        elif time.time() - row["received_at"] > 90 or not self.same_day(row["payload"], time.time()):
            reason = "receipt_expired_requires_review"
        else:
            try:
                validate(row["payload"])
            except ValueError:
                reason = "signal_expired_or_invalid_requires_review"
        if reason:
            row.update(state="QUARANTINED", reason=reason)
            self.save(state)
            return None
        row.update(state="PROCESSING", attempts=row["attempts"] + 1, handler_started_at=time.time())
        self.save(state)  # Unknown submission stays claimed if result persistence fails.
        return row["payload"]

    def finish(self, event_id, result, lifecycle_owns_event):
        state = self.load()
        row = state["receipts"][event_id]
        status = result.get("status", "unknown")
        retry = (status == "smio_demo_blocked" and not lifecycle_owns_event
                 and row["attempts"] < 3 and time.time() - row["received_at"] < 90)
        row.update(state="RETRY" if retry else "HANDLED", finished_at=time.time(),
                   result_status=status, broker_execution=result.get("broker_execution"))
        if retry:
            row["retry_after"] = time.time() + 5
        if result.get("reason"):
            row["reason"] = str(result["reason"])[:500]
        self.save(state)

    def pending(self):
        return [key for key, row in self.load()["receipts"].items()
                if row["state"] in ("RECEIVED", "RETRY", "PROCESSING")]

    def summary(self):
        counts = {}
        for row in self.load()["receipts"].values():
            counts[row["state"]] = counts.get(row["state"], 0) + 1
        return {"durable_receipts": True, "states": counts}
