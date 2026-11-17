"""Isolated, opt-in TWS PAPER adapter. Never imported by the stock bridge."""
import argparse
import json
import os
import sys
import copy
import logging
from datetime import datetime, timedelta, time, timezone
from pathlib import Path
from decimal import Decimal
from zoneinfo import ZoneInfo
from .core import (D, ET, Engine, Order, Plan, Quote, Snapshot, midpoint,
                   TERMINAL, decimal)
from .recovery import (RecoveryError, process_lock, new_record, load_record,
                       history_covers, reserve, observe_order, observe_fill,
                       recovered_order, matches_order)

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

def expiry_time(detail, expiry_zone=None):
    # Refuse missing PM-expiry evidence; never infer daily vs quarterly from name.
    value = detail.lastTradeTime
    if not value:
        raise ValueError("IB lastTradeTime unavailable: PM expiry unverified")
    zone = expiry_zone or ZoneInfo(detail.timeZoneId)
    day = detail.realExpirationDate
    expiry = datetime.strptime(day + " " + value, "%Y%m%d %H:%M:%S").replace(tzinfo=zone)
    if expiry.astimezone(ET).time() != time(16):
        raise ValueError("Not a 16:00 ET expiration")
    if expiry_zone is not None:
        # The expiry clock can be operator-local while tradingHours remains
        # exchange-local. Require an independent expiry-day session endpoint.
        hours = intervals(detail.tradingHours, ZoneInfo(detail.timeZoneId))
        ends = [b for a, b in hours if b.astimezone(ET).date() == expiry.astimezone(ET).date()]
        if not ends or max(ends) != expiry:
            raise ValueError("Expiry clock and final trading-hours endpoint disagree")
    return expiry


