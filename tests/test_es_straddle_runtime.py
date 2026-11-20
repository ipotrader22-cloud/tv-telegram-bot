import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch, Mock
from test_es_straddle import plan, ENTRY
from es_straddle.core import ET
from es_straddle.runtime import (validate_execution_mode, history_policy_allowed,
                                 training_enabled, next_entry, paused, StatusPublisher)
from es_straddle.tws import run


class RuntimeTests(unittest.TestCase):
    def args(self, **kw):
        values=dict(paper_training=False,paper_execute=False,history_all_clients_verified=False,
                    account='DU_PRIVATE',state_dir=None,client_id=1820,port=7497,underlying_id=100)
        values.update(kw); return N(**values)

    def test_training_requires_explicit_execution_and_does_not_attest_history(self):
        with self.assertRaises(ValueError): validate_execution_mode(self.args(paper_training=True))
        args=self.args(paper_training=True,paper_execute=True)
        validate_execution_mode(args)
        self.assertTrue(history_policy_allowed(args))
        self.assertFalse(args.history_all_clients_verified)

    def test_execution_without_training_still_requires_attestation(self):
        with self.assertRaises(ValueError): validate_execution_mode(self.args(paper_execute=True))
        validate_execution_mode(self.args(paper_execute=True,history_all_clients_verified=True))
        self.assertFalse(training_enabled(self.args(paper_execute=True,history_all_clients_verified=True)))

    def test_readonly_does_not_gain_training_permission(self):
        self.assertFalse(history_policy_allowed(self.args(paper_training=True)))

    def test_next_entry_does_not_enter_late_or_on_friday_saturday(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            self.assertEqual(next_entry(datetime(2026,11,16,22,0,tzinfo=ET),root),'2026-11-17T20:20:00-05:00')
            self.assertEqual(next_entry(datetime(2026,11,20,10,0,tzinfo=ET),root),'2026-11-22T20:20:00-05:00')

    def test_journal_prevents_reentry_and_window_preserves_original_time(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); clock=datetime(2026,11,16,20,20,30,tzinfo=ET)
            self.assertEqual(next_entry(clock,root),'2026-11-16T20:20:00-05:00')
            (root/'session-2026-11-16.json').write_text('{}')
            self.assertEqual(next_entry(clock,root),'2026-11-17T20:20:00-05:00')

    def test_pause_and_status_never_disclose_account_or_claim_live_readiness(self):
        with tempfile.TemporaryDirectory() as d:
            args=self.args(state_dir=Path(d),paper_execute=True,paper_training=True)
            self.assertFalse(paused(args))
            (args.state_dir/'pause-new-entries.flag').touch()
            status=StatusPublisher(args)
            status.publish('PAUSED',reason='DU_PRIVATE blocked',force=True)
            raw=(args.state_dir/'status.json').read_text(); report=json.loads(raw)
            self.assertNotIn('DU_PRIVATE',raw)
            self.assertIsNone(report['next_scheduled_entry_et'])
            self.assertTrue(report['acceptance_pending'])
            self.assertFalse(report['history_visibility_verified'])
            self.assertFalse(report['live_trading_allowed'])

    def test_paused_empty_runtime_does_not_connect(self):
        with tempfile.TemporaryDirectory() as d:
            args=self.args(state_dir=Path(d),paper_execute=True,paper_training=True)
            (args.state_dir/'pause-new-entries.flag').touch()
            with patch('es_straddle.tws.TWS') as broker:
                run(args)
                broker.assert_not_called()
            self.assertEqual(json.loads((args.state_dir/'status.json').read_text())['phase'],'PAUSED')

    def test_pause_during_selection_prevents_first_submission(self):
        with tempfile.TemporaryDirectory() as d:
            args=self.args(state_dir=Path(d),paper_execute=True,paper_training=True)
            def select(clock):
                (args.state_dir/'pause-new-entries.flag').touch()
                return plan()
            b=N(continuous=True,select=select,ib=N(isConnected=lambda:True,disconnect=Mock()))
            with patch('es_straddle.tws.TWS',return_value=b), patch('es_straddle.tws.now',return_value=ENTRY), \
                 patch('es_straddle.tws.drive_session') as drive:
                run(args)
                drive.assert_not_called()
            record=json.loads(next(args.state_dir.glob('session-*.json')).read_text())
            self.assertEqual(record['state']['outcome'],'PAUSED_BEFORE_ENTRY')
            self.assertEqual(record['orders'],{})

    def test_waiting_status_retains_last_skipped_session_and_selection_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            args=self.args(state_dir=Path(d),paper_execute=True,paper_training=True)
            record={'state':{'done':True,'outcome':'SKIPPED_PREFLIGHT'},'reason':'DU_PRIVATE quote error',
                    'entry_selection':{'exact_midpoint':'50.125','entry_limit':'50.25'}}
            (args.state_dir/'session-2026-11-17.json').write_text(json.dumps(record))
            status=StatusPublisher(args)
            status.publish('ENTRY_SKIPPED',force=True)
            status.publish('WAITING_FOR_ENTRY',force=True)
            raw=(args.state_dir/'status.json').read_text(); value=json.loads(raw)
            self.assertNotIn('DU_PRIVATE',raw)
            self.assertEqual(value['last_session']['outcome'],'SKIPPED_PREFLIGHT')
            self.assertEqual(value['last_session']['entry_selection']['entry_limit'],'50.25')

    def test_selection_failure_preserves_quote_evidence_without_entry(self):
        with tempfile.TemporaryDirectory() as d:
            args=self.args(state_dir=Path(d),paper_execute=True,paper_training=True)
            def select(clock):
                (args.state_dir/'pause-new-entries.flag').touch()
                raise ValueError('fixture quote failure')
            broker=N(continuous=True,select=select,selection_report={'exact_midpoint':'50.125'},
                     ib=N(isConnected=lambda:True,disconnect=Mock()))
            with patch('es_straddle.tws.TWS',return_value=broker), patch('es_straddle.tws.now',return_value=ENTRY), \
                 patch('es_straddle.tws.drive_session') as drive:
                run(args)
                drive.assert_not_called()
            record=json.loads(next(args.state_dir.glob('session-*.json')).read_text())
            self.assertEqual(record['entry_selection']['exact_midpoint'],'50.125')
            self.assertEqual(record['observed_at_utc'],ENTRY.isoformat())


if __name__=='__main__': unittest.main()
