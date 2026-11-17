"""Durable paper-session evidence. Missing broker evidence never means canceled."""
import copy
import json
import os
from contextlib import contextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from .core import Plan, Order, TERMINAL, decimal


class RecoveryError(RuntimeError):
    pass


@contextmanager
def process_lock(path):
    """OS-owned lock releases on process death; never delete a live lock inode."""
    stream = path.open('a+b')
    try:
        stream.seek(0, 2)
        if stream.tell() == 0:
            stream.write(b'0'); stream.flush()
        stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RecoveryError('Executor already owns this state directory') from exc
        yield
    finally:
        stream.close()


def encode_plan(plan):
    return {k: v.isoformat() if isinstance(v, datetime) else str(v)
            for k, v in plan.__dict__.items()}


def decode_plan(value):
    data = dict(value)
    for key in ('entry_at', 'expiry_at'):
        data[key] = datetime.fromisoformat(data[key])
    for key in ('call_id', 'put_id', 'underlying_id'):
        data[key] = int(data[key])
    for key in ('strike', 'entry_limit', 'entry_tick'):
        data[key] = decimal(data[key])
    plan = Plan(**data)
    plan.validate(plan.entry_at)
    return plan


def identity(args):
    return {k: getattr(args, k) for k in ('account', 'client_id', 'port', 'underlying_id')}


def new_record(plan, engine, args, clock):
    return {'version': 2, 'identity': identity(args), 'plan': encode_plan(plan),
            'state': copy.deepcopy(engine.state), 'orders': {},
            'coverage_through': clock.isoformat(), 'foreign_activity': False}


def load_record(path, args):
    record = json.loads(path.read_text(encoding='utf-8'))
    if record.get('version') != 2 or record.get('identity') != identity(args):
        raise RecoveryError('Journal version/account/client/port/underlying mismatch; retain for review')
    plan = decode_plan(record['plan'])
    if plan.underlying_id != args.underlying_id:
        raise RecoveryError('Recovered underlying differs from configuration')
    if datetime.fromisoformat(record['coverage_through']).tzinfo is None:
        raise RecoveryError('Journal coverage timestamp is not timezone-aware')
    if record.get('foreign_activity'):
        raise RecoveryError('Persisted foreign activity requires operator reconciliation')
    return record, plan


def history_covers(record, clock, zone, days):
    """days is an operator-verified TWS Trade Log setting, never inferred from an empty reply."""
    if zone is None or days not in range(1, 8):
        return False
    start = clock.astimezone(zone).replace(hour=0, minute=0, second=0, microsecond=0)
    start -= timedelta(days=days - 1)
    checkpoint = datetime.fromisoformat(record['coverage_through'])
    return start <= checkpoint <= clock


def reserve(record, command, order_id):
    if command.kind != 'SUBMIT':
        return
    if command.ref in record['orders']:
        raise RecoveryError('Submission already reserved')
    record['orders'][command.ref] = {
        'order_id': order_id, 'perm_id': 0, 'action': command.action,
        'quantity': command.quantity, 'order_type': command.order_type,
        'price': command.price, 'tif': 'GTC' if command.reason == 'TARGET' else 'DAY',
        'status': 'UNKNOWN', 'filled': '0', 'executions': {}}


def matches_order(saved, order, account, client_id):
    return (order.account == account and order.clientId == client_id
            and order.orderId == saved['order_id']
            and (not saved['perm_id'] or order.permId == saved['perm_id'])
            and order.action == saved['action']
            and decimal(order.totalQuantity) == saved['quantity']
            and order.orderType == saved['order_type'] and order.tif == saved['tif']
            and bool(order.outsideRth)
            and (saved['order_type'] != 'LMT' or decimal(order.lmtPrice) == decimal(saved['price'])))


