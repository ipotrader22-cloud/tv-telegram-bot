"""Deterministic ES straddle coordinator; no broker imports or network effects."""
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, time
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
D = Decimal
TERMINAL = {"Filled", "Cancelled", "ApiCancelled", "Inactive"}

def decimal(value):
    result = D(str(value))
    if not result.is_finite():
        raise ValueError("Nonfinite price")
    return result

def target_price(credit):
    credit = decimal(credit)
    if credit <= 0:
        raise ValueError("Entry credit must be positive")
    return (credit * D(".865") / D(".25")).to_integral_value(
        rounding=ROUND_CEILING) * D(".25")

def midpoint(bid, ask, tick):
    bid, ask, tick = map(decimal, (bid, ask, tick))
    if not 0 < bid <= ask or tick <= 0:
        raise ValueError("Invalid bid/ask/tick")
    # Preserve the exact initial midpoint; skip an unrepresentable midpoint.
    value = (bid + ask) / 2
    if value % tick:
        raise ValueError("Midpoint is not on the confirmed combo tick grid")
    return value

@dataclass(frozen=True)
class Quote:
    bid: Decimal
    ask: Decimal
    bid_at: datetime
    ask_at: datetime
    live: bool = True

    def valid(self, now):
        try:
            return (self.live and 0 < decimal(self.bid) <= decimal(self.ask)
                    and all(t.tzinfo is not None and
                            0 <= (now - t).total_seconds() <= 5
                            for t in (self.bid_at, self.ask_at)))
        except (ValueError, TypeError):
            return False

@dataclass(frozen=True)
class Plan:
    session: str
    entry_at: datetime
    expiry_at: datetime
    call_id: int
    put_id: int
    underlying_id: int
    strike: Decimal
    entry_limit: Decimal
    entry_tick: Decimal

    def validate(self, now):
        if now.tzinfo is None:
            raise ValueError("Aware clock required")
        entry, expiry = self.entry_at.astimezone(ET), self.expiry_at.astimezone(ET)
        if (self.entry_at.tzinfo is None or self.expiry_at.tzinfo is None
                or entry.time() != time(20, 20)
                or expiry.time() != time(16)
                or entry.weekday() in (4, 5)
                or not 0 < (expiry.date() - entry.date()).days <= 4
                or expiry.weekday() > 4
                or self.session != entry.date().isoformat()
                or len({self.call_id, self.put_id, self.underlying_id}) != 3
                or min(self.call_id, self.put_id, self.underlying_id) <= 0
                or decimal(self.strike) <= 0
                or decimal(self.entry_limit) <= 0
                or decimal(self.entry_tick) <= 0
                or decimal(self.entry_limit) % decimal(self.entry_tick)):
            raise ValueError("Invalid ES PM-expiry plan")

    @property
    def close_at(self):
        return self.expiry_at - timedelta(minutes=5)

@dataclass(frozen=True)
class Order:
    ref: str
    status: str
    filled: int = 0
    average: Decimal = D("0")
    proven: bool = True

@dataclass
class Snapshot:
    now: datetime
    orders: dict = field(default_factory=dict)
    call_position: int = 0
    put_position: int = 0
    call_quote: Quote | None = None
    put_quote: Quote | None = None
    synchronized: bool = True
    foreign_activity: bool = False
    continuity: bool = True
    session_open: bool = True
    target_price_valid: bool = True

@dataclass(frozen=True)
class Command:
    kind: str
    ref: str
    action: str = ""
    quantity: int = 0
    order_type: str = ""
    price: str | None = None
    reason: str = ""

