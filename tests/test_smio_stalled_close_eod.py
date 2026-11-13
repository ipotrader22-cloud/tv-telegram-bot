"""Partial-close regression. All orders/fills are offline fixtures."""
import asyncio
from datetime import timedelta
import os
from types import SimpleNamespace as N
import unittest
from unittest.mock import AsyncMock, patch

from bridge.smio_demo_adapter import DemoLifecycle
from tests import test_smio_demo_lifecycle as fixtures
from tests.test_smio_demo_lifecycle import signal, close_signal, Order


class StalledCloseTests(unittest.IsolatedAsyncioTestCase):
    setUp = fixtures.LifecycleTests.setUp
    tearDown = fixtures.LifecycleTests.tearDown
    snapshot = fixtures.LifecycleTests.snapshot
    open_position = fixtures.LifecycleTests.open_position

    def row(self):
        return self.engine.load()['setups'][self.data['setup_id']]

    def close_orders(self):
        return [t for t in self.core.ib.history if t.order.orderRef.startswith('SMIOC_')]

    async def stalled(self, third_status='Cancelled', extra_failures=False):
        self.data = signal('SHORT')
        self.data['qty'] = 10
        await self.open_position(self.data, 10)
        original = self.core.ib.placeOrder
        def submit(contract, order):
            if not order.orderRef.startswith('SMIOC_'):
                return original(contract, order)
            attempt = int(order.orderRef.rsplit('_', 1)[1])
            if attempt > 2 and not extra_failures:
                return original(contract, order)
            trade = N(contract=contract, order=order,
                      orderStatus=N(status='Submitted'), fills=[])
            self.core.ib.history.append(trade)
            self.core.ib.mutations.append(order.orderRef)
            filled = (3, 2, 0)[attempt] if attempt < 3 else 0
            if filled:
                self.core.ib.fill(trade, filled, 105)
            trade.orderStatus.status = third_status if attempt == 2 else 'Cancelled'
            return trade
        self.core.ib.placeOrder = submit
        await self.engine.handle(close_signal(self.data))
        for _ in range(5):
            await self.engine.reconcile()
        self.assertEqual(self.core.ib.position, -5)
        self.assertEqual(len(self.row()['retired_closes']), 2)
        self.assertEqual(len(self.close_orders()), 3)

    async def eod(self):
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED': '1'}):
            await self.engine.eod_failsafe_pass(self.now)

    async def test_remaining_quantity_closed_once_at_eod_with_original_reason(self):
        await self.stalled()
        self.assertIn('replacement limit', self.row().get('recovery_blocker', ''))
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.position, 0)
        self.assertEqual(self.close_orders()[-1].order.totalQuantity, 5)
        callback = next(iter(self.core.outbox.values()))
        self.assertEqual(callback['qty'], 10)
        self.assertEqual(callback['reason'], 'RSI_STOP')
        self.assertEqual(sum(x['qty'] for x in callback['execution_components'].values()), 10)
        await asyncio.gather(self.eod(), self.eod(), self.engine.handle(close_signal(self.data)))
        self.assertEqual(len(self.close_orders()), 4)
        self.assertEqual(len(self.core.outbox), 1)

    async def test_prior_fills_never_cancel_unfilled_replacement(self):
        await self.stalled(third_status='Submitted')
        self.now += timedelta(seconds=30)
        await self.engine.reconcile()
        self.assertNotIn(self.close_orders()[-1].order.orderRef, self.core.ib.cancels)
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertNotIn(self.close_orders()[-1].order.orderRef, self.core.ib.cancels)
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(self.engine.health['eod_result'], 'blocked')

    async def test_each_order_gets_grace_from_its_own_first_partial_fill(self):
        await self.stalled(third_status='Submitted')
        current = self.close_orders()[-1]
        self.now = self.now.replace(hour=15, minute=55)
        self.core.ib.fill(current, 1, 105)
        current.orderStatus.status = 'Submitted'
        await self.eod()
        self.assertNotIn(current.order.orderRef, self.core.ib.cancels)
        self.now += timedelta(seconds=3)
        await self.eod()
        self.assertIn(current.order.orderRef, self.core.ib.cancels)
        await self.eod()
        self.assertEqual(self.close_orders()[-1].order.totalQuantity, 4)
        self.assertEqual(self.core.ib.position, 0)

    async def test_no_cancel_of_last_partial_when_ordinary_budget_exhausted(self):
        await self.stalled(third_status='Submitted')
        current = self.close_orders()[-1]
        self.core.ib.fill(current, 1, 105)
        current.orderStatus.status = 'Submitted'
        await self.engine.reconcile()
        self.now += timedelta(seconds=10)
        await self.engine.reconcile()
        self.assertNotIn(current.order.orderRef, self.core.ib.cancels)

    async def test_bounded_eod_budget_survives_restart_and_repeated_passes(self):
        await self.stalled(extra_failures=True)
        self.now = self.now.replace(hour=15, minute=55)
        for _ in range(4):
            await self.eod()
        self.engine = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        for _ in range(4):
            await self.eod()
        self.assertEqual(len(self.close_orders()), 5)  # initial + 2 normal + 2 EOD
        self.assertEqual(len(self.row()['retired_closes']), 4)
        self.assertEqual(self.core.ib.position, -5)
        self.assertEqual(self.engine.health['eod_result'], 'blocked')
        self.assertFalse(self.core.outbox)

    async def test_missing_exact_close_is_never_replaced(self):
        await self.stalled()
        self.core.ib.history.remove(self.close_orders()[-1])
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 2)
        self.assertIn('unconfirmed', self.row().get('recovery_blocker', ''))
        self.assertEqual(self.core.ib.position, -5)

    async def test_unknown_submission_stays_reserved_at_eod(self):
        await self.stalled()
        def unknown(*args):
            raise ConnectionError('unknown acknowledgement')
        self.core.ib.placeOrder = unknown
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(self.row()['state'], 'CLOSE_SUBMITTING')
        self.engine = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(len(self.row()['retired_closes']), 3)

    async def test_lost_ack_after_eod_fill_publishes_once_without_resubmit(self):
        await self.stalled()
        original = self.core.ib.placeOrder
        def lost_ack(*args):
            original(*args)
            raise ConnectionError('lost acknowledgement')
        self.core.ib.placeOrder = lost_ack
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.engine = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        await self.eod()
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.position, 0)
        self.assertEqual(len(self.close_orders()), 4)
        self.assertEqual(len(self.core.outbox), 1)

    async def test_eod_retry_requires_fresh_ownership_coverage(self):
        await self.stalled()
        self.core.history_covered = False
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertIn('coverage', self.row().get('recovery_blocker', ''))

    async def test_foreign_same_symbol_order_is_never_cancelled_or_closed(self):
        await self.stalled()
        foreign = Order('BUY', 5, account='DEMO')
        foreign.orderId, foreign.orderRef = 999, 'FOREIGN'
        self.core.ib.placeOrder(N(symbol='APA'), foreign)
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        await self.engine.reconcile()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertNotIn('FOREIGN', self.core.ib.cancels)
        self.assertEqual(self.core.ib.position, -5)

    async def test_foreign_execution_blocks_eod_recovery(self):
        await self.stalled()
        foreign = Order('BUY', 1, account='DEMO')
        foreign.orderId, foreign.orderRef = 999, 'FOREIGN'
        trade = self.core.ib.placeOrder(N(symbol='APA'), foreign)
        self.core.ib.fill(trade, 1, 105)
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(self.core.ib.position, -4)
        self.assertFalse(self.core.outbox)

    async def test_wrong_account_and_dry_run_block_eod_recovery(self):
        await self.stalled()
        self.now = self.now.replace(hour=15, minute=55)
        self.core.DRY_RUN = True
        await self.eod()
        self.core.DRY_RUN = False
        state = self.engine.load()
        state['setups'][self.data['setup_id']]['account'] = 'OTHER'
        self.engine.save(state)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(self.core.ib.position, -5)

    async def test_disabled_before_due_and_after_close_never_use_extra_budget(self):
        await self.stalled()
        for hour, minute in [(15, 54), (16, 0), (17, 0)]:
            self.now = self.now.replace(hour=hour, minute=minute)
            await self.eod()
        self.now = self.now.replace(hour=15, minute=55)
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED': '0'}):
            await self.engine.eod_failsafe_pass(self.now)
        self.assertEqual(len(self.close_orders()), 3)

    async def test_halfday_stalled_close_uses_actual_broker_session(self):
        await self.stalled()
        self.core.ib.reqContractDetailsAsync = AsyncMock(return_value=[N(
            contract=N(secType='STK'), timeZoneId='America/New_York',
            liquidHours='20261026:0930-20261026:1300')])
        self.now = self.now.replace(hour=12, minute=54)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.now = self.now.replace(minute=55)
        await self.eod()
        self.assertEqual(self.core.ib.position, 0)

    async def test_ambiguous_or_closed_session_leaves_stalled_close_reserved(self):
        await self.stalled()
        self.now = self.now.replace(hour=15, minute=55)
        self.core.ib.reqContractDetailsAsync = AsyncMock(return_value=[])
        await self.eod()
        self.core.ib.reqContractDetailsAsync.return_value = [N(
            contract=N(secType='STK'), timeZoneId='America/New_York', liquidHours='20261026:CLOSED')]
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)

    async def test_retired_eod_reservation_cannot_escape_window_after_restart(self):
        await self.stalled()
        # Crash boundary after exact terminal retirement, before new submission.
        state = self.engine.load()
        row = state['setups'][self.data['setup_id']]
        row['retired_closes'].append(row.pop('close'))
        row['state'] = 'TARGET_CANCEL_PENDING'
        self.engine.save(state)
        self.engine = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED': '1'}):
            await self.engine.reconcile()
            await self.engine.handle(close_signal(self.data))
        self.assertEqual(len(self.close_orders()), 3)
        self.assertIn('verified EOD window', self.row()['recovery_blocker'])
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(self.core.ib.position, 0)

    async def test_late_fill_on_retired_order_reduces_replacement_quantity(self):
        await self.stalled()
        original = self.engine.permitted_close_session
        calls = 0
        async def session(data):
            nonlocal calls
            calls += 1
            if calls == 3:
                self.core.ib.fill(self.close_orders()[0], 1, 105)
            return await original(data)
        self.engine.permitted_close_session = session
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(self.close_orders()[-1].order.totalQuantity, 4)
        self.assertEqual(self.core.ib.position, 0)

    async def test_session_ends_during_eod_reservation_no_market_order(self):
        await self.stalled()
        original = self.engine.save
        def save(state):
            original(state)
            row = state['setups'][self.data['setup_id']]
            if row['state'] == 'CLOSE_SUBMITTING':
                self.now = self.now.replace(hour=16, minute=0)
        self.engine.save = save
        self.now = self.now.replace(hour=15, minute=59, second=59)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertNotIn('close', self.row())
        self.assertEqual(self.core.ib.position, -5)

    async def test_eod_reservation_save_failure_never_submits(self):
        await self.stalled()
        self.now = self.now.replace(hour=15, minute=55)
        original = self.engine.save
        def save(state):
            if state['setups'][self.data['setup_id']]['state'] == 'CLOSE_SUBMITTING':
                raise OSError('disk full')
            original(state)
        self.engine.save = save
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(self.core.ib.position, -5)

    async def test_late_full_fill_during_eod_submits_no_replacement(self):
        await self.stalled()
        original = self.engine.refreshed
        async def refresh():
            current = self.close_orders()[-1]
            if not current.fills:
                self.core.ib.fill(current, 5, 105)
            await original()
        self.engine.refreshed = refresh
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(self.core.ib.position, 0)
        self.assertEqual(len(self.core.outbox), 1)

    async def test_eod_recovery_with_publication_outage_still_flattens(self):
        await self.stalled()
        state = self.engine.load()
        row = state['setups'][self.data['setup_id']]
        self.core.outbox[row['entry_delivery_id']] = {}
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.position, 0)
        self.assertEqual(len(self.core.outbox), 1)  # only the existing OPEN backlog
        self.assertNotIn('exit_delivery_id', self.row())
        self.core.outbox.clear()
        await self.engine.reconcile()
        self.assertEqual(len(self.core.outbox), 1)
        self.assertEqual(len(self.close_orders()), 4)

    async def test_eod_never_submits_on_position_quantity_mismatch(self):
        await self.stalled()
        self.core.ib.position = -6
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(self.core.ib.position, -6)

    async def test_stalled_close_refresh_failure_consumes_no_retry(self):
        await self.stalled()
        self.core.ib.reqExecutionsAsync = AsyncMock(return_value=None)
        self.now = self.now.replace(hour=15, minute=55)
        await self.eod()
        self.assertEqual(len(self.close_orders()), 3)
        self.assertEqual(len(self.row()['retired_closes']), 2)


if __name__ == '__main__':
    unittest.main()
