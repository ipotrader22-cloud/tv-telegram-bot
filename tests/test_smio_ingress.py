"""Real webhook and durable receipt lifecycle; no FastAPI/IB runtime imports."""
import ast
import asyncio
import json
from pathlib import Path
import sys
from types import SimpleNamespace as N
import unittest
from unittest.mock import AsyncMock, Mock, patch

from tests import test_smio_demo_lifecycle as fixtures
from tests.test_smio_demo_lifecycle import signal, close_signal
from bridge.smio_ingress import DurableIngress


class IngressTests(unittest.IsolatedAsyncioTestCase):
    setUp = fixtures.LifecycleTests.setUp
    tearDown = fixtures.LifecycleTests.tearDown
    snapshot = fixtures.LifecycleTests.snapshot
    open_position = fixtures.LifecycleTests.open_position

    def webhook(self):
        source = Path('bridge/ib_bridge_core.py').read_text(encoding='utf-8')
        node = next(n for n in ast.parse(source).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'tv_webhook')
        node.decorator_list = []
        background = AsyncMock()
        namespace = {'Request': object, 'BackgroundTasks': object, 'DRY_RUN': False,
                     '_smio_accept_signal': self.engine.accept_signal,
                     'process_signal_background': background}
        exec(compile(ast.Module(body=[node], type_ignores=[]), '<actual-webhook>', 'exec'), namespace)
        self.enterContext(patch.dict(sys.modules, {'fastapi.responses': N(JSONResponse=lambda **kw: N(**kw))}))
        return namespace['tv_webhook'], background

    async def test_http_ack_requires_durable_receipt_before_background(self):
        handler, _ = self.webhook()
        data = signal()
        tasks = N(add_task=Mock())
        response = await handler(N(json=AsyncMock(return_value=data)), tasks)
        self.assertEqual(response.status_code, 200)
        row = self.engine.ingress.load()['receipts'][data['event_id']]
        self.assertEqual(row['state'], 'RECEIVED')
        self.assertEqual(tasks.add_task.call_count, 1)
        self.assertFalse(self.core.ib.mutations)

    async def test_failed_durable_write_returns_503_without_background(self):
        handler, _ = self.webhook()
        tasks = N(add_task=Mock())
        with patch.object(self.engine.ingress, 'save', side_effect=OSError('disk unavailable')):
            response = await handler(N(json=AsyncMock(return_value=signal())), tasks)
        self.assertEqual(response.status_code, 503)
        tasks.add_task.assert_not_called()
        self.assertFalse(self.core.ib.mutations)

    async def test_corrupt_inbox_returns_503_not_ack(self):
        self.engine.ingress.path.write_text('{broken', encoding='utf-8')
        result = await self.engine.accept_signal(signal())
        self.assertEqual(result['http_status'], 503)

    async def test_modified_durable_body_cannot_be_dispatched(self):
        data = signal()
        self.snapshot(data)
        await self.engine.accept_signal(data)
        state = self.engine.ingress.load()
        state['receipts'][data['event_id']]['payload']['qty'] = 20
        self.engine.ingress.save(state)
        with self.assertRaises(ValueError):
            await self.engine.process_inbox()
        self.assertFalse(self.core.ib.mutations)

    async def test_foreign_webhook_still_uses_original_background(self):
        handler, background = self.webhook()
        data = {'strategy':'SHREK_1_4', 'event':'SETUP', 'symbol':'AAPL','side':'LONG'}
        tasks = N(add_task=Mock())
        result = await handler(N(json=AsyncMock(return_value=data)), tasks)
        self.assertEqual(result['status'], 'accepted')
        tasks.add_task.assert_called_once_with(background, data)
        self.assertFalse(self.engine.ingress.path.exists())

    async def test_duplicate_concurrent_receipts_submit_one_entry(self):
        data = signal()
        self.snapshot(data)
        await asyncio.gather(self.engine.accept_signal(data), self.engine.accept_signal(data))
        await asyncio.gather(self.engine.process_receipt(data['event_id']), self.engine.process_receipt(data['event_id']))
        self.assertEqual(sum(x.startswith('SMIOE_') for x in self.core.ib.mutations), 1)

    async def test_conflicting_body_or_dry_run_does_not_replace_receipt(self):
        data = signal()
        await self.engine.accept_signal(data)
        for other in ({**data, 'qty':20}, {**data, 'dry_run':True}):
            self.assertEqual((await self.engine.accept_signal(other))['http_status'], 409)
        self.assertEqual(self.engine.ingress.load()['receipts'][data['event_id']]['payload']['qty'], 10)

    async def test_duplicate_after_expiry_acknowledges_without_reexecution(self):
        data = signal()
        self.snapshot(data)
        await self.engine.accept_signal(data)
        await self.engine.process_receipt(data['event_id'])
        self.now = self.now.replace(hour=13)
        result = await self.engine.accept_signal(data)
        self.assertTrue(result['duplicate'])
        self.assertFalse(result['process'])
        self.assertEqual(sum(x.startswith('SMIOE_') for x in self.core.ib.mutations), 1)

    async def test_process_restart_quarantines_unfinished_receipt(self):
        data = signal()
        await self.engine.accept_signal(data)
        self.engine.ingress = DurableIngress(self.engine.ingress.path)
        await self.engine.process_inbox()
        row = self.engine.ingress.load()['receipts'][data['event_id']]
        self.assertEqual(row['state'], 'QUARANTINED')
        self.assertFalse(self.core.ib.mutations)

    async def test_missing_background_task_drains_current_process_receipt(self):
        data = signal()
        self.snapshot(data)
        await self.engine.accept_signal(data)
        await self.engine.process_inbox()
        self.assertEqual(sum(x.startswith('SMIOE_') for x in self.core.ib.mutations), 1)

    async def test_expired_unprocessed_receipt_never_replays(self):
        data = signal()
        self.snapshot(data)
        await self.engine.accept_signal(data)
        self.now = self.now.replace(hour=13)
        await self.engine.process_inbox()
        self.assertEqual(self.engine.ingress.load()['receipts'][data['event_id']]['state'], 'QUARANTINED')
        self.assertFalse(self.core.ib.mutations)

    async def test_persisted_dry_run_stays_nonmutating_after_flag_change(self):
        data = signal()
        self.core.DRY_RUN = True
        await self.engine.accept_signal(data)
        self.core.DRY_RUN = False
        await self.engine.process_inbox()
        self.assertFalse(self.core.ib.mutations)

    async def test_fresh_close_retries_transient_disconnect_without_duplicate(self):
        data = signal()
        await self.open_position(data)
        close = close_signal(data)
        await self.engine.accept_signal(close)
        original = self.core.ensure_ib_connected
        self.core.ensure_ib_connected = AsyncMock(side_effect=ConnectionError('offline'))
        await self.engine.process_inbox()
        self.assertEqual(self.engine.ingress.load()['receipts'][close['event_id']]['state'], 'RETRY')
        self.core.ensure_ib_connected = original
        self.now = self.now.replace(second=6)
        await self.engine.process_inbox()
        await self.engine.process_inbox()
        self.assertEqual(self.core.ib.position, 0)
        self.assertEqual(sum(x.startswith('SMIOC_') for x in self.core.ib.mutations), 1)

    async def test_failed_result_save_keeps_claim_and_never_submits_twice(self):
        data = signal()
        self.snapshot(data)
        await self.engine.accept_signal(data)
        with patch.object(self.engine.ingress, 'finish', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                await self.engine.process_inbox()
        await self.engine.process_inbox()
        self.assertEqual(self.engine.ingress.load()['receipts'][data['event_id']]['state'], 'PROCESSING')
        self.assertEqual(sum(x.startswith('SMIOE_') for x in self.core.ib.mutations), 1)

    async def test_prior_day_close_rejected_without_replay(self):
        data = signal()
        close = close_signal(data)
        self.now = self.now.replace(day=27)
        self.assertEqual((await self.engine.accept_signal(close))['http_status'], 400)
        self.assertFalse(self.engine.ingress.path.exists())
