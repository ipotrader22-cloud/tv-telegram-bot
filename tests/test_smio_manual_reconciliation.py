"""Evidence-only repair: no broker connection or synthetic historical fills."""
import copy
import json
import unittest
from bridge.smio_manual_reconciliation import plan_manual_close, finalize_manual_close
from bridge.smio_demo_adapter import DemoLifecycle
from tests import test_smio_demo_lifecycle as fixtures
from tests.test_smio_demo_lifecycle import signal, close_signal


class ManualEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.row = dict(payload=dict(setup_id='setup', symbol='TEST', qty=10, side='LONG'),
                        filled_qty=10, state='OWNERSHIP_LOST', recovery_blocker='restart',
                        entry=dict(id=1, ref='SMIOE_test', executions={'entry':dict(qty=10, price=100)}),
                        target=dict(id=2, ref='SMIOT_test'))
        base = dict(symbol='TEST', account_match=True, qty=10,
                    contract=dict(con_id=123, sec_type='STK', symbol='TEST', currency='USD'))
        self.broker = dict(account_match=True, read_only=True, captured_at='2026-10-27T20:00:00+00:00',
            positions=[], open_orders=[], executions=[
                dict(base, exec_id='entry', side='BOT', order_id=1, order_ref='SMIOE_test',
                     client_id=77, perm_id=101, price=100, time='2026-10-26T14:00:00+00:00'),
                dict(base, exec_id='manual', side='SLD', order_id=8, order_ref='',
                     client_id=0, perm_id=108, price=101, time='2026-10-26T23:00:00+00:00')])
        self.cancel = [dict(symbol='TEST', order_ref='SMIOT_test', account_match=True,
            action='SELL', status='Cancelled', completed_time='2026-10-26 18:00:00', qty=10, perm_id=102)]
        self.auth = dict(setup_id='setup', quantity=10, manual_close_confirmed=True)

    def plan(self):
        return plan_manual_close(self.row, self.broker, self.cancel, self.auth)

    def ledger(self, proof):
        return {k:proof[k] for k in ('setup_id','reconciliation_id','quantity','entry_price',
            'exit_price','gross_realized_pnl','close_time_et')} | dict(open_rows=0,pending_rows=0,closed_rows=1)

    def test_complete_manual_close_and_cancel_preserves_actual_time(self):
        p = self.plan()
        self.assertEqual(p['close_time_et'], '2026-10-26 19:00:00')
        self.assertEqual(p['gross_realized_pnl'], 10)
        result = finalize_manual_close(self.row, p, self.ledger(p))
        self.assertEqual(result['state'], 'CLOSED')
        self.assertEqual(result['entry'], self.row['entry'])
        self.assertNotIn('close', result)
        self.assertEqual(self.row['state'], 'OWNERSHIP_LOST')

    def test_partial_manual_close_is_not_terminal_even_if_flat_claimed(self):
        self.broker['executions'][1]['qty'] = 4
        with self.assertRaisesRegex(ValueError, 'partial'): self.plan()

    def test_unavailable_history_and_flat_alone_cannot_repair(self):
        for fills in ([], self.broker['executions'][:1], self.broker['executions'][1:]):
            self.broker['executions'] = fills
            with self.assertRaises(ValueError): self.plan()

    def test_missing_cancellation_or_still_working_target_blocks(self):
        self.cancel = []
        with self.assertRaisesRegex(ValueError, 'cancellation'): self.plan()
        self.broker['open_orders'] = [dict(symbol='TEST')]
        with self.assertRaisesRegex(ValueError, 'working'): self.plan()

    def test_wrong_account_contract_and_conflicting_duplicate_rejected(self):
        for key, value in [('account_match',False), ('contract',dict(con_id=999))]:
            saved = copy.deepcopy(self.broker)
            self.broker['executions'][1][key] = value
            with self.assertRaises(ValueError): self.plan()
            self.broker = saved
        self.broker['executions'].append(dict(self.broker['executions'][1], price=102))
        with self.assertRaisesRegex(ValueError, 'conflicting'): self.plan()

    def test_restart_and_recapture_are_idempotent(self):
        p = self.plan()
        result = finalize_manual_close(self.row,p,self.ledger(p))
        self.row = json.loads(json.dumps(result))
        self.broker['captured_at'] = '2026-10-28T20:00:00+00:00'
        again = self.plan()
        self.assertEqual(p['reconciliation_id'], again['reconciliation_id'])
        self.assertEqual(finalize_manual_close(self.row,p,self.ledger(p)),result)

    def test_duplicate_closed_or_stale_open_ledger_cannot_finalize(self):
        p = self.plan()
        for key,value in [('closed_rows',2),('open_rows',1),('pending_rows',1),('gross_realized_pnl',0)]:
            with self.assertRaisesRegex(ValueError,'readback'):
                finalize_manual_close(self.row,p,self.ledger(p)|{key:value})


class LateCloseTests(unittest.IsolatedAsyncioTestCase):
    setUp = fixtures.LifecycleTests.setUp
    tearDown = fixtures.LifecycleTests.tearDown
    snapshot = fixtures.LifecycleTests.snapshot
    open_position = fixtures.LifecycleTests.open_position

    async def test_queued_close_after_manual_terminal_repair_never_sells_after_restart(self):
        data = signal()
        await self.open_position(data)
        state = self.engine.load()
        state['setups'][data['setup_id']]['state'] = 'CLOSED'
        state['setups'][data['setup_id']]['result'] = 'VERIFIED_MANUAL_CLOSE'
        self.engine.save(state)
        self.core.ib.position = 0
        for trade in self.core.ib.history:
            if trade.order.orderRef.startswith('SMIOT_'): trade.orderStatus.status = 'Cancelled'
        before = list(self.core.ib.mutations)
        for restart in (False, True):
            if restart:
                self.engine = DemoLifecycle(self.core,self.engine.config_path,self.engine.journal_path)
            await self.engine.handle(close_signal(data))
            await self.engine.reconcile()
            self.assertEqual(self.core.ib.mutations,before)
            self.assertFalse(self.core.ib.cancels)
            self.assertEqual(self.core.ib.position,0)