def market_increment(price, rules):
    levels = sorted((decimal(r.lowEdge), decimal(r.increment)) for r in rules)
    eligible = [tick for edge, tick in levels if edge <= abs(decimal(price))]
    if not eligible or eligible[-1] <= 0:
        raise ValueError('Broker market-rule increment unavailable')
    return eligible[-1]

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
        if not args.account.startswith("DU") or args.client_id <= 0:
            raise ValueError("Only an explicit DU paper account and nonzero client ID are allowed")
        if args.port not in (7497, 4002):
            raise ValueError("Only standard paper TWS/Gateway ports are allowed")
        from ib_insync import IB, Contract, ComboLeg, LimitOrder, MarketOrder
        self.Contract, self.ComboLeg = Contract, ComboLeg
        self.LimitOrder, self.MarketOrder = LimitOrder, MarketOrder
        self.foreign_execution_seen = False
        self.args = args
        self.record = None
        self.paper_execute = args.paper_execute
        self.expiry_zone = ZoneInfo(args.expiry_timezone) if args.expiry_timezone else None
        self.history_zone = ZoneInfo(args.history_timezone) if args.history_timezone else None
        self.account, self.client_id = args.account, args.client_id
        self.ib = IB()
        self.ib.RequestTimeout = 10
        self.ib.RaiseRequestErrors = True
        self.ib.connect("127.0.0.1", args.port, clientId=args.client_id,
                        readonly=not args.paper_execute, account=args.account,
                        timeout=10)
        if args.account not in self.ib.managedAccounts():
            raise ValueError("Exact paper account not present")
        self.continuous = True
        self.generation = 0
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
        self.generation += 1
        self.quotes.clear()

    def error(self, request_id, code, message, contract):
        if code in (1100, 1101, 1102, 1300):
            self.disconnected()

    def reconnect(self):
        # Rebuild only this API connection. Never restart TWS or the stock bridge.
        if self.ib.isConnected():
            self.ib.disconnect()
        self.ib.connect('127.0.0.1', self.args.port, clientId=self.client_id,
                        readonly=not self.paper_execute, account=self.account,
                        timeout=10)
        if self.account not in self.ib.managedAccounts():
            raise RecoveryError('Paper account changed after reconnect')
        self.quotes.clear()
        self.ib.reqMarketDataType(1)
        self.continuous = True

    def restore(self, plan, record):
        """Requalify the journal's exact legs; never select a new ATM on restart."""
        self.record = record
        self._coverage_generation = None
        pair = []
        for cid, right in ((plan.call_id, 'C'), (plan.put_id, 'P')):
            found = self.ib.reqContractDetails(self.Contract(conId=cid, exchange='CME'))
            if len(found) != 1:
                raise RecoveryError('Recovered contract unavailable or ambiguous')
            d, c = found[0], found[0].contract
            if (c.conId != cid or c.secType != 'FOP' or c.symbol != 'ES'
                    or c.currency != 'USD' or c.multiplier != '50' or c.right != right
                    or decimal(c.strike) != plan.strike or d.underConId != plan.underlying_id
                    or expiry_time(d, self.expiry_zone) != plan.expiry_at):
                raise RecoveryError('Recovered exact contract/expiry mismatch')
            pair.append(d)
        self.details = pair
        self.load_market_rules()
        self.call, self.put = [d.contract for d in pair]
        self.expiry = plan.expiry_at
        self.bag = self.Contract(symbol='ES', secType='BAG', exchange='CME', currency='USD')
        self.bag.comboLegs = [self.ComboLeg(conId=c.conId, ratio=1, action='BUY', exchange='CME')
                              for c in (self.call, self.put)]
        self.quotes.clear()
        for c in (self.call, self.put):
            self.ib.reqMktData(c)

    def load_market_rules(self):
        rule_ids = set()
        for detail in self.details:
            pairs = dict(zip(detail.validExchanges.split(','), detail.marketRuleIds.split(',')))
            rule_ids.add(pairs.get('CME'))
        if len(rule_ids) != 1 or None in rule_ids or '' in rule_ids:
            raise ValueError('CME price-rule identity unavailable or inconsistent between legs')
        self.market_rules = self.ib.reqMarketRule(int(next(iter(rule_ids))))
        if not self.market_rules:
            raise ValueError('CME price-rule response empty')

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
            if int(chain.underlyingConId) != future.conId or chain.multiplier != "50":
                continue
            for expiry in chain.expirations:
                day = datetime.strptime(expiry, "%Y%m%d").date()
                if 0 < (day - entry.date()).days <= 4 and day.weekday() < 5:
                    strike = min(chain.strikes, key=lambda x: (abs(decimal(x)-reference), x))
                    choices.append((expiry, abs(decimal(strike)-reference),
                                    decimal(strike), chain.tradingClass))
        if not choices:
            raise ValueError("No upcoming ES option expiry")
        candidates = sorted(set(choices))
        valid = []
        for expiry, distance, strike, trading_class in candidates:
            if valid and expiry != valid[0][1][0][0].realExpirationDate:
                break
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
                    expiry_at = expiry_time(detail, self.expiry_zone)
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
        self.load_market_rules()
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
        raw_midpoint = (sum(q.bid for q in quotes) + sum(q.ask for q in quotes)) / 2
        self.selection_report = {'strike': str(strike), 'call_id': self.call.conId,
                                 'put_id': self.put.conId, 'expiry': self.expiry.isoformat(),
                                 'exact_midpoint': str(raw_midpoint), 'real_time_quotes': True,
                                 'configured_combo_tick': str(entry_tick)}
        if market_increment(raw_midpoint, self.market_rules) != entry_tick:
            raise ValueError('Configured combo tick differs from current CME premium band')
        price = midpoint(sum(q.bid for q in quotes), sum(q.ask for q in quotes), entry_tick)
        plan = Plan(entry.date().isoformat(), entry, self.expiry,
                    self.call.conId, self.put.conId, future.conId, strike, price, entry_tick)
        plan.validate(now())
        return plan

    def snapshot(self, engine):
        if not self.ib.isConnected() or not self.continuous:
            return Snapshot(now(), synchronized=False, continuity=False)
        from ib_insync import ExecutionFilter
        started, generation = now(), self.generation
        candidate = copy.deepcopy(self.record)
        retained = (getattr(self, '_coverage_generation', None) == generation
                    and getattr(self, '_coverage_checkpoint', None) == candidate['coverage_through'])
        if not retained and not history_covers(candidate, started, self.history_zone, self.args.history_days):
            raise RecoveryError('HISTORY_COVERAGE_UNPROVEN: checkpoint outside verified TWS history')
        # Successful end callbacks are mandatory; timeouts never advance coverage.
        self.ib.reqOpenOrders()
        working = self.ib.reqAllOpenOrders()
        completed = self.ib.reqCompletedOrders(apiOnly=False)
        fills = self.ib.reqExecutions(ExecutionFilter(acctCode=self.account))
        positions = self.ib.reqPositions()
        if generation != self.generation or not self.ib.isConnected() or not self.continuous:
            return Snapshot(now(), synchronized=False, continuity=False)
        ids = {self.call.conId, self.put.conId}
        # Retained callbacks cover the midnight boundary only on the very same
        # continuously connected process/generation. A restart never inherits it.
        for fill in [*self.ib.fills(), *fills]:
            observe_fill(candidate, fill, engine.plan, self.account, self.client_id)
        self.working = {}
        for trade in working:
            c, o = trade.contract, trade.order
            if o.account and o.account != self.account:
                continue
            involved = c.conId in ids or any(l.conId in ids for l in (c.comboLegs or []))
            # A fresh entry must not stack onto another manually managed ES trade.
            involved |= not engine.state['started'] and c.symbol == 'ES'
            if not involved:
                continue
            saved = candidate['orders'].get(o.orderRef)
            if saved is None or o.orderRef in self.working:
                candidate['foreign_activity'] = True
                continue
            expected = sorted((cid, 1, 'BUY', 'CME') for cid in ids)
            actual = sorted((l.conId, l.ratio, l.action, l.exchange) for l in (c.comboLegs or []))
            if c.secType != 'BAG' or c.symbol != 'ES' or c.currency != 'USD' or actual != expected:
                raise RecoveryError('Owned order combo legs changed')
            observe_order(saved, trade, self.account, self.client_id)
            self.working[o.orderRef] = trade
        for ref, saved in candidate['orders'].items():
            if ref in self.working:
                continue
            exact = [t for t in completed if saved['perm_id']
                     and t.order.permId == saved['perm_id'] and t.order.orderRef == ref]
            if len(exact) > 1:
                raise RecoveryError('Duplicate completed order identity')
            if exact:
                # Completed-order callbacks omit API client/order IDs. Only an
                # already bound permanent ID permits restoring those fields.
                t = copy.deepcopy(exact[0])
                t.order.orderId, t.order.clientId = saved['order_id'], self.client_id
                t.orderStatus.filled = t.order.filledQuantity
                observe_order(saved, t, self.account, self.client_id)
            elif saved['status'] not in TERMINAL:
                saved['status'] = 'UNKNOWN'
        orders = {ref: o for ref, saved in candidate['orders'].items()
                  if (o := recovered_order(ref, saved, engine.plan)) is not None}
        pos = {c: D("0") for c in ids}
        for p in positions:
            if p.account == self.account and p.contract.conId in ids:
                pos[p.contract.conId] += decimal(p.position)
            if (not engine.state['started'] and p.account == self.account
                    and p.contract.symbol == 'ES' and p.position):
                candidate['foreign_activity'] = True
        integral = all(q == q.to_integral_value() for q in pos.values())
        clock = now()
        session_open = all(any(a <= clock < b for a, b in
                               intervals(d.tradingHours, ZoneInfo(d.timeZoneId)))
                           for d in self.details)
        candidate['coverage_through'] = started.isoformat()
        self.record.clear()
        self.record.update(candidate)
        self._coverage_generation = generation
        self._coverage_checkpoint = candidate['coverage_through']
        from .core import target_price
        entry = orders.get(engine.entry_ref)
        target_valid = True
        if entry and entry.proven and entry.filled:
            target = target_price(entry.average)
            target_valid = target % market_increment(target, self.market_rules) == 0
        return Snapshot(clock, orders, int(pos[self.call.conId]), int(pos[self.put.conId]),
                        self.quote(self.call), self.quote(self.put),
                        synchronized=integral, foreign_activity=candidate['foreign_activity'],
                        continuity=self.continuous and self.args.history_all_clients_verified,
                        session_open=session_open, target_price_valid=target_valid)

    def execute(self, command):
        if not self.paper_execute:
            raise RecoveryError('Read-only adapter cannot mutate broker orders')
        if not self.ib.isConnected() or not self.continuous:
            raise RecoveryError('Connection changed before broker effect')
        if self.record is None or command.ref not in self.record['orders']:
            raise RecoveryError('Durable order reservation required')
        saved = self.record['orders'][command.ref]
        if command.kind == "CANCEL":
            trade = self.working.get(command.ref)
            if trade is None or not matches_order(saved, trade.order, self.account, self.client_id):
                raise RuntimeError("Exact cancellation identity unavailable")
            if trade.orderStatus.status not in TERMINAL:
                self.ib.cancelOrder(trade.order)
            return
        if command.kind != "SUBMIT":
            raise ValueError("Unknown command")
        if (command.action != saved['action'] or command.quantity != saved['quantity']
                or command.order_type != saved['order_type'] or command.price != saved['price']):
            raise RecoveryError('Command differs from durable reservation')
        if any(t.order.orderRef == command.ref for t in self.ib.trades()):
            raise RuntimeError("Duplicate submission refused")
        if command.order_type == "LMT":
            order = self.LimitOrder(command.action, command.quantity, float(command.price))
        else:
            order = self.MarketOrder(command.action, command.quantity)
        order.account = self.account
        order.orderId = saved['order_id']
        order.orderRef = command.ref
        order.tif = "GTC" if command.reason == "TARGET" else "DAY"
        order.outsideRth = True
        self.ib.placeOrder(self.bag, order)

