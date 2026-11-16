"""Isolated, opt-in TWS PAPER adapter. Never imported by the stock bridge."""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, time, timezone
from pathlib import Path
from decimal import Decimal
from zoneinfo import ZoneInfo
from .core import (D, ET, Engine, Order, Plan, Quote, Snapshot, midpoint,
                   TERMINAL, decimal)

def now():
    return datetime.now(timezone.utc)

def save(path, value):
    temp = path.with_suffix(".tmp")
    with temp.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)

def intervals(text, zone):
    result = []
    for segment in text.split(";"):
        day, _, hours = segment.partition(":")
        if not hours or hours == "CLOSED":
            continue
        for span in hours.split(","):
            start, end = span.split("-")
            def parse(value):
                if ":" not in value:
                    value = day + ":" + value
                return datetime.strptime(value, "%Y%m%d:%H%M").replace(tzinfo=zone)
            result.append((parse(start), parse(end)))
    return result

def expiry_time(detail):
    # Refuse missing PM-expiry evidence; never infer daily vs quarterly from name.
    value = detail.lastTradeTime
    if not value:
        raise ValueError("IB lastTradeTime unavailable: PM expiry unverified")
    zone = ZoneInfo(detail.timeZoneId)
    day = detail.realExpirationDate
    expiry = datetime.strptime(day + " " + value, "%Y%m%d %H:%M:%S").replace(tzinfo=zone)
    if expiry.astimezone(ET).time() != time(16):
        raise ValueError("Not a 16:00 ET expiration")
    return expiry

def prove_fill(trade, call_id, put_id):
    """Require exact execIds, account and side; BAG or equal paired leg fills."""
    status = trade.orderStatus
    q = decimal(status.filled)
    if q == 0:
        return 0, D("0"), True
    if q != q.to_integral_value():
        return 0, D("0"), False
    seen = {}
    side = "SLD" if trade.order.action == "SELL" else "BOT"
    for fill in trade.fills:
        e = fill.execution
        if (not e.execId or e.acctNumber != trade.order.account
                or e.side != side or e.orderId != trade.order.orderId):
            continue
        value = (fill.contract.conId, fill.contract.secType,
                 decimal(e.shares), decimal(e.price))
        if e.execId in seen and seen[e.execId] != value:
            return int(q), D("0"), False
        seen[e.execId] = value
    bag = [x for x in seen.values() if x[1] == "BAG"]
    if bag:
        total = sum(x[2] for x in bag)
        price = sum(x[2] * x[3] for x in bag) / total if total else D("0")
        return int(q), price, total == q and price > 0
    price = D("0")
    for cid in (call_id, put_id):
        legs = [x for x in seen.values() if x[0] == cid and x[1] == "FOP"]
        total = sum(x[2] for x in legs)
        if total != q:
            return int(q), D("0"), False
        price += sum(x[2] * x[3] for x in legs) / total
    return int(q), price, price > 0

