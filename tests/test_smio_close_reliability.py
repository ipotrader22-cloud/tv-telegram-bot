"""Deterministic safety regressions; broker fixtures never connect to TWS."""
import asyncio
import copy
import os
import unittest
from types import SimpleNamespace as N
from unittest.mock import AsyncMock, patch

from tests import test_smio_demo_lifecycle as fixtures
from tests.test_smio_demo_lifecycle import signal, close_signal, Order
from bridge.smio_demo_adapter import DemoLifecycle


class CloseReliabilityTests(unittest.IsolatedAsyncioTestCase):
    setUp = fixtures.LifecycleTests.setUp
    tearDown = fixtures.LifecycleTests.tearDown
    snapshot = fixtures.LifecycleTests.snapshot
    open_position = fixtures.LifecycleTests.open_position

    async def test_session_ends_during_target_cancel(self):
        data = signal()
        await self.open_position(data)
        original = self.core.ib.cancelOrder
        def cancel(order):
            original(order)
            self.now = self.now.replace(hour=16)
        self.core.ib.cancelOrder = cancel
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result['status'], 'smio_demo_blocked')
        self.assertFalse(any(x.startswith('SMIOC_') for x in self.core.ib.mutations))
        self.assertEqual(self.core.ib.position, 10)

    async def test_session_ends_during_intent_save_reports_blocked(self):
        data = signal()
        await self.open_position(data)
        original = self.engine.save
        def save(state):
            original(state)
            if state['setups'][data['setup_id']]['state'] == 'CLOSE_SUBMITTING':
                self.now = self.now.replace(hour=16)
        self.engine.save = save
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result['status'], 'smio_demo_blocked')
        self.assertFalse(result['broker_execution'])
        self.assertNotIn('close', self.engine.load()['setups'][data['setup_id']])
        self.assertEqual(self.core.ib.position, 10)

    async def test_regular_1555_failsafe_closes_open_position_once(self):
        data = signal()
        await self.open_position(data)
        self.now = self.now.replace(hour=15, minute=55)
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED':'1'}):
            await self.engine.eod_failsafe_pass(self.now)
            await self.engine.eod_failsafe_pass(self.now)
        self.assertEqual(self.core.ib.position, 0)
        self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 1)

    async def test_wrong_journal_account_never_mutates(self):
        data = signal()
        await self.open_position(data)
        state = self.engine.load()
        state['setups'][data['setup_id']]['account'] = 'OTHER'
        self.engine.save(state)
        before = list(self.core.ib.mutations)
        await self.engine.handle(close_signal(data))
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.mutations, before)
        self.assertFalse(self.core.ib.cancels)

    async def test_dry_run_duplicate_queued_close_is_nonmutating(self):
        data = signal()
        await self.open_position(data)
        self.core.rth = False
        close = close_signal(data)
        await self.engine.handle(close)
        self.core.rth, self.core.DRY_RUN = True, True
        await self.engine.handle(close)
        await self.engine.reconcile()
        self.assertFalse(self.core.ib.cancels)
        self.assertEqual(self.core.ib.position, 10)

    async def test_refresh_timeout_releases_locks_and_clears_coverage(self):
        data = signal()
        await self.open_position(data)
        self.engine.refresh_timeout = .01
        async def hanging():
            await asyncio.Event().wait()
        self.core.ib.reqPositionsAsync = hanging
        result = await asyncio.wait_for(self.engine.handle(close_signal(data)), .5)
        self.assertEqual(result['status'], 'smio_demo_blocked')
        self.assertFalse(self.engine.routing_lock.locked())
        self.assertFalse(self.core.ib_lock.locked())
        self.assertFalse(self.engine.execution_refresh['ok'])
        self.assertFalse(self.core.ib.cancels)

    async def test_reconciliation_failure_does_not_skip_eod_evaluation(self):
        self.engine.reconcile = AsyncMock(side_effect=ValueError('fixture'))
        self.engine.eod_failsafe_pass = AsyncMock()
        await self.engine.maintenance_pass()
        self.engine.eod_failsafe_pass.assert_awaited_once()
        self.assertEqual(self.engine.health['reconcile_error'], 'ValueError')

    async def test_foreign_order_from_all_clients_blocks_close(self):
        data = signal()
        await self.open_position(data)
        foreign = Order('SELL', 10, account='DEMO')
        foreign.orderId, foreign.orderRef = 900, 'FOREIGN'
        async def all_orders():
            if not any(t.order is foreign for t in self.core.ib.history):
                self.core.ib.history.append(N(contract=N(symbol='APA'), order=foreign,
                    orderStatus=N(status='Submitted'), fills=[]))
            return self.core.ib.openTrades()
        self.core.ib.reqAllOpenOrdersAsync = all_orders
        await self.engine.handle(close_signal(data))
        self.assertFalse(self.core.ib.cancels)
        self.assertEqual(self.core.ib.position, 10)

    async def test_foreign_execution_during_cancel_blocks_remainder(self):
        data = signal()
        await self.open_position(data)
        original = self.core.ib.cancelOrder
        def cancel(order):
            original(order)
            foreign = Order('SELL', 1, account='DEMO')
            foreign.orderId, foreign.orderRef = 900, 'FOREIGN'
            trade = self.core.ib.placeOrder(N(symbol='APA'), foreign)
            self.core.ib.fill(trade, 1, 101)
        self.core.ib.cancelOrder = cancel
        await self.engine.handle(close_signal(data))
        self.assertFalse(any(x.startswith('SMIOC_') for x in self.core.ib.mutations))
        self.assertEqual(self.core.ib.position, 9)

    async def test_duplicate_restart_after_submission_never_reverses(self):
        data = signal()
        await self.open_position(data)
        close = close_signal(data)
        await self.engine.handle(close)
        restart = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        await restart.handle(close)
        await restart.reconcile()
        self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 1)
        self.assertEqual(self.core.ib.position, 0)

    async def test_first_error_survives_later_outside_rth_error(self):
        data = signal()
        await self.open_position(data)
        self.core.history_covered = False
        await self.engine.handle(close_signal(data))
        self.core.history_covered, self.core.rth = True, False
        await self.engine.handle(close_signal(data))
        row = self.engine.load()['setups'][data['setup_id']]
        self.assertIn('coverage', row['first_failure']['reason'])
        self.assertIn('permitted RTH', row['recovery_blocker'])
        self.assertTrue(row['signal_receipts'])

    async def test_live_trade_status_not_replaced_by_completed_snapshot(self):
        data = signal()
        await self.open_position(data)
        live = self.core.ib.history[1]
        self.engine.completed_trades = [copy.deepcopy(live)]
        self.assertIs(self.engine.exact_trade('APA', 'DEMO', live.order.orderRef, live.order.orderId), live)

    async def test_partial_close_recovers_during_render_outage(self):
        data = signal()
        await self.open_position(data)
        self.core.outbox['entry-pending'] = {}
        state = self.engine.load()
        state['setups'][data['setup_id']]['entry_delivery_id'] = 'entry-pending'
        self.engine.save(state)
        original = self.core.ib.placeOrder
        def partial(contract, order):
            if order.orderRef.startswith('SMIOC_') and order.orderRef.endswith('_0'):
                trade = N(contract=contract, order=order, orderStatus=N(status='Submitted'), fills=[])
                self.core.ib.history.append(trade)
                self.core.ib.mutations.append(order.orderRef)
                self.core.ib.fill(trade, 3, 105)
                trade.orderStatus.status = 'Cancelled'
                return trade
            return original(contract, order)
        self.core.ib.placeOrder = partial
        await self.engine.handle(close_signal(data))
        await self.engine.reconcile()
        await self.engine.reconcile()
        self.assertEqual(self.core.ib.position, 0)
        self.assertEqual(self.core.ib.history[-1].order.totalQuantity, 7)
        self.assertEqual(list(self.core.outbox), ['entry-pending'])

    async def test_eod_boundaries_disabled_holiday_half_day(self):
        data = signal()
        await self.open_position(data)
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED':'0'}):
            self.now = self.now.replace(hour=15, minute=55)
            await self.engine.eod_failsafe_pass(self.now)
            self.assertEqual(self.core.ib.position, 10)
            self.assertFalse(self.engine.health['eod_enabled'])
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED':'1'}):
            for hour, minute in [(15,30),(16,0)]:
                self.now = self.now.replace(hour=hour, minute=minute)
                await self.engine.eod_failsafe_pass(self.now)
                self.assertEqual(self.core.ib.position, 10)
            self.now = self.now.replace(hour=12, minute=55)
            self.core.ib.reqContractDetailsAsync = AsyncMock(return_value=[N(
                contract=N(secType='STK'), timeZoneId='America/New_York', liquidHours='20261026:CLOSED')])
            await self.engine.eod_failsafe_pass(self.now)
            self.assertEqual(self.core.ib.position, 10)
            self.core.ib.reqContractDetailsAsync.return_value[0].liquidHours = '20261026:0930-20261026:1300'
            await self.engine.eod_failsafe_pass(self.now)
            self.assertEqual(self.core.ib.position, 0)
            await self.engine.eod_failsafe_pass(self.now)
            self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 1)

    async def test_regular_failsafe_1555_and_queued_close_do_not_duplicate(self):
        data = signal()
        await self.open_position(data)
        self.core.rth = False
        await self.engine.handle(close_signal(data, 'RTH_EOD'))
        self.core.rth = True
        self.now = self.now.replace(hour=15, minute=55)
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED':'1'}):
            await self.engine.maintenance_pass()
            await self.engine.maintenance_pass()
        self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 1)
        self.assertEqual(self.core.ib.position, 0)

    async def test_disconnect_and_missing_execution_response_fail_closed(self):
        data = signal()
        await self.open_position(data)
        self.core.ensure_ib_connected = AsyncMock(side_effect=ConnectionError('offline'))
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result['status'], 'smio_demo_blocked')
        self.core.ensure_ib_connected = AsyncMock()
        self.core.ib.reqExecutionsAsync = AsyncMock(return_value=None)
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result['status'], 'smio_demo_blocked')
        self.assertFalse(self.core.ib.cancels)
        self.assertEqual(self.core.ib.position, 10)

    async def test_restart_after_reserved_but_unacknowledged_close_does_not_resubmit(self):
        data = signal()
        await self.open_position(data)
        self.core.ib.placeOrder = lambda *_: (_ for _ in ()).throw(ConnectionError('unknown submission'))
        close = close_signal(data)
        result = await self.engine.handle(close)
        self.assertEqual(result['status'], 'smio_demo_recovery_required')
        self.assertEqual(self.engine.load()['setups'][data['setup_id']]['state'], 'CLOSE_SUBMITTING')
        restart = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        await restart.handle(close)
        await restart.reconcile()
        self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 0)
        self.assertEqual(self.core.ib.position, 10)

    async def test_lost_ack_after_broker_fill_reconciles_without_resubmission(self):
        data = signal()
        await self.open_position(data)
        original = self.core.ib.placeOrder
        def lost_ack(contract, order):
            original(contract, order)
            raise ConnectionError('lost acknowledgement')
        self.core.ib.placeOrder = lost_ack
        close = close_signal(data)
        await self.engine.handle(close)
        restart = DemoLifecycle(self.core, self.engine.config_path, self.engine.journal_path)
        await restart.handle(close)
        await restart.reconcile()
        self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 1)
        self.assertEqual(self.core.ib.position, 0)
        self.assertTrue(next(iter(self.core.outbox.values()))['broker_confirmed_flat'])

    async def test_diagnostic_save_failure_does_not_deny_possible_submission(self):
        data = signal()
        await self.open_position(data)
        original = self.core.ib.placeOrder
        def submit_then_disk_failure(contract, order):
            trade = original(contract, order)
            self.engine.save = lambda *_: (_ for _ in ()).throw(OSError('disk full'))
            return trade
        self.core.ib.placeOrder = submit_then_disk_failure
        result = await self.engine.handle(close_signal(data))
        self.assertEqual(result['status'], 'smio_demo_recovery_required')
        self.assertIsNone(result['broker_execution'])
        self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 1)

    async def test_foreign_fill_during_final_session_query_blocks_close(self):
        data = signal()
        await self.open_position(data)
        original = self.core.ib.reqContractDetailsAsync
        calls = 0
        async def details(contract):
            nonlocal calls
            calls += 1
            if calls == 2:
                order = Order('SELL', 1, account='DEMO')
                order.orderId, order.orderRef = 990, 'FOREIGN'
                trade = self.core.ib.placeOrder(contract, order)
                self.core.ib.fill(trade, 1, 100)
            return await original(contract)
        self.core.ib.reqContractDetailsAsync = details
        await self.engine.handle(close_signal(data))
        self.assertEqual(self.core.ib.position, 9)
        self.assertFalse(any(x.startswith('SMIOC_') for x in self.core.ib.mutations))

    async def test_multiple_positions_eod_scan_continues_after_blocked_row(self):
        data = signal()
        await self.open_position(data)
        state = self.engine.load()
        second = copy.deepcopy(state['setups'][data['setup_id']])
        second['payload']['symbol'] = 'NKE'
        second['payload']['setup_id'] = 'second-fixture'
        state['setups']['second-fixture'] = second
        self.engine.save(state)
        self.engine.handle = AsyncMock(side_effect=[ValueError('first blocked'), {'status':'smio_demo_accepted'}])
        self.now = self.now.replace(hour=15, minute=55)
        with patch.dict(os.environ, {'SMIO_DEMO_EOD_FAILSAFE_ENABLED':'1'}):
            await self.engine.eod_failsafe_pass(self.now)
        self.assertEqual([c.args[0]['symbol'] for c in self.engine.handle.await_args_list], ['APA','NKE'])
        self.assertEqual(self.engine.health['eod_result'], 'blocked')


if __name__ == '__main__':
    import unittest
    unittest.main()