def drive_session(broker, engine, record, path):
    """One reconciliation pass; disk errors escape before any broker effect."""
    snapshot = broker.snapshot(engine)
    commands = engine.step(snapshot)
    record['state'] = copy.deepcopy(engine.state)
    record['last_observed_at'] = snapshot.now.isoformat()
    record.pop('recovery_block', None)
    record['commands'] = [c.__dict__ for c in commands]
    for command in commands:
        if command.kind == 'SUBMIT':
            reserve(record, command, broker.ib.client.getReqId())
    save(path, record)
    for command in commands:
        broker.execute(command)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, help='Private local JSON defaults; never committed')
    parser.add_argument("--account", help="Exact DU paper account; never committed")
    parser.add_argument("--underlying-id", type=int, help="Verified current ES futures conId")
    parser.add_argument("--combo-tick", help="Verified ES combo minimum price increment")
    parser.add_argument("--port", type=int, default=7497)
    parser.add_argument("--client-id", type=int, default=1820)
    parser.add_argument("--state-dir", type=Path)
    parser.add_argument('--expiry-timezone', help='Verified TWS expiry attribute timezone (IANA)')
    parser.add_argument('--history-timezone', help='Verified TWS execution-history midnight timezone (IANA)')
    parser.add_argument('--history-days', type=int, choices=range(1, 8), default=1,
                        help='Verified TWS Trade Log history days; default current day only')
    parser.add_argument('--history-all-clients-verified', action='store_true',
                        help='Paper acceptance attestation: API history includes manual and all-client executions')
    parser.add_argument("--paper-execute", action="store_true",
                        help="Explicit opt-in; otherwise read-only immediate preflight")
    initial, _ = parser.parse_known_args()
    if initial.config:
        defaults = json.loads(initial.config.read_text(encoding='utf-8'))
        allowed = {'account', 'underlying_id', 'combo_tick', 'port', 'client_id',
                   'state_dir', 'expiry_timezone', 'history_timezone', 'history_days'}
        if set(defaults) - allowed:
            parser.error('Unknown config field; paper execution must be an explicit CLI flag')
        parser.set_defaults(**defaults)
    args = parser.parse_args()
    if any(getattr(args, k) is None for k in ('account', 'underlying_id', 'combo_tick', 'state_dir')):
        parser.error('account, underlying-id, verified combo-tick and state-dir are required')
    args.state_dir = Path(args.state_dir)
    if not args.expiry_timezone or not args.history_timezone:
        parser.error('Verified expiry-timezone and history-timezone are required')
    if args.history_days not in range(1, 8) or (args.port == 4002 and args.history_days != 1):
        parser.error('Gateway supports only current-day execution history')
    if args.paper_execute and not args.history_all_clients_verified:
        parser.error('Paper execution requires verified manual/all-client execution-history visibility')
    # ib_insync INFO includes account/order fields; keep private runtime output bounded.
    logging.getLogger('ib_insync').setLevel(logging.CRITICAL)
    args.state_dir.mkdir(parents=True, exist_ok=True)
    with process_lock(args.state_dir / 'executor.lock'):
        while True:
            try:
                run(args)
                break
            except (ConnectionError, TimeoutError):
                if not args.paper_execute:
                    raise
                print('CONNECTIVITY HOLD: retrying paper connection in 10 seconds', flush=True)
                import time as time_module
                time_module.sleep(10)