class TWS:
    def __init__(self, args):
        from ib_insync import IB, Contract, ComboLeg, LimitOrder, MarketOrder
        self.Contract, self.ComboLeg = Contract, ComboLeg
        self.LimitOrder, self.MarketOrder = LimitOrder, MarketOrder
        if not args.account.startswith("DU") or args.client_id <= 0:
            raise ValueError("Only an explicit DU paper account and nonzero client ID are allowed")
        if args.port not in (7497, 4002):
            raise ValueError("Only standard paper TWS/Gateway ports are allowed")
        self.account, self.client_id = args.account, args.client_id
        self.ib = IB()
        self.ib.RequestTimeout = 10
        self.ib.RaiseRequestErrors = True
        self.ib.connect("127.0.0.1", args.port, clientId=args.client_id,
                        readonly=not args.paper_execute, account=args.account,
                        raiseSyncErrors=True)
        if args.account not in self.ib.managedAccounts():
            raise ValueError("Exact paper account not present")
        self.continuous = True
        self.ib.disconnectedEvent += self.disconnected
        self.ib.errorEvent += self.error
        self.quotes = {}
        self.ib.pendingTickersEvent += self.ticks
        self.underlying_id = args.underlying_id
        self.combo_tick = decimal(args.combo_tick)
        if self.combo_tick <= 0:
            raise ValueError("Positive verified combo tick required")
        self.ib.reqMarketDataType(1)

    def disconnected(self):
        self.continuous = False

    def error(self, request_id, code, message, contract):
        if code in (1100, 1101, 1102, 1300):
            self.continuous = False

    def ticks(self, tickers):
        observed = now()
        for ticker in tickers:
            item = self.quotes.setdefault(ticker.contract.conId, {})
            for tick in ticker.ticks:
                if tick.tickType == 1:
                    item["bid_at"] = observed
                elif tick.tickType == 2:
                    item["ask_at"] = observed

    def quote(self, contract):
        ticker = self.ib.ticker(contract)
        stamps = self.quotes.get(contract.conId, {})
        if ticker is None or not stamps.get("bid_at") or not stamps.get("ask_at"):
            return None
        try:
            return Quote(decimal(ticker.bid), decimal(ticker.ask),
                         stamps["bid_at"], stamps["ask_at"],
                         ticker.marketDataType == 1)
        except ValueError:
            return None

    def select(self, clock):
        Contract = self.Contract
        under = self.ib.reqContractDetails(Contract(conId=self.underlying_id, exchange="CME"))
        if len(under) != 1:
            raise ValueError("Underlying conId is ambiguous")
        future = under[0].contract
        if (future.secType != "FUT" or future.symbol != "ES"
                or future.currency != "USD" or future.multiplier != "50"):
            raise ValueError("Underlying must be CME ES ($50 multiplier), not MES")
        ticks = self.ib.reqTickers(future)
        if len(ticks) != 1 or ticks[0].marketDataType != 1:
            raise ValueError("Live ES bid/ask required")
        ticker = ticks[0]
        if ticker.time is None or not 0 <= (now() - ticker.time).total_seconds() <= 5:
            raise ValueError("Stale ES quote")
        bid, ask = decimal(ticker.bid), decimal(ticker.ask)
        if not 0 < bid <= ask:
            raise ValueError("Invalid ES quote")
        reference = (bid + ask) / 2
        chains = self.ib.reqSecDefOptParams("ES", "CME", "FUT", future.conId)
        entry = clock.astimezone(ET).replace(hour=20, minute=20, second=0, microsecond=0)
        choices = []
        for chain in chains:
            if chain.underlyingConId != future.conId or chain.multiplier != "50":
                continue
            for expiry in chain.expirations:
                day = datetime.strptime(expiry, "%Y%m%d").date()
                if 0 < (day - entry.date()).days <= 4 and day.weekday() < 5:
                    strike = min(chain.strikes, key=lambda x: (abs(decimal(x)-reference), x))
                    choices.append((expiry, abs(decimal(strike)-reference),
                                    decimal(strike), chain.tradingClass))
        if not choices:
            raise ValueError("No upcoming ES option expiry")
        first_expiry = min(x[0] for x in choices)
        candidates = sorted(set(x for x in choices if x[0] == first_expiry))
        valid = []
        for expiry, distance, strike, trading_class in candidates:
            details = []
            for right in ("C", "P"):
                spec = Contract(symbol="ES", secType="FOP", exchange="CME",
                                currency="USD", multiplier="50", right=right,
                                strike=float(strike), lastTradeDateOrContractMonth=expiry,
                                tradingClass=trading_class)
                found = self.ib.reqContractDetails(spec)
                if len(found) != 1:
                    break
                detail = found[0]
                if (detail.underConId != future.conId or
                        detail.realExpirationDate != expiry or
                        detail.contract.secType != "FOP"):
                    break
                try:
                    expiry_at = expiry_time(detail)
                    hours = intervals(detail.tradingHours, ZoneInfo(detail.timeZoneId))
                    if not any(a <= clock < b for a, b in hours):
                        break
                except (ValueError, KeyError):
                    break
                details.append((detail, expiry_at))
            if len(details) == 2 and details[0][1] == details[1][1]:
                valid.append((strike, details))
        if not valid:
            raise ValueError("No exact paired PM-expiry contracts with an open IB session")
        valid.sort(key=lambda x: (abs(x[0] - reference), x[0]))
        if len(valid) > 1 and valid[0][0] == valid[1][0]:
            raise ValueError("Ambiguous PM trading class")
        strike, pair = valid[0]
        self.call, self.put = (x[0].contract for x in pair)
        self.details = [x[0] for x in pair]
        self.expiry = pair[0][1]
        self.bag = Contract(symbol="ES", secType="BAG", exchange="CME", currency="USD")
        self.bag.comboLegs = [
            self.ComboLeg(conId=c.conId, ratio=1, action="BUY", exchange="CME")
            for c in (self.call, self.put)]
        # A positive SELL price credits both BUY-oriented legs.
        for c in (self.call, self.put):
            self.ib.reqMktData(c)
        deadline = now() + timedelta(seconds=10)
        while now() < deadline:
            self.ib.sleep(.1)
            quotes = [self.quote(c) for c in (self.call, self.put)]
            if all(q and q.valid(now()) for q in quotes):
                break
        else:
            raise ValueError("Fresh two-sided real-time option quotes unavailable")
        # Exact midpoint only. The combo tick is a locally verified instrument
        # setting, not a strategy reprice or assumed individual-leg tick.
        entry_tick = self.combo_tick
        price = midpoint(sum(q.bid for q in quotes), sum(q.ask for q in quotes), entry_tick)
        plan = Plan(entry.date().isoformat(), entry, self.expiry,
                    self.call.conId, self.put.conId, future.conId, strike, price, entry_tick)
        plan.validate(now())
        return plan

    def snapshot(self, engine):
        if not self.ib.isConnected() or not self.continuous:
            return Snapshot(now(), synchronized=False, continuity=False)
        self.ib.reqAllOpenOrders()
        positions = self.ib.reqPositions()
        orders, foreign = {}, False
        ids = {self.call.conId, self.put.conId}
        for trade in self.ib.trades():
            contract, order = trade.contract, trade.order
            involved = contract.conId in ids or any(
                leg.conId in ids for leg in (contract.comboLegs or []))
            if not involved or order.account != self.account:
                continue
            if (not order.orderRef.startswith(engine.prefix + ":")
                    or order.clientId != self.client_id):
                # A foreign filled/canceled trade is an ownership conflict too.
                foreign = True
                continue
            if order.orderRef in orders:
                foreign = True
                continue
            quantity, price, proven = prove_fill(trade, self.call.conId, self.put.conId)
            orders[order.orderRef] = Order(order.orderRef, trade.orderStatus.status,
                                          quantity, price, proven)
        pos = {c: D("0") for c in ids}
        for p in positions:
            if p.account == self.account and p.contract.conId in ids:
                pos[p.contract.conId] += decimal(p.position)
        integral = all(q == q.to_integral_value() for q in pos.values())
        clock = now()
        session_open = all(any(a <= clock < b for a, b in
                               intervals(d.tradingHours, ZoneInfo(d.timeZoneId)))
                           for d in self.details)
        return Snapshot(clock, orders, int(pos[self.call.conId]), int(pos[self.put.conId]),
                        self.quote(self.call), self.quote(self.put),
                        synchronized=integral, foreign_activity=foreign,
                        continuity=self.continuous, session_open=session_open)

    def execute(self, command):
        if command.kind == "CANCEL":
            trades = [t for t in self.ib.trades()
                      if t.order.orderRef == command.ref
                      and t.order.account == self.account
                      and t.order.clientId == self.client_id]
            if len(trades) != 1:
                raise RuntimeError("Exact cancellation identity unavailable")
            if trades[0].orderStatus.status not in TERMINAL:
                self.ib.cancelOrder(trades[0].order)
            return
        if command.kind != "SUBMIT":
            raise ValueError("Unknown command")
        if any(t.order.orderRef == command.ref for t in self.ib.trades()):
            raise RuntimeError("Duplicate submission refused")
        if command.order_type == "LMT":
            order = self.LimitOrder(command.action, command.quantity, float(command.price))
        else:
            order = self.MarketOrder(command.action, command.quantity)
        order.account = self.account
        order.orderRef = command.ref
        order.tif = "GTC" if command.reason == "TARGET" else "DAY"
        order.outsideRth = True
        self.ib.placeOrder(self.bag, order)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", required=True, help="Exact DU paper account; never committed")
    parser.add_argument("--underlying-id", required=True, type=int, help="Verified current ES futures conId")
    parser.add_argument("--combo-tick", required=True, help="Verified ES combo minimum price increment")
    parser.add_argument("--port", type=int, default=7497)
    parser.add_argument("--client-id", type=int, default=1820)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--paper-execute", action="store_true",
                        help="Explicit opt-in; otherwise read-only immediate preflight")
    args = parser.parse_args()
    args.state_dir.mkdir(parents=True, exist_ok=True)
    lock_path = args.state_dir / "executor.lock"
    lock = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.write(lock, str(os.getpid()).encode())
    broker = None
    try:
        for path in args.state_dir.glob("session-*.json"):
            record = json.loads(path.read_text(encoding="utf-8"))
            if not record["state"]["done"]:
                raise RuntimeError("Unresolved prior journal: reconcile broker orders/positions; do not delete it")
        broker = TWS(args)
        if not args.paper_execute:
            plan = broker.select(now())
            print(json.dumps({"preflight_only": True, "strike": str(plan.strike),
                              "call_id": plan.call_id, "put_id": plan.put_id,
                              "expiry": plan.expiry_at.isoformat(),
                              "midpoint": str(plan.entry_limit)}))
            return
        while broker.ib.isConnected() and broker.continuous:
            clock = now().astimezone(ET)
            path = args.state_dir / ("session-" + clock.date().isoformat() + ".json")
            if (clock.weekday() in (4, 5) or clock.time() < time(20, 20)
                    or clock.time() >= time(20, 21) or path.exists()):
                broker.ib.sleep(1)
                continue
            try:
                plan = broker.select(now())
            except (ValueError, TimeoutError) as error:
                save(path, {"state": {"done": True, "outcome": "SKIPPED_PREFLIGHT"},
                            "error": type(error).__name__})
                print("Entry skipped: " + str(error), flush=True)
                continue
            engine = Engine(plan)
            record = {"plan": {k: (v.isoformat() if isinstance(v, datetime) else str(v))
                               for k, v in plan.__dict__.items()}, "state": engine.state}
            while not engine.state["done"]:
                snapshot = broker.snapshot(engine)
                commands = engine.step(snapshot)
                # Write-ahead reservation precedes EVERY possible mutation.
                record["state"] = engine.state
                record["last_observed_at"] = snapshot.now.isoformat()
                record["commands"] = [c.__dict__ for c in commands]
                save(path, record)
                for command in commands:
                    broker.execute(command)
                if engine.state["blocked"]:
                    print("BLOCKED: " + engine.state["blocked"], flush=True)
                if not broker.continuous or not broker.ib.isConnected():
                    raise RuntimeError("Connection continuity lost; Mayday/EOD watchdog inactive; inspect TWS")
                broker.ib.sleep(.5)
            print(json.dumps({"session": plan.session, "outcome": engine.state["outcome"]}), flush=True)
            for contract in (broker.call, broker.put):
                broker.ib.cancelMktData(contract)
    finally:
        if broker and broker.ib.isConnected():
            broker.ib.disconnect()
        os.close(lock)
        lock_path.unlink(missing_ok=True)

if __name__ == "__main__":
    main()
