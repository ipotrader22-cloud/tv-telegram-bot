import os
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from engine_v2_quote_evidence import install_engine2_tws_evidence

class FakeIB:
    def __init__(self): self.calls = []
    def reqTickByTickData(self, *args): self.calls.append(('subscribe', args))
    def cancelTickByTickData(self, *args): self.calls.append(('cancel', args))

def make_core(mode=1):
    async def original(_): return None
    tick=SimpleNamespace(time=datetime.fromisoformat('2026-10-19T09:59:40-04:00'),price=100,size=5)
    return SimpleNamespace(
        ib=FakeIB(), managed_quote_symbols=lambda:['NVDA'], ensure_quote_subscriptions=original,
        render_quote_payload=lambda _: {'quotes':[{'symbol':'NVDA','source':'TWS','live_last':100}]},
        _quote_tickers={'NVDA':SimpleNamespace(marketDataType=mode,tickByTicks=[tick])},
        _quote_contracts={'NVDA':object()})

class QuoteEvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_reuses_existing_connection_and_evidence(self):
        core=make_core()
        with patch.dict(os.environ,{'VIXALE_ENGINE2_TWS_EVIDENCE':'YES','VIXALE_ENGINE2_TWS_SYMBOLS':'AMD'}):
            install_engine2_tws_evidence(core)
            self.assertEqual(core.managed_quote_symbols(),['AMD','NVDA'])
            await core.ensure_quote_subscriptions(['NVDA'])
            self.assertEqual(len(core.ib.calls),1)
            data=core.render_quote_payload(['NVDA'])['quotes'][0]
            self.assertEqual(data['quote_kind'],'LAST_TRADE')
            self.assertEqual(data['last_size'],5)
            self.assertTrue(data['last_timestamp'])
    async def test_delayed_not_marked_as_live(self):
        core=make_core(3)
        with patch.dict(os.environ,{'VIXALE_ENGINE2_TWS_EVIDENCE':'YES'}):
            install_engine2_tws_evidence(core)
            self.assertNotIn('quote_kind',core.render_quote_payload(['NVDA'])['quotes'][0])
    async def test_off_by_default(self):
        core=make_core()
        with patch.dict(os.environ,{'VIXALE_ENGINE2_TWS_EVIDENCE':'NO'}):
            install_engine2_tws_evidence(core)
            self.assertFalse(hasattr(core,'_engine2_evidence_installed'))

if __name__ == '__main__': unittest.main()