def observe_order(saved, trade, account, client_id):
    if not matches_order(saved, trade.order, account, client_id):
        raise RecoveryError('Recovered order identity or frozen fields changed')
    status = trade.orderStatus.status
    quantity = decimal(trade.orderStatus.filled)
    if quantity < decimal(saved['filled']) or quantity > saved['quantity']:
        raise RecoveryError('Broker cumulative quantity regressed or exceeds reservation')
    if saved['status'] in TERMINAL and status not in TERMINAL:
        raise RecoveryError('Terminal order became working')
    if trade.order.permId:
        saved['perm_id'] = trade.order.permId
    saved['status'], saved['filled'] = status, str(quantity)


def observe_fill(record, fill, plan, account, client_id):
    e, c = fill.execution, fill.contract
    involved = c.conId in (plan.call_id, plan.put_id) or (
        c.secType == 'BAG' and c.symbol == 'ES')
    if e.acctNumber != account or not involved:
        return
    if e.time.tzinfo is None:
        raise RecoveryError('Execution timestamp is not timezone-aware')
    if e.time < plan.entry_at:
        return
    saved = record['orders'].get(e.orderRef)
    if (saved is None or e.clientId != client_id or e.orderId != saved['order_id']
            or (saved['perm_id'] and e.permId != saved['perm_id'])
            or e.side != ('SLD' if saved['action'] == 'SELL' else 'BOT')):
        record['foreign_activity'] = True
        return
    if not e.execId or not e.permId or getattr(e, 'pendingPriceRevision', False):
        raise RecoveryError('Incomplete execution identity or pending price revision')
    if saved['perm_id'] and saved['perm_id'] != e.permId:
        raise RecoveryError('Execution permId conflict')
    saved['perm_id'] = e.permId
    value = {'con_id': c.conId, 'sec_type': c.secType, 'shares': str(decimal(e.shares)),
             'price': str(decimal(e.price)), 'time': e.time.isoformat()}
    if decimal(e.shares) <= 0 or decimal(e.price) <= 0:
        raise RecoveryError('Invalid fill quantity/price')
    old = saved['executions'].get(e.execId)
    if old is not None and old != value:
        raise RecoveryError('Conflicting duplicate execution')
    # Do not add a correction as another fill. Explicit reconciliation is needed.
    prefix, _, suffix = e.execId.rpartition('.')
    if prefix and any(k.rpartition('.')[0] == prefix and k != e.execId
                      and v['con_id'] == value['con_id'] and v['sec_type'] == value['sec_type']
                      for k, v in saved['executions'].items()):
        raise RecoveryError('Execution correction requires reconciliation')
    saved['executions'][e.execId] = value


def recovered_order(ref, saved, plan):
    values = list(saved['executions'].values())
    def total(items):
        qty = sum((decimal(x['shares']) for x in items), Decimal(0))
        cost = sum((decimal(x['shares']) * decimal(x['price']) for x in items), Decimal(0))
        return qty, cost
    bag = [x for x in values if x['sec_type'] == 'BAG']
    cq, cc = total([x for x in values if x['sec_type'] == 'FOP' and x['con_id'] == plan.call_id])
    pq, pc = total([x for x in values if x['sec_type'] == 'FOP' and x['con_id'] == plan.put_id])
    if bag:
        qty, cost = total(bag)
        proven = (not cq and not pq) or (cq == pq == qty and cc + pc == cost)
    else:
        qty, cost, proven = cq, cc + pc, cq == pq
    proven = proven and qty == qty.to_integral_value() and 0 <= qty <= saved['quantity']
    # Fresh status must agree with executions. An absent working order is UNKNOWN,
    # except when exact full-quantity executions independently prove Filled.
    status = saved['status']
    if qty == saved['quantity'] and proven:
        status = 'Filled'
    elif status == 'UNKNOWN':
        return None
    elif qty != decimal(saved['filled']):
        proven = False
    if status == 'Filled' and qty != saved['quantity']:
        proven = False
    price = cost / qty if qty else Decimal(0)
    return Order(ref, status, int(qty), price, proven)