class Engine:
    """One process, one session. Caller must durably save state BEFORE effects.

    Submitted-but-missing orders are ambiguous, never retried blindly.
    All exits share one cancel/confirm/reconcile state machine.
    """
    def __init__(self, plan, state=None):
        self.plan = plan
        self.state = state if state is not None else {
            "session": plan.session, "started": False, "done": False,
            "target_ref": None, "close_refs": [], "reason": None,
            "entry_limit": str(plan.entry_limit), "blocked": None}
        if (self.state["session"] != plan.session or
                self.state["entry_limit"] != str(plan.entry_limit)):
            raise ValueError("Journal/plan mismatch")
        self.prefix = "ESSTR:" + plan.session
        self.entry_ref = self.prefix + ":ENTRY"

    def block(self, reason):
        self.state["blocked"] = reason
        return []

    def step(self, snap):
        self.plan.validate(snap.now)
        s = self.state
        if s["done"]:
            return []
        if not snap.synchronized or not snap.continuity:
            return self.block("BROKER_OR_CONTINUITY_UNPROVEN")
        if snap.foreign_activity:
            return self.block("FOREIGN_ACTIVITY")
        s["blocked"] = None
        if not s["started"]:
            if snap.now < self.plan.entry_at:
                return []
            if snap.now >= self.plan.entry_at + timedelta(seconds=60):
                s["done"] = True
                s["outcome"] = "MISSED_ENTRY"
                return []
            if not snap.session_open:
                return self.block("SESSION_CLOSED")
            if snap.call_position or snap.put_position or snap.orders:
                return self.block("CONTRACTS_NOT_EXCLUSIVE")
            s["started"] = True
            return [Command("SUBMIT", self.entry_ref, "SELL", 10, "LMT",
                            str(self.plan.entry_limit), "ENTRY")]
        entry = snap.orders.get(self.entry_ref)
        if entry is None:
            return self.block("ENTRY_ACK_UNKNOWN")
        if not entry.proven or not 0 <= entry.filled <= 10:
            return self.block("ENTRY_EXECUTIONS_UNPROVEN")
        exit_refs = ([s["target_ref"]] if s["target_ref"] else []) + s["close_refs"]
        exits = [snap.orders.get(ref) for ref in exit_refs]
        if any(o is None or not o.proven or o.filled < 0 for o in exits):
            return self.block("EXIT_ACK_OR_EXECUTIONS_UNKNOWN")
        closed = sum(o.filled for o in exits)
        remaining = entry.filled - closed
        if (remaining < 0 or snap.call_position != -remaining
                or snap.put_position != -remaining):
            return self.block("POSITION_EXECUTION_MISMATCH")
        if entry.filled and decimal(entry.average) <= 0:
            return self.block("ENTRY_CREDIT_UNPROVEN")
        if snap.now >= self.plan.close_at:
            s["reason"] = s["reason"] or "EOD_1555_ET"
        quotes = (snap.call_quote, snap.put_quote)
        if (entry.filled and all(q and q.valid(snap.now) for q in quotes)
                and sum(decimal(q.ask) for q in quotes) >=
                decimal(entry.average) * D("1.65")):
            s["reason"] = s["reason"] or "MAYDAY"
        # First partial entry: freeze actual quantity by canceling the remainder.
        # No target can race further entry fills.
        cancel = []
        if entry.status not in TERMINAL and (entry.filled or s["reason"]):
            cancel.append(Command("CANCEL", self.entry_ref))
        if s["reason"] and s["target_ref"]:
            target = snap.orders[s["target_ref"]]
            if target.status not in TERMINAL:
                cancel.append(Command("CANCEL", target.ref))
        if cancel:
            return cancel
        if entry.status not in TERMINAL:
            return []  # unchanged initial limit can wait until 15:55
        if not remaining:
            s["done"] = True
            s["outcome"] = s["reason"] or ("TARGET" if closed else "NO_FILL")
            return []
        if not s["reason"]:
            if not snap.target_price_valid:
                s['reason'] = 'TARGET_TICK_INVALID'
                # A working target must still be canceled and confirmed on a
                # subsequent pass before a close can be reserved.
                if s['target_ref'] and snap.orders[s['target_ref']].status not in TERMINAL:
                    return [Command('CANCEL', s['target_ref'])]
            elif s["target_ref"] is None:
                ref = self.prefix + ":TARGET"
                s["target_ref"] = ref
                return [Command("SUBMIT", ref, "BUY", remaining, "LMT",
                                str(target_price(entry.average)), "TARGET")]
            elif snap.orders[s["target_ref"]].status in TERMINAL:
                # Rejected/canceled target: flatten owned residual, never leave
                # it silently unprotected and never re-enter.
                s["reason"] = "TARGET_TERMINATED_WITH_POSITION"
            else:
                return []
        if not snap.session_open:
            return self.block("EXIT_SESSION_CLOSED")
        if s["close_refs"]:
            close = snap.orders[s["close_refs"][-1]]
            if close.status not in TERMINAL:
                return []
        if len(s["close_refs"]) >= 3:
            return self.block("CLOSE_REPLACEMENTS_EXHAUSTED")
        ref = self.prefix + ":CLOSE:" + str(len(s["close_refs"]) + 1)
        s["close_refs"].append(ref)
        return [Command("SUBMIT", ref, "BUY", remaining, "MKT",
                        reason=s["reason"])]
