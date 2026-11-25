"""Crash/reconnect regressions: fixtures never connect to a broker."""
import copy
import json
import tempfile
import unittest
from collections import deque
from pathlib import Path
from types import SimpleNamespace as N
from datetime import timedelta
from unittest.mock import patch
from test_es_straddle import plan, ENTRY, EXPIRY
from es_straddle.core import Engine, Command, Snapshot, ET, midpoint, D, Quote, target_price
from es_straddle.recovery import (RecoveryError, new_record, load_record, reserve,
    observe_fill, observe_order, recovered_order, history_covers, process_lock)
from es_straddle.tws import drive_session, expiry_time, market_increment, market_midpoint, TWS, save


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.p = plan()
        self.args = N(account='DU_TEST', client_id=1820, port=7497, underlying_id=100)
        self.engine = Engine(self.p)
        self.command = self.engine.step(Snapshot(ENTRY))[0]
        self.record = new_record(self.p, self.engine, self.args, ENTRY)
        reserve(self.record, self.command, 9)
        self.ref = self.command.ref
        self.saved = self.record['orders'][self.ref]

    def fill(self, cid=101, qty=10, price=25, eid='call', **kw):
        data = dict(execId=eid, acctNumber='DU_TEST', clientId=1820, orderId=9,
                    permId=90, orderRef=self.ref, side='SLD', shares=qty,
                    price=price, time=ENTRY + timedelta(seconds=1))
        data.update(kw)
        return N(contract=N(conId=cid,secType='FOP',symbol='ES'),execution=N(**data))

    def observe(self, fill):
        observe_fill(self.record, fill, self.p, 'DU_TEST', 1820)

    def filled(self, qty=10):
        self.observe(self.fill(qty=qty))
        self.observe(self.fill(102,qty=qty,eid='put',price=25.5))

    def trade(self, **kw):
        o = dict(account='DU_TEST',clientId=1820,orderId=9,permId=90,
                 action='SELL',totalQuantity=10,orderType='LMT',tif='DAY',
                 lmtPrice=50.5,outsideRth=True)
        o.update(kw)
        return N(order=N(**o),orderStatus=N(status='Submitted',filled=0))

    def test_versioned_roundtrip_preserves_plan_and_reservations(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'session.json'; save(path,self.record)
            record,p=load_record(path,self.args)
            self.assertEqual(p,self.p)
            self.assertEqual(record,self.record)

    def test_wrong_account_client_port_and_old_journal_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'session.json'
            for change in ({'account':'DU_OTHER'},{'client_id':77},{'port':4002}):
                bad=copy.deepcopy(self.record); bad['identity'].update(change); save(path,bad)
                with self.assertRaises(RecoveryError): load_record(path,self.args)
            bad=copy.deepcopy(self.record); bad['version']=1; save(path,bad)
            with self.assertRaises(RecoveryError): load_record(path,self.args)

    def test_crash_after_reservation_never_replays_entry(self):
        self.assertIsNone(recovered_order(self.ref,self.saved,self.p))
        e=Engine(self.p,copy.deepcopy(self.record['state']))
        self.assertEqual(e.step(Snapshot(ENTRY)),[])
        self.assertEqual(e.state['blocked'],'ENTRY_ACK_UNKNOWN')

    def test_full_fills_recover_without_completed_order(self):
        self.filled()
        order=recovered_order(self.ref,self.saved,self.p)
        self.assertEqual((order.status,order.filled,str(order.average)),('Filled',10,'50.5'))
        e=Engine(self.p,copy.deepcopy(self.record['state']))
        commands=e.step(Snapshot(ENTRY,orders={self.ref:order},call_position=-10,put_position=-10))
        self.assertEqual((commands[0].reason,commands[0].price),('TARGET','43.75'))

    def test_partial_entry_absent_ack_is_not_inferred_canceled(self):
        self.filled(4)
        self.assertIsNone(recovered_order(self.ref,self.saved,self.p))

    def test_canceled_partial_entry_recovers_weighted_target(self):
        self.filled(4)
        t=self.trade(); t.orderStatus=N(status='Cancelled',filled=4)
        observe_order(self.saved,t,'DU_TEST',1820)
        o=recovered_order(self.ref,self.saved,self.p)
        e=Engine(self.p,copy.deepcopy(self.record['state']))
        cmd=e.step(Snapshot(ENTRY,orders={self.ref:o},call_position=-4,put_position=-4))[0]
        self.assertEqual((cmd.quantity,cmd.price),(4,'43.75'))

    def test_recovery_after_deadline_closes_instead_of_placing_target(self):
        self.filled()
        o=recovered_order(self.ref,self.saved,self.p)
        e=Engine(self.p,copy.deepcopy(self.record['state']))
        cmd=e.step(Snapshot(self.p.close_at,orders={self.ref:o},call_position=-10,put_position=-10))[0]
        self.assertEqual((cmd.reason,cmd.quantity),('EOD_1555_ET',10))

    def test_execution_duplicates_are_idempotent(self):
        self.filled(); self.filled()
        self.assertEqual(recovered_order(self.ref,self.saved,self.p).filled,10)
        self.assertEqual(len(self.saved['executions']),2)

    def test_conflicting_duplicates_and_corrections_block(self):
        self.observe(self.fill(eid='a.b.01'))
        with self.assertRaises(RecoveryError): self.observe(self.fill(price=26,eid='a.b.01'))
        with self.assertRaises(RecoveryError): self.observe(self.fill(price=26,eid='a.b.02'))

    def test_five_segment_ids_distinguish_combo_legs(self):
        self.observe(self.fill(eid='a.b.c.d.01'))
        self.observe(self.fill(102,eid='a.b.c.d.02'))
        self.assertTrue(recovered_order(self.ref,self.saved,self.p).proven)

    def test_os_lock_is_released_after_process_death(self):
        import subprocess,sys
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'lock'
            code=('import sys,time; from pathlib import Path; '
                  'from es_straddle.recovery import process_lock; '
                  'ctx=process_lock(Path(sys.argv[1])); ctx.__enter__(); '
                  'print("locked",flush=True); time.sleep(30)')
            # Windows venv python.exe is a launcher; killing it leaves the actual
            # interpreter alive. Exercise death of the process holding the lock.
            executable = str(Path(sys.base_prefix)/'python.exe') if sys.platform == 'win32' else sys.executable
            child=subprocess.Popen([executable,'-c',code,str(path)],stdout=subprocess.PIPE,text=True)
            try:
                self.assertEqual(child.stdout.readline().strip(),'locked')
                child.kill(); child.wait(timeout=5)
                with process_lock(path): pass
            finally:
                if child.poll() is None: child.kill(); child.wait(timeout=5)
                child.stdout.close()

    def test_foreign_execution_is_durable_even_if_position_returns_to_same_quantity(self):
        self.observe(self.fill(clientId=77))
        self.assertTrue(self.record['foreign_activity'])

    def test_perm_id_or_order_id_mismatch_is_foreign(self):
        self.filled()
        self.observe(self.fill(eid='new',permId=91))
        self.assertTrue(self.record['foreign_activity'])

    def test_order_field_mutation_rejected(self):
        for changed in ({'lmtPrice':51},{'totalQuantity':11},{'clientId':77},
                        {'orderId':10},{'action':'BUY'}):
            with self.subTest(changed=changed):
                with self.assertRaises(RecoveryError):
                    observe_order(self.saved,self.trade(**changed),'DU_TEST',1820)

    def test_broker_normalized_outside_rth_preserves_exact_order_recovery(self):
        observe_order(self.saved,self.trade(outsideRth=False),'DU_TEST',1820)
        self.assertEqual(self.saved['perm_id'],90)
        self.assertEqual(self.saved['status'],'Submitted')
        with self.assertRaises(RecoveryError):
            observe_order(self.saved,self.trade(outsideRth=False,lmtPrice=51),'DU_TEST',1820)

    def test_unpaired_leg_never_proves_fill(self):
        self.observe(self.fill())
        self.saved.update(status='Filled',filled='10')
        self.assertFalse(recovered_order(self.ref,self.saved,self.p).proven)

    def test_filled_status_without_executions_is_unproven(self):
        self.saved.update(status='Filled',filled='10')
        self.assertFalse(recovered_order(self.ref,self.saved,self.p).proven)

    def test_history_gap_cannot_be_healed_by_empty_next_day_reply(self):
        tomorrow=ENTRY+timedelta(days=1)
        self.assertFalse(history_covers(self.record,tomorrow,ET,1))
        self.assertEqual(self.record['coverage_through'],ENTRY.isoformat())
        self.assertTrue(history_covers(self.record,tomorrow,ET,7))
        self.assertFalse(history_covers(self.record,ENTRY+timedelta(days=7),ET,7))

    def test_recent_durable_checkpoint_recovers_prior_day_position(self):
        self.record['coverage_through']=(ENTRY+timedelta(hours=5)).isoformat()
        self.assertTrue(history_covers(self.record,ENTRY+timedelta(hours=6),ET,1))

    def test_future_checkpoint_or_missing_timezone_cannot_prove_coverage(self):
        self.assertFalse(history_covers(self.record,ENTRY-timedelta(seconds=1),ET,1))
        self.assertFalse(history_covers(self.record,ENTRY,None,1))

    def test_os_lock_exclusion_and_release(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'lock'
            with process_lock(path):
                with self.assertRaises(RecoveryError):
                    with process_lock(path): pass
            with process_lock(path): pass

    def test_storage_failure_prevents_all_effects(self):
        e=Engine(self.p)
        record=new_record(self.p,e,self.args,ENTRY)
        sent=[]
        broker=N(snapshot=lambda e:Snapshot(ENTRY),
                 ib=N(client=N(getReqId=lambda:9)),execute=sent.append)
        with patch('es_straddle.tws.save',side_effect=OSError('disk full')):
            with self.assertRaises(OSError): drive_session(broker,e,record,Path('unused'))
        self.assertEqual(sent,[])

    def test_write_ahead_contains_state_and_broker_order_id(self):
        e=Engine(self.p); record=new_record(self.p,e,self.args,ENTRY); writes=[]
        broker=N(snapshot=lambda e:Snapshot(ENTRY),ib=N(client=N(getReqId=lambda:9)),
                 execute=lambda cmd:self.assertTrue(writes[-1]['state']['started']))
        with patch('es_straddle.tws.save',side_effect=lambda p,r:writes.append(copy.deepcopy(r))):
            drive_session(broker,e,record,Path('unused'))
        self.assertEqual(writes[-1]['orders'][e.entry_ref]['order_id'],9)

    def test_readonly_adapter_rejects_submit_and_cancel(self):
        a=TWS.__new__(TWS); a.paper_execute=False
        for cmd in (self.command,Command('CANCEL',self.ref)):
            with self.assertRaises(RecoveryError): a.execute(cmd)

    def test_operator_expiry_timezone_and_exchange_session_agree(self):
        detail=N(lastTradeTime='16:00:00',realExpirationDate='20261117',
                 timeZoneId='US/Central',tradingHours='20261116:1700-20261117:1500')
        self.assertEqual(expiry_time(detail,ET),EXPIRY)
        with self.assertRaises(ValueError): expiry_time(detail)
        detail.tradingHours='20261116:1700-20261117:1200'
        with self.assertRaises(ValueError): expiry_time(detail,ET)

    def test_disconnect_invalidates_all_quote_timestamps(self):
        a=TWS.__new__(TWS); a.continuous=True; a.generation=0; a.quotes={101:{'ask_at':ENTRY}}
        a.quote_history = deque([(ENTRY, None, None)])
        a.disconnected()
        self.assertFalse(a.continuous); self.assertEqual(a.generation,1); self.assertEqual(a.quotes,{})
        self.assertFalse(a.quote_history)

    def test_failed_contract_restore_cannot_resume_stale_connection_state(self):
        a=TWS.__new__(TWS)
        a.continuous=True; a.generation=1; a.quotes={101:{'ask_at':ENTRY}}
        a.quote_history = deque([(ENTRY, None, None)])
        a.Contract=lambda **kw:N(**kw)
        a.ib=N(reqContractDetails=lambda c:[])
        with self.assertRaisesRegex(RecoveryError,'unavailable or ambiguous'):
            a.restore(self.p,self.record)
        self.assertFalse(a.continuous)
        self.assertEqual(a.quotes,{})
        self.assertFalse(a.quote_history)
        self.assertIsNone(a._coverage_generation)

    def test_pinned_ib_insync_connection_signature(self):
        from ib_insync import IB
        args=N(**vars(self.args),paper_execute=False,expiry_timezone='America/New_York',
               history_timezone='America/New_York',combo_tick='.25')
        with patch.object(IB,'connect',autospec=True,side_effect=ConnectionError('fixture')):
            with self.assertRaisesRegex(ConnectionError,'fixture'): TWS(args)

    def test_market_rule_premium_bands(self):
        rules=[N(lowEdge=0,increment=.05),N(lowEdge=5,increment=.1),
               N(lowEdge=20,increment=.25),N(lowEdge=100,increment=.5)]
        self.assertEqual(str(market_increment('70',rules)),'0.25')
        self.assertEqual(str(market_increment('110',rules)),'0.5')

    def test_recorded_nov19_quotes_pass_full_selection_with_legacy_quarter_hint(self):
        from ib_insync import Contract,ComboLeg
        clock=ENTRY+timedelta(days=3)
        rules=[N(lowEdge=0,increment=.05),N(lowEdge=5,increment=.1),
               N(lowEdge=20,increment=.25),N(lowEdge=100,increment=.5)]
        a=TWS.__new__(TWS); a.Contract=Contract; a.ComboLeg=ComboLeg
        a.quotes = {}; a.quote_history = deque()
        a.underlying_id=100; a.combo_tick=D('.25'); a.expiry_zone=ET
        future=Contract(conId=100,secType='FUT',symbol='ES',currency='USD',multiplier='50')
        details={right:N(contract=Contract(conId=cid,secType='FOP',symbol='ES',right=right,
                                           strike=7185,currency='USD',multiplier='50'),
                         underConId=100,realExpirationDate='20261120',lastTradeTime='16:00:00',
                         tradingHours='20261119:1700-20261120:1500',timeZoneId='America/Chicago',
                         validExchanges='CME',marketRuleIds='235')
                 for right,cid in (('C',101),('P',102))}
        a.ib=N(reqContractDetails=lambda c:[N(contract=future)] if c.conId==100 else [details[c.right]],
               reqTickers=lambda c:[N(marketDataType=1,time=clock,bid=7184.75,ask=7185.25)],
               reqSecDefOptParams=lambda *args:[N(underlyingConId='100',multiplier='50',
                   expirations=['20261120'],strikes=[7185],tradingClass='EW3')],
               reqMarketRule=lambda rid:rules,reqMktData=lambda c:None,sleep=lambda duration:None)
        a.quote=lambda c:Quote(D('50.50') if c.right=='C' else D('50.75'),
                               D('51.50') if c.right=='C' else D('51.25'),clock,clock)
        with patch('es_straddle.tws.now',return_value=clock):
            selected=a.select(clock)
        self.assertEqual((selected.entry_limit,selected.entry_tick),(D('102'),D('.5')))
        self.assertEqual(a.combo_tick,D('.25'))
        self.assertEqual(a.selection_report['entry_tick_source'],'IBKR_CME_MARKET_RULE')
        command=Engine(selected).step(Snapshot(clock))[0]
        self.assertEqual((command.action,command.quantity,D(command.price)),('SELL',10,D('102')))
        self.assertEqual(target_price(selected.entry_limit),D('88.25'))

    def test_market_midpoint_rounds_across_all_premium_bands_and_boundaries(self):
        rules=[N(lowEdge=0,increment=.05),N(lowEdge=5,increment=.1),
               N(lowEdge=20,increment=.25),N(lowEdge=100,increment=.5)]
        for raw,price,tick in [('4.925','4.95','.05'),('5.05','5.1','.1'),
                               ('19.95','20','.25'),('20.125','20.25','.25'),
                               ('99.875','100','.5'),('100.25','100.5','.5'),
                               ('102','102','.5')]:
            with self.subTest(raw=raw):
                value=D(raw)
                self.assertEqual(market_midpoint(value-D('.025'),value+D('.025'),rules),
                                 (D(price),D(tick)))

    def test_missing_or_inconsistent_market_grid_still_blocks_entry(self):
        for rules in ([],[N(lowEdge=0,increment=0)],
                      [N(lowEdge=0,increment=.25),N(lowEdge=100,increment=.3)]):
            with self.subTest(rules=rules):
                with self.assertRaises(ValueError): market_midpoint('99.95','99.97',rules)

    def test_half_point_entry_grid_and_limit_survive_restart_without_repricing(self):
        price,tick=market_midpoint('101.25','102.75',[N(lowEdge=0,increment=.25),N(lowEdge=100,increment=.5)])
        p=plan(entry_limit=price,entry_tick=tick)
        engine=Engine(p); command=engine.step(Snapshot(ENTRY))[0]
        record=new_record(p,engine,self.args,ENTRY); reserve(record,command,99)
        record['orders'][command.ref].update(status='Submitted',perm_id=900)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'session.json'; save(path,record)
            record,p=load_record(path,self.args)
        restarted=Engine(p,record['state'])
        pending=recovered_order(command.ref,record['orders'][command.ref],p)
        self.assertEqual(restarted.step(Snapshot(ENTRY+timedelta(hours=1),orders={command.ref:pending})),[])
        self.assertEqual((p.entry_limit,p.entry_tick),(D('102'),D('.5')))

    def test_invalid_target_tick_closes_without_repricing(self):
        self.filled()
        o=recovered_order(self.ref,self.saved,self.p)
        e=Engine(self.p,copy.deepcopy(self.record['state']))
        cmd=e.step(Snapshot(ENTRY,orders={self.ref:o},call_position=-10,put_position=-10,
                            target_price_valid=False))[0]
        self.assertEqual((cmd.order_type,cmd.reason),('MKT','TARGET_TICK_INVALID'))
        self.assertIsNone(e.state['target_ref'])

    def adapter(self, working=None, completed=None, fills=None, position=-10):
        a=TWS.__new__(TWS)
        a.record=self.record; a.args=N(history_days=1,history_all_clients_verified=True)
        a.account='DU_TEST'; a.client_id=1820; a.continuous=True; a.generation=0
        a.history_zone=ET; a.call=N(conId=101); a.put=N(conId=102)
        a.market_rules=[N(lowEdge=0,increment=.25)]
        a.details=[N(tradingHours='20261116:1700-20261117:1500',timeZoneId='US/Central')]*2
        a.quote=lambda c:None
        a.quotes = {}; a.quote_history = deque()
        a.ib=N(isConnected=lambda:True,reqOpenOrders=lambda:[],
               fills=lambda:[],
               reqAllOpenOrders=lambda:working or [],reqCompletedOrders=lambda **kw:completed or [],
               reqExecutions=lambda f:fills or [],reqPositions=lambda:[
                   N(account='DU_TEST',contract=N(conId=cid,symbol='ES'),position=position)
                   for cid in (101,102)])
        return a

    def test_tws_records_selected_quote_changes_between_reconciliation_polls(self):
        a = self.adapter()
        self.filled()
        call = N(contract=a.call, bid=20.0, ask=20.25, marketDataType=1)
        put = N(contract=a.put, bid=74.25, ask=140.0, marketDataType=1)
        for ticker in (call, put):
            ticker.ticks = [N(tickType=1), N(tickType=2)]
        a.ib.ticker = lambda contract: call if contract.conId == 101 else put
        a.quote = TWS.quote.__get__(a)
        for seconds, put_ask in ((0, 140.0), (1, 75.5), (3, 140.0)):
            put.ask = put_ask
            with patch('es_straddle.tws.now', return_value=ENTRY + timedelta(seconds=seconds)):
                a.ticks([call, put])
        with patch('es_straddle.tws.now', return_value=ENTRY + timedelta(seconds=3)):
            snapshot = a.snapshot(self.engine)
        self.assertEqual([record[2].ask for record in snapshot.quote_history],
                         [D('140'), D('75.5'), D('140')])
        self.assertIsNone(snapshot.confirmed_mayday(D('81.75')))

    def test_adapter_recovers_completed_order_using_fill_bound_perm_id(self):
        t=self.trade(orderId=0,clientId=0)
        t.order.orderRef=self.ref; t.order.filledQuantity=10
        t.orderStatus=N(status='Filled',filled=0)
        a=self.adapter(completed=[t],fills=[self.fill(),self.fill(102,eid='put',price=25.5)])
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertTrue(s.orders[self.ref].proven)
        self.assertEqual(s.orders[self.ref].filled,10)
        self.assertEqual(self.engine.step(s)[0].reason,'TARGET')

    def test_adapter_does_not_infer_zero_fill_from_completed_callback_defaults(self):
        t=self.trade(orderId=0,clientId=0)
        t.order.orderRef=self.ref; t.order.filledQuantity=4
        t.orderStatus=N(status='Cancelled',filled=0)
        a=self.adapter(completed=[t],fills=[self.fill(qty=4),self.fill(102,qty=4,eid='put')],position=-4)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertEqual(s.orders[self.ref].filled,4)
        self.assertEqual(self.engine.step(s)[0].quantity,4)

    def test_completed_zero_remaining_quantity_requires_full_execution_proof(self):
        t=self.trade(orderId=0,clientId=0,totalQuantity=0,outsideRth=False)
        t.order.orderRef=self.ref; t.order.filledQuantity=10
        t.orderStatus=N(status='Filled',filled=0)
        fills=[self.fill(),self.fill(102,eid='put',price=25.5)]
        a=self.adapter(completed=[t],fills=fills)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertTrue(s.orders[self.ref].proven)
        self.assertEqual(s.orders[self.ref].filled,10)
        current=self.record['orders'][self.ref]
        current['executions'].clear(); current.update(status='Submitted',filled='0')
        a=self.adapter(completed=[t],fills=[self.fill()])
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            with self.assertRaises(RecoveryError): a.snapshot(self.engine)

    def test_completed_canceled_remainder_requires_exact_partial_fill(self):
        t=self.trade(orderId=0,clientId=0,totalQuantity=9)
        t.contract=N(secType='BAG',symbol='ES',currency='USD',comboLegs=[
            N(conId=cid,ratio=1,action='BUY',exchange='CME') for cid in (101,102)])
        t.order.orderRef=self.ref; t.order.filledQuantity=1
        t.orderStatus=N(status='Cancelled',filled=0)
        fills=[self.fill(qty=1),self.fill(102,qty=1,eid='put')]
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            with self.assertRaises(RecoveryError):
                self.adapter(completed=[t],fills=fills[:1],position=-1).snapshot(self.engine)
            snap=self.adapter(completed=[t],fills=fills,position=-1).snapshot(self.engine)
        entry=snap.orders[self.ref]
        self.assertTrue(entry.proven)
        self.assertEqual((entry.status,entry.filled),('Cancelled',1))
        self.assertEqual(self.engine.step(snap)[0].quantity,1)

    def test_timeout_does_not_advance_durable_coverage(self):
        a=self.adapter()
        a.ib.reqPositions=lambda:(_ for _ in ()).throw(TimeoutError())
        before=copy.deepcopy(a.record)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            with self.assertRaises(TimeoutError): a.snapshot(self.engine)
        self.assertEqual(a.record,before)

    def test_disconnect_mid_snapshot_invalidates_results(self):
        a=self.adapter()
        def positions():
            a.generation+=1
            return []
        a.ib.reqPositions=positions
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertFalse(s.continuity)
        self.assertEqual(a.record['coverage_through'],ENTRY.isoformat())

    def test_missing_working_order_stays_unknown_after_restart(self):
        self.saved.update(status='Submitted',perm_id=90)
        a=self.adapter(position=0)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertNotIn(self.ref,s.orders)
        self.assertEqual(self.engine.step(s),[])
        self.assertEqual(self.engine.state['blocked'],'ENTRY_ACK_UNKNOWN')

    def test_completed_unknown_perm_id_not_adopted_by_ref_only(self):
        t=self.trade(orderId=0,clientId=0); t.order.orderRef=self.ref
        t.orderStatus=N(status='Cancelled',filled=0); t.order.filledQuantity=0
        a=self.adapter(completed=[t],position=0)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertNotIn(self.ref,s.orders)

    def test_foreign_working_order_is_never_canceled(self):
        t=self.trade(account='DU_TEST',clientId=0); t.order.orderRef='MANUAL'
        t.contract=N(conId=101,comboLegs=[],symbol='ES')
        a=self.adapter(working=[t])
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertTrue(s.foreign_activity)
        self.assertEqual(self.record['foreign_activity_source'], 'unreserved_open_order')
        self.assertEqual(self.engine.step(s),[])
        self.assertEqual(a.working,{})

    def test_repeated_callback_for_same_working_trade_does_not_block_target(self):
        # Replay the wrapper behavior: multiple openOrder callbacks append
        # the very same cached Trade, including during fills.
        trade = self.trade()
        trade.order.orderRef = self.ref
        trade.contract = self.manual_combo(ids=(101, 102)).contract
        trade.orderStatus = N(status='Filled', filled=10)
        fills = [self.fill(), self.fill(102, eid='put', price=25.5)]
        adapter = self.adapter(working=[trade, trade], fills=fills)
        with patch('es_straddle.tws.now', return_value=ENTRY + timedelta(seconds=2)):
            snapshot = adapter.snapshot(self.engine)
        self.assertFalse(snapshot.foreign_activity)
        self.assertEqual(adapter.working, {self.ref: trade})
        commands = self.engine.step(snapshot)
        self.assertEqual([(cmd.action, cmd.quantity, cmd.price, cmd.reason) for cmd in commands],
                         [('BUY', 10, '43.75', 'TARGET')])

    def test_distinct_working_trades_with_same_reference_still_block(self):
        trade = self.trade()
        trade.order.orderRef = self.ref
        trade.contract = self.manual_combo(ids=(101, 102)).contract
        other = copy.deepcopy(trade)
        other.order.orderId += 1
        other.order.permId += 1
        adapter = self.adapter(working=[trade, other], position=0)
        with patch('es_straddle.tws.now', return_value=ENTRY + timedelta(seconds=2)):
            snapshot = adapter.snapshot(self.engine)
        self.assertTrue(snapshot.foreign_activity)
        self.assertEqual(self.record['foreign_activity_source'], 'duplicate_order_ref')
        self.assertEqual(self.engine.step(snapshot), [])

    def test_partial_target_cancel_recovery_closes_only_seven(self):
        self.filled()
        entry=recovered_order(self.ref,self.saved,self.p)
        target=self.engine.step(Snapshot(ENTRY,orders={self.ref:entry},call_position=-10,put_position=-10))[0]
        reserve(self.record,target,10)
        self.record['state']=copy.deepcopy(self.engine.state)
        target_saved=self.record['orders'][target.ref]
        target_saved.update(status='Cancelled',filled='3',perm_id=91)
        fills=[]
        for cid,eid in ((101,'tc'),(102,'tp')):
            fills.append(self.fill(cid,qty=3,price=22,eid=eid,side='BOT',orderId=10,
                                   permId=91,orderRef=target.ref))
        a=self.adapter(fills=fills,position=-7)
        self.record['coverage_through']=(self.p.close_at-timedelta(seconds=5)).isoformat()
        restarted=Engine(self.p,copy.deepcopy(self.record['state']))
        with patch('es_straddle.tws.now',return_value=self.p.close_at):
            s=a.snapshot(restarted)
        cmd=restarted.step(s)[0]
        self.assertEqual((cmd.quantity,cmd.reason),(7,'EOD_1555_ET'))

    def manual_combo(self, ids=(201,202), **kw):
        trade=self.trade(clientId=0,orderId=19,permId=190,**kw)
        trade.order.orderRef='MANUAL'
        trade.contract=N(conId=0,secType='BAG',symbol='ES',currency='USD',
                         comboLegs=[N(conId=cid,ratio=1,action='BUY',exchange='CME') for cid in ids])
        return trade

    def manual_bag_fill(self, ids=(), **kw):
        fill=self.fill(0,clientId=0,orderId=19,permId=190,orderRef='MANUAL',**kw)
        fill.contract=N(conId=0,secType='BAG',symbol='ES',
                        comboLegs=[N(conId=cid) for cid in ids])
        return fill

    def test_separate_manual_es_positions_and_orders_allow_scheduled_entry(self):
        fresh=Engine(self.p)
        self.record=new_record(self.p,fresh,self.args,ENTRY)
        manual=self.manual_combo()
        future=self.manual_combo(); future.contract=N(conId=100,secType='FUT',symbol='ES',comboLegs=[])
        before=copy.deepcopy([manual,future])
        a=self.adapter(working=[manual,future],position=0)
        a.ib.reqPositions=lambda:[N(account='DU_TEST',contract=N(conId=cid,symbol='ES'),position=-2)
                                  for cid in (100,201,202)]
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            snap=a.snapshot(fresh)
        self.assertFalse(snap.foreign_activity)
        command=fresh.step(snap)[0]
        self.assertEqual((command.action,command.quantity,command.price),('SELL',10,str(self.p.entry_limit)))
        self.assertEqual(a.working,{})
        self.assertEqual([manual,future],before)

    def test_manual_position_in_selected_contract_still_blocks_entry(self):
        fresh=Engine(self.p)
        self.record=new_record(self.p,fresh,self.args,ENTRY)
        a=self.adapter(position=-2)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            snap=a.snapshot(fresh)
        self.assertEqual(fresh.step(snap),[])
        self.assertEqual(fresh.state['blocked'],'CONTRACTS_NOT_EXCLUSIVE')

    def test_overlapping_or_unidentified_manual_combo_order_still_blocks(self):
        for ids in ((101,202),()):
            with self.subTest(ids=ids):
                fresh=Engine(self.p)
                self.record=new_record(self.p,fresh,self.args,ENTRY)
                a=self.adapter(working=[self.manual_combo(ids)],position=0)
                with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
                    snap=a.snapshot(fresh)
                self.assertTrue(snap.foreign_activity)
                self.assertEqual(fresh.step(snap),[])
                self.assertEqual(a.working,{})

    def test_separate_manual_combo_fills_do_not_interrupt_owned_target(self):
        self.filled()
        manual=self.manual_combo()
        fills=[self.manual_bag_fill(),self.fill(201,clientId=0,orderRef='MANUAL'),
               self.fill(202,clientId=0,orderRef='MANUAL')]
        a=self.adapter(completed=[manual],fills=fills)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            snap=a.snapshot(self.engine)
        self.assertFalse(snap.foreign_activity)
        command=self.engine.step(snap)[0]
        self.assertEqual((command.reason,command.quantity,command.price),('TARGET',10,'43.75'))
        self.assertEqual(len(self.saved['executions']),2)
        self.assertNotIn('MANUAL',self.record['orders'])

    def test_manual_combo_membership_survives_journal_reload_without_completed_history(self):
        fill=self.manual_bag_fill()
        observe_fill(self.record,fill,self.p,'DU_TEST',1820,[self.manual_combo()])
        self.assertFalse(self.record['foreign_activity'])
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'session.json'; save(path,self.record)
            restored,p=load_record(path,self.args)
        observe_fill(restored,fill,p,'DU_TEST',1820)
        self.assertFalse(restored['foreign_activity'])
        self.assertEqual(restored['orders'][self.ref]['executions'],{})
        self.assertEqual(restored['observed_combo_contracts']['190']['leg_ids'],[201,202])

    def test_unknown_or_overlapping_manual_bag_fill_remains_foreign(self):
        for ids in ((),(101,202)):
            with self.subTest(ids=ids):
                record=copy.deepcopy(self.record)
                observe_fill(record,self.manual_bag_fill(ids),self.p,'DU_TEST',1820)
                self.assertTrue(record['foreign_activity'])

    def test_unrelated_order_identity_cannot_resolve_manual_combo(self):
        for field,value in (('permId',191),('account','DU_OTHER'),('orderRef','OTHER')):
            with self.subTest(field=field):
                record=copy.deepcopy(self.record)
                trade=self.manual_combo(); setattr(trade.order,field,value)
                observe_fill(record,self.manual_bag_fill(),self.p,'DU_TEST',1820,[trade])
                self.assertTrue(record['foreign_activity'])
                self.assertNotIn('observed_combo_contracts',record)

    def test_conflicting_direct_and_permanent_id_combo_legs_block(self):
        with self.assertRaisesRegex(RecoveryError,'Conflicting combo'):
            observe_fill(self.record,self.manual_bag_fill((101,102)),self.p,'DU_TEST',1820,
                         [self.manual_combo()])

    def test_cached_combo_membership_cannot_change_or_be_empty(self):
        fill=self.manual_bag_fill()
        observe_fill(self.record,fill,self.p,'DU_TEST',1820,[self.manual_combo()])
        with self.assertRaisesRegex(RecoveryError,'Conflicting combo'):
            observe_fill(self.record,fill,self.p,'DU_TEST',1820,[self.manual_combo((101,102))])
        self.record['observed_combo_contracts']['190']['leg_ids']=[]
        with self.assertRaisesRegex(RecoveryError,'Invalid observed combo'):
            observe_fill(self.record,fill,self.p,'DU_TEST',1820)

    def test_owned_bag_execution_still_requires_exact_contracts_and_quantity(self):
        fill=self.fill(0,price=50.5)
        fill.contract=N(conId=0,secType='BAG',symbol='ES',comboLegs=[])
        self.observe(fill)
        recovered=recovered_order(self.ref,self.saved,self.p)
        self.assertEqual((recovered.proven,recovered.filled,recovered.average),(True,10,50.5))
        fill.contract.comboLegs=[N(conId=201),N(conId=202)]
        with self.assertRaisesRegex(RecoveryError,'Owned execution combo'):
            self.observe(fill)

    def test_eod_with_separate_manual_positions_closes_only_owned_ten(self):
        self.filled()
        a=self.adapter(completed=[self.manual_combo()],fills=[self.manual_bag_fill()])
        a.args.history_days=7
        self.record['coverage_through']=(ENTRY+timedelta(seconds=2)).isoformat()
        a.ib.reqPositions=lambda:[N(account='DU_TEST',contract=N(conId=cid,symbol='ES'),position=qty)
                                  for cid,qty in ((101,-10),(102,-10),(201,-3),(202,-3))]
        with patch('es_straddle.tws.now',return_value=self.p.close_at):
            snap=a.snapshot(self.engine)
        command=self.engine.step(snap)[0]
        self.assertEqual((command.action,command.quantity,command.reason),('BUY',10,'EOD_1555_ET'))

    def test_rounded_entry_limit_stays_frozen_after_restart_and_quote_change(self):
        p=plan(entry_limit=midpoint('50','50.25','.25'),entry_tick=D('.25'))
        engine=Engine(p)
        command=engine.step(Snapshot(ENTRY))[0]
        record=new_record(p,engine,self.args,ENTRY)
        reserve(record,command,99)
        saved=record['orders'][command.ref]; saved.update(status='Submitted',perm_id=900)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'session.json'; save(path,record)
            record,p=load_record(path,self.args)
        restarted=Engine(p,record['state'])
        pending=recovered_order(command.ref,record['orders'][command.ref],p)
        self.assertEqual(restarted.step(Snapshot(ENTRY+timedelta(hours=2),orders={command.ref:pending})),[])
        self.assertEqual(restarted.state['entry_limit'],'50.25')
        self.assertNotEqual(midpoint('55','55.25','.25'),p.entry_limit)
        self.assertEqual(record['orders'][command.ref]['price'],'50.25')

    def test_seven_day_setting_does_not_prove_prior_day_history_was_downloaded(self):
        self.filled()
        self.record['coverage_through']=(ENTRY+timedelta(seconds=2)).isoformat()
        recent=self.fill(201,eid='recent',time=self.p.close_at-timedelta(seconds=2))
        a=self.adapter(fills=[recent]); a.args.history_days=7
        before=copy.deepcopy(self.record)
        with patch('es_straddle.tws.now',return_value=self.p.close_at):
            with self.assertRaisesRegex(RecoveryError,'HISTORY_DOWNLOAD_INCOMPLETE'):
                a.snapshot(self.engine)
        self.assertEqual(self.record,before)
        prior=self.fill(201,eid='prior',time=ENTRY-timedelta(minutes=1))
        a.ib.reqExecutions=lambda f:[prior,recent]
        with patch('es_straddle.tws.now',return_value=self.p.close_at):
            snapshot=a.snapshot(self.engine)
        self.assertEqual(self.engine.step(snapshot)[0].quantity,10)

    def test_another_accounts_old_execution_cannot_prove_history_download(self):
        a=self.adapter(fills=[self.fill(time=ENTRY-timedelta(minutes=1),acctNumber='DU_OTHER')])
        a.args.history_days=7
        with patch('es_straddle.tws.now',return_value=self.p.close_at):
            with self.assertRaisesRegex(RecoveryError,'HISTORY_DOWNLOAD_INCOMPLETE'):
                a.snapshot(self.engine)

    def test_recovered_full_target_fill_never_reverses(self):
        self.filled()
        entry=recovered_order(self.ref,self.saved,self.p)
        target=self.engine.step(Snapshot(ENTRY,orders={self.ref:entry},call_position=-10,put_position=-10))[0]
        reserve(self.record,target,10)
        self.record['state']=copy.deepcopy(self.engine.state)
        fills=[self.fill(cid,eid=eid,side='BOT',orderId=10,permId=91,orderRef=target.ref)
               for cid,eid in ((101,'tc'),(102,'tp'))]
        a=self.adapter(fills=fills,position=0)
        with patch('es_straddle.tws.now',return_value=ENTRY+timedelta(seconds=2)):
            s=a.snapshot(self.engine)
        self.assertEqual(self.engine.step(s),[])
        self.assertTrue(self.engine.state['done'])

    def test_held_flat_recovery_requires_fresh_fills_and_no_overlapping_working_order(self):
        self.filled()
        entry = recovered_order(self.ref, self.saved, self.p)
        target, = self.engine.step(Snapshot(ENTRY, orders={self.ref: entry},
                                            call_position=-10, put_position=-10))
        reserve(self.record, target, 10)
        self.record['state'] = copy.deepcopy(self.engine.state)
        self.record['foreign_activity'] = True
        entry_fills = [self.fill(), self.fill(102, eid='put', price=25.5)]
        exits = [self.fill(cid, eid=eid, side='BOT', orderId=10, permId=91, orderRef=target.ref)
                 for cid, eid in ((101, 'tc'), (102, 'tp'))]
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'session.json'
            save(path, self.record)
            with self.assertRaises(RecoveryError):
                load_record(path, self.args)
            self.record, plan = load_record(path, self.args, review_held=True)
        engine = Engine(plan, copy.deepcopy(self.record['state']))
        cases = [
            (entry_fills[:1] + exits, [], False),
            (entry_fills + exits, [self.manual_combo(ids=(101, 201))], False),
            (entry_fills + exits, [], True),
        ]
        with patch('es_straddle.tws.now', return_value=ENTRY + timedelta(seconds=2)):
            for fills, working, may_finish in cases:
                snap = self.adapter(fills=fills, working=working, position=0).snapshot(engine)
                self.assertEqual(snap.held_flat_evidence, may_finish)
                self.assertEqual(engine.step(snap), [])
                self.assertEqual(engine.state['done'], may_finish)
        self.assertTrue(self.record['foreign_activity'])

    def test_uninterrupted_midnight_retains_coverage_but_reconnect_does_not(self):
        before=ENTRY.replace(hour=23,minute=59,second=59)
        after=before+timedelta(seconds=2)
        a=self.adapter(position=0)
        with patch('es_straddle.tws.now',return_value=before): a.snapshot(self.engine)
        with patch('es_straddle.tws.now',return_value=after): a.snapshot(self.engine)
        self.assertEqual(self.record['coverage_through'],after.isoformat())
        self.record['coverage_through']=before.isoformat()
        a._coverage_checkpoint=before.isoformat()
        a.generation+=1
        with patch('es_straddle.tws.now',return_value=after):
            with self.assertRaisesRegex(RecoveryError,'HISTORY_COVERAGE_UNPROVEN'):
                a.snapshot(self.engine)


if __name__=='__main__': unittest.main()