def run(args):
    broker = None
    try:
        active = []
        for candidate in args.state_dir.glob('session-*.json'):
            saved = json.loads(candidate.read_text(encoding='utf-8'))
            if not saved['state']['done']:
                record, plan = load_record(candidate, args)
                active.append((candidate, record, plan))
        if len(active) > 1:
            raise RecoveryError('Multiple unresolved sessions; no broker actions allowed')
        broker = TWS(args)
        engine, record, path = None, None, None
        if active:
            path, record, plan = active[0]
            engine = Engine(plan, copy.deepcopy(record['state']))
            broker.restore(plan, record)
        if not args.paper_execute:
            if engine is None:
                try:
                    plan = broker.select(now())
                except ValueError as exc:
                    print(json.dumps({'preflight_only': True, 'paper_ready': False,
                                      'reason': str(exc), 'orders_submitted': 0,
                                      **getattr(broker, 'selection_report', {})}), flush=True)
                    return
                engine = Engine(plan)
                record = new_record(plan, engine, args, now())
                broker.record = record
            snapshot = broker.snapshot(engine)
            print(json.dumps({"preflight_only": True, "strike": str(plan.strike),
                              "call_id": plan.call_id, "put_id": plan.put_id,
                              "expiry": plan.expiry_at.isoformat(),
                              "midpoint": str(plan.entry_limit),
                              'foreign_activity': snapshot.foreign_activity,
                              'history_visibility_verified': args.history_all_clients_verified,
                              'paper_ready': snapshot.continuity and not snapshot.foreign_activity
                                             and snapshot.synchronized,
                              'call_position': snapshot.call_position,
                              'put_position': snapshot.put_position,
                              'recovered_session': bool(active),
                              'orders_submitted': 0}))
            return
        retry_delay = 1
        while True:
            try:
                if not broker.continuous or not broker.ib.isConnected():
                    broker.reconnect()
                    if engine is not None:
                        broker.restore(engine.plan, record)
                if engine is None:
                    clock = now().astimezone(ET)
                    path = args.state_dir / ('session-' + clock.date().isoformat() + '.json')
                    if (clock.weekday() in (4, 5) or clock.time() < time(20, 20)
                            or clock.time() >= time(20, 21) or path.exists()):
                        broker.ib.sleep(1)
                        continue
                    try:
                        plan = broker.select(now())
                    except (ValueError, TimeoutError) as exc:
                        save(path, {'state': {'done': True, 'outcome': 'SKIPPED_PREFLIGHT'},
                                    'error': type(exc).__name__})
                        print('Entry skipped: ' + type(exc).__name__, flush=True)
                        continue
                    engine = Engine(plan)
                    record = new_record(plan, engine, args, now())
                    broker.record = record
                drive_session(broker, engine, record, path)
                retry_delay = 1
                if engine.state['done']:
                    print(json.dumps({'session': engine.plan.session,
                                      'outcome': engine.state['outcome']}), flush=True)
                    for c in (broker.call, broker.put):
                        broker.ib.cancelMktData(c)
                    engine, record = None, None
                elif engine.state['blocked']:
                    print('BLOCKED: ' + engine.state['blocked'], flush=True)
                    broker.ib.sleep(5)
                broker.ib.sleep(1)
            except (ConnectionError, TimeoutError, RecoveryError) as exc:
                # Reservations remain intact, including the unknown-ack crash window.
                # No replay of record['commands']; the next pass reconciles from TWS.
                if record is not None:
                    record['recovery_block'] = str(exc)
                    save(path, record)
                print('RECOVERY HOLD: ' + type(exc).__name__ + ': ' + str(exc), flush=True)
                if isinstance(exc, (ConnectionError, TimeoutError)):
                    broker.disconnected()
                broker.ib.sleep(retry_delay)
                retry_delay = min(30, retry_delay * 2)
    finally:
        if broker and broker.ib.isConnected():
            broker.ib.disconnect()

if __name__ == "__main__":
    main()
