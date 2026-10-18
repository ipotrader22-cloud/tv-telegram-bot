"""Opt-in Engine V2 trade evidence on the EXISTING IB bridge connection.
No extra socket, no broker orders. OFF unless VIXALE_ENGINE2_TWS_EVIDENCE=YES.
"""
import hashlib
import os
from datetime import datetime, timezone

def install_engine2_tws_evidence(core):
    if os.getenv('VIXALE_ENGINE2_TWS_EVIDENCE', '').upper() != 'YES' or getattr(core, '_engine2_evidence_installed', False):
        return
    original_symbols = core.managed_quote_symbols
    original_ensure = core.ensure_quote_subscriptions
    original_payload = core.render_quote_payload
    subscribed = set()

    def symbols():
        requested = set()
        for text in os.getenv('VIXALE_ENGINE2_TWS_SYMBOLS', '').split(','):
            s = text.strip().upper()
            if s and len(s) <= 15 and all(c.isalnum() or c in '.-' for c in s):
                requested.add(s)
        return sorted(set(original_symbols()) | requested)

    async def ensure(requested):
        await original_ensure(requested)
        for symbol in list(subscribed - set(requested)):
            contract = core._quote_contracts.get(symbol)
            if contract is not None:
                try: core.ib.cancelTickByTickData(contract, 'Last')
                except Exception: pass
            subscribed.discard(symbol)
        for symbol in sorted(set(requested) - subscribed):
            contract = core._quote_contracts.get(symbol)
            if contract is None: continue
            try:
                core.ib.reqTickByTickData(contract, 'Last', 0, False)
                subscribed.add(symbol)
            except Exception as exc:
                print('[ENGINE2 QUOTE EVIDENCE MISSING] {}: {}'.format(symbol, type(exc).__name__))

    def payload(requested):
        body = original_payload(requested)
        for item in body.get('quotes', []):
            ticker = core._quote_tickers.get(item.get('symbol'))
            if ticker is None or getattr(ticker, 'marketDataType', None) != 1:
                continue
            for tick in reversed(getattr(ticker, 'tickByTicks', None) or []):
                stamp = getattr(tick, 'time', None)
                price = getattr(tick, 'price', None)
                size = getattr(tick, 'size', None)
                if not isinstance(stamp, datetime) or stamp.tzinfo is None: continue
                if not isinstance(price, (int, float)) or price <= 0: continue
                if not isinstance(size, (int, float)) or size <= 0: continue
                # Must match live LAST, not a display midpoint, delayed LAST or close.
                if abs(float(item.get('live_last') or 0) - float(price)) > 0.000001: continue
                stamp = stamp.astimezone(timezone.utc).isoformat()
                raw_id = '{}|{}|{}|{}'.format(item.get('symbol'), stamp, price, size)
                item.update({'quote_kind':'LAST_TRADE', 'market_data_type':1,
                             'last':float(price), 'last_size':float(size),
                             'last_timestamp':stamp,
                             'trade_id':hashlib.sha256(raw_id.encode()).hexdigest()})
                break
        return body

    core.managed_quote_symbols = symbols
    core.ensure_quote_subscriptions = ensure
    core.render_quote_payload = payload
    core._engine2_evidence_installed = True
