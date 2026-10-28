"""Read-only SMIO close diagnostics. Never imports or starts the trading runtime."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen


def read_object(path):
    value = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if not isinstance(value, dict):
        raise ValueError('expected JSON object')
    return value


def audit(journal, positions, orders, status, demo_status, configured_account=None, inbox=None):
    """Use existing bridge response/journal fields; missing evidence stays unknown."""
    accounts = status.get('accounts')
    matched = (status.get('ok') is True and isinstance(accounts, list)
               and len(accounts) == 1 and configured_account == accounts[0]) if configured_account else None
    def clean(value):
        if isinstance(value, str):
            for account in [configured_account, *(accounts or []),
                            *(r.get('account') for r in journal.get('setups', {}).values() if isinstance(r, dict))]:
                if account:
                    value = value.replace(str(account), '[account redacted]')
        return value
    def order_status(order):
        if not order:
            return 'not_recorded'
        matches = [o for o in orders.get('orders', []) if o.get('order_id') == order.get('id')
                   and o.get('order_ref') == order.get('ref')]
        return matches[0].get('status', 'unknown') if len(matches) == 1 else 'not_visible_or_ambiguous'
    findings = []
    for setup, row in journal.get('setups', {}).items():
        if not isinstance(row, dict) or not isinstance(row.get('payload'), dict):
            findings.append({'setup_id': clean(setup), 'blocking_reason': 'malformed_journal_row'})
            continue
        p = row['payload']
        symbol = p.get('symbol')
        broker = [x for x in positions.get('positions', []) if x.get('symbol') == symbol and x.get('sec_type') == 'STK']
        quantity = (sum(x['position'] for x in broker) if positions.get('ok') is True
                    and all(isinstance(x.get('position'), (float, int)) for x in broker) else None)
        close = row.get('close_signal') or p
        receipt = (inbox or {}).get('receipts', {}).get(close.get('event_id'), {})
        findings.append({
            'setup_id': setup, 'symbol': symbol, 'strategy_identity': p.get('strategy_id'),
            'account_match': matched and row.get('account') == configured_account if matched is not None else None,
            'broker_position_quantity': quantity, 'journal_state': row.get('state'),
            'target_status': order_status(row.get('target')), 'close_status': order_status(row.get('close')),
            'last_signal_timestamp': close.get('signal_bar_close'),
            'signal_bar_start': close.get('signal_bar_time'),
            'render_forwarded_at': close.get('render_forwarded_at'),
            'bridge_handler_received_at': row.get('signal_receipts', {}).get(close.get('event_id')),
            'bridge_http_received_at': receipt.get('received_at'),
            'durable_receipt_state': receipt.get('state'),
            'durable_receipt_result': receipt.get('result_status'),
            'last_attempted_broker_action_at': row.get('last_broker_action_at'),
            'close_submitted_at': row.get('close_submitted_at'),
            'blocking_reason': clean(row.get('recovery_blocker')),
            'first_failure': {k:clean(v) for k,v in row.get('first_failure', {}).items()} or None,
            'eod_scheduler_health': demo_status.get('maintenance'),
            'last_successful_eod_evaluation': demo_status.get('maintenance', {}).get('eod_last_successful_evaluation_at'),
        })
    return {'read_only': True, 'captured_at': datetime.now(timezone.utc).isoformat(),
            'broker_connected': status.get('connected'), 'findings': findings,
            'ingress_health': demo_status.get('ingress'),
            'limitations': ['Bridge /ib/open-orders is client-local; absence does not prove no foreign orders.',
                'Broker execution history is not exposed by these endpoints; journal fills are not independent broker evidence.',
                'Null timing/health fields were not recorded by the inspected version. No recovery or replay performed.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--journal', required=True, type=Path)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--inbox', type=Path, help='defaults to smio_demo_inbox.json beside the journal')
    parser.add_argument('--bridge-url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    url = urlparse(args.bridge_url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
        parser.error('only a direct loopback bridge URL is permitted')
    responses = []
    for path in ('/ib/positions', '/ib/open-orders', '/ib/status', '/ib/smio-demo-status'):
        try:
            with urlopen(args.bridge_url.rstrip('/') + path, timeout=12) as response:
                value = json.load(response)
            responses.append(value if isinstance(value, dict) else {})
        except Exception:
            responses.append({})
    try:
        inbox_path = args.inbox or args.journal.with_name('smio_demo_inbox.json')
        inbox = read_object(inbox_path) if inbox_path.exists() else {}
        result = audit(read_object(args.journal), *responses, read_object(args.config).get('account'), inbox)
    except (OSError, ValueError):
        parser.exit(2, 'audit unavailable: journal/config could not be read\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
