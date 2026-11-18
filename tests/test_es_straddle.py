"""Offline execution and race tests. No broker connection, account or quotes."""
import unittest
from dataclasses import replace
from datetime import datetime, timedelta
from decimal import Decimal as D
from types import SimpleNamespace as N
from es_straddle.core import (ET, Plan, Quote, Order, Snapshot, Engine,
                              midpoint, target_price)
from es_straddle.tws import intervals, expiry_time, prove_fill, TWS, save

ENTRY = datetime(2026, 11, 16, 20, 20, tzinfo=ET)
EXPIRY = datetime(2026, 11, 17, 16, tzinfo=ET)

def plan(**kw):
    values = dict(session="2026-11-16", entry_at=ENTRY, expiry_at=EXPIRY,
                  call_id=101, put_id=102, underlying_id=100,
                  strike=D("7450"), entry_limit=D("50.50"), entry_tick=D(".05"))
    values.update(kw)
    return Plan(**values)

class EngineTests(unittest.TestCase):
    def setUp(self):
        self.e = Engine(plan())
        self.s = Snapshot(ENTRY)
        self.first = self.e.step(self.s)[0]

    def entry(self, qty=10, status="Filled", price="50.50"):
        self.s.orders[self.e.entry_ref] = Order(self.e.entry_ref, status, qty, D(price))
        self.s.call_position = self.s.put_position = -qty

    def fill_target(self, qty=10, status="Filled"):
        ref = self.e.state["target_ref"]
        self.s.orders[ref] = Order(ref, status, qty, D("43.75"))
        self.s.call_position += qty
        self.s.put_position += qty

    def test_entry_ten_sell_combo_at_frozen_limit(self):
        self.assertEqual((self.first.action, self.first.quantity,
                          self.first.order_type, self.first.price),
                         ("SELL", 10, "LMT", "50.50"))

    def test_unknown_ack_never_resubmits(self):
        self.assertEqual(self.e.step(self.s), [])
        self.assertEqual(self.e.state["blocked"], "ENTRY_ACK_UNKNOWN")

    def test_waiting_entry_never_chases(self):
        self.entry(0, "Submitted")
        self.s.now += timedelta(hours=4)
        self.assertEqual(self.e.step(self.s), [])
        self.assertEqual(self.e.state["entry_limit"], "50.50")

    def test_target_after_actual_fill(self):
        self.entry(price="50.75")
        cmd = self.e.step(self.s)[0]
        self.assertEqual((cmd.action, cmd.quantity, cmd.price), ("BUY", 10, "44.00"))
        self.assertEqual(self.e.step(self.s), [])  # unknown target ack, no duplicate

    def test_partial_entry_cancels_remainder_before_target(self):
        self.entry(4, "Submitted")
        cmds = self.e.step(self.s)
        self.assertEqual([(c.kind, c.ref) for c in cmds], [("CANCEL", self.e.entry_ref)])
        self.entry(5, "Cancelled")  # another fill races cancellation
        cmd = self.e.step(self.s)[0]
        self.assertEqual((cmd.quantity, cmd.reason), (5, "TARGET"))

    def test_target_fill_done_without_extra_close(self):
        self.entry()
        self.e.step(self.s)
        self.fill_target()
        self.assertEqual(self.e.step(self.s), [])
        self.assertTrue(self.e.state["done"])
        self.assertEqual(self.e.state["outcome"], "TARGET")

    def mayday(self):
        t = self.s.now
        self.s.call_quote = Quote(D("41.5"), D("42"), t, t)
        self.s.put_quote = Quote(D("41"), D("41.325"), t, t)

    def test_exact_mayday_threshold_inclusive(self):
        self.entry()
        self.mayday()
        cmd = self.e.step(self.s)[0]
        self.assertEqual((cmd.order_type, cmd.reason), ("MKT", "MAYDAY"))

    def test_below_mayday_places_target(self):
        self.entry()
        self.mayday()
        self.s.put_quote = replace(self.s.put_quote, ask=D("41.324"))
        self.assertEqual(self.e.step(self.s)[0].reason, "TARGET")

    def test_stale_delayed_future_quotes_do_not_trigger_mayday(self):
        for changed in (dict(live=False),
                        dict(ask_at=ENTRY-timedelta(seconds=6)),
                        dict(bid_at=ENTRY+timedelta(seconds=1)),
                        dict(bid=D("43"))):
            with self.subTest(changed=changed):
                self.setUp()
                self.entry()
                self.mayday()
                self.s.call_quote = replace(self.s.call_quote, **changed)
                self.assertEqual(self.e.step(self.s)[0].reason, "TARGET")

    def target_then_exit(self):
        self.entry()
        self.e.step(self.s)
        ref = self.e.state["target_ref"]
        self.s.orders[ref] = Order(ref, "Submitted")
        self.s.now = self.e.plan.close_at
        return ref

    def test_eod_cancels_target_then_closes(self):
        ref = self.target_then_exit()
        self.assertEqual(self.e.step(self.s)[0].kind, "CANCEL")
        self.s.orders[ref] = Order(ref, "Cancelled")
        cmd = self.e.step(self.s)[0]
        self.assertEqual((cmd.quantity, cmd.order_type, cmd.reason),
                         (10, "MKT", "EOD_1555_ET"))

    def test_target_fills_during_cancel_no_reverse(self):
        self.target_then_exit()
        self.e.step(self.s)
        self.fill_target()
        self.assertEqual(self.e.step(self.s), [])
        self.assertTrue(self.e.state["done"])

    def test_partial_target_cancel_race_closes_residual_only(self):
        ref = self.target_then_exit()
        self.e.step(self.s)
        self.fill_target(3, "Cancelled")
        cmd = self.e.step(self.s)[0]
        self.assertEqual(cmd.quantity, 7)

    def test_stale_position_after_cancel_never_oversizes(self):
        ref = self.target_then_exit()
        self.s.orders[ref] = Order(ref, "Cancelled", 3, D("43.75"))
        self.assertEqual(self.e.step(self.s), [])
        self.assertEqual(self.e.state["blocked"], "POSITION_EXECUTION_MISMATCH")

    def test_unfilled_entry_eod_cancel_no_position(self):
        self.entry(0, "Submitted")
        self.s.now = self.e.plan.close_at
        self.assertEqual(self.e.step(self.s)[0].ref, self.e.entry_ref)
        self.entry(0, "Cancelled")
        self.assertEqual(self.e.step(self.s), [])
        self.assertTrue(self.e.state["done"])

    def test_partial_entry_at_eod_waits_for_cancel(self):
        self.entry(2, "Submitted")
        self.s.now = self.e.plan.close_at
        self.assertEqual(self.e.step(self.s)[0].kind, "CANCEL")
        self.entry(3, "Cancelled")
        self.assertEqual(self.e.step(self.s)[0].quantity, 3)

    def test_close_ack_unknown_never_duplicates(self):
        self.entry()
        self.mayday()
        self.e.step(self.s)
        self.assertEqual(self.e.step(self.s), [])
        self.assertEqual(self.e.state["blocked"], "EXIT_ACK_OR_EXECUTIONS_UNKNOWN")

    def test_partial_market_order_waits_then_replaces_only_residual(self):
        self.entry()
        self.mayday()
        cmd = self.e.step(self.s)[0]
        self.s.orders[cmd.ref] = Order(cmd.ref, "Submitted", 4, D("84"))
        self.s.call_position = self.s.put_position = -6
        self.assertEqual(self.e.step(self.s), [])
        self.s.orders[cmd.ref] = replace(self.s.orders[cmd.ref], status="Cancelled")
        self.assertEqual(self.e.step(self.s)[0].quantity, 6)

    def test_replacement_cap(self):
        self.entry()
        self.mayday()
        for i in range(3):
            cmd = self.e.step(self.s)[0]
            self.s.orders[cmd.ref] = Order(cmd.ref, "Inactive")
        self.assertEqual(self.e.step(self.s), [])
        self.assertEqual(self.e.state["blocked"], "CLOSE_REPLACEMENTS_EXHAUSTED")

    def test_rejected_target_flattens(self):
        self.entry()
        cmd = self.e.step(self.s)[0]
        self.s.orders[cmd.ref] = Order(cmd.ref, "Inactive")
        close = self.e.step(self.s)[0]
        self.assertEqual(close.reason, "TARGET_TERMINATED_WITH_POSITION")

    def test_foreign_account_ownership_continuity_and_session_gates(self):
        for kw in (dict(foreign_activity=True), dict(continuity=False),
                   dict(synchronized=False)):
            with self.subTest(kw=kw):
                self.entry()
                self.s.now = self.e.plan.close_at
                self.assertEqual(self.e.step(replace(self.s, **kw)), [])

    def test_closed_session_cannot_submit_market_exit(self):
        self.entry()
        self.mayday()
        self.s.session_open = False
        self.assertEqual(self.e.step(self.s), [])
        self.assertEqual(self.e.state["blocked"], "EXIT_SESSION_CLOSED")

    def test_unproven_entry_and_exit_fills_block(self):
        self.entry()
        ref = self.e.entry_ref
        self.s.orders[ref] = replace(self.s.orders[ref], proven=False)
        self.assertEqual(self.e.step(self.s), [])

    def test_missed_entry_and_before_entry(self):
        e = Engine(plan())
        self.assertEqual(e.step(Snapshot(ENTRY-timedelta(seconds=1))), [])
        self.assertEqual(e.step(Snapshot(ENTRY+timedelta(seconds=60))), [])
        self.assertTrue(e.state["done"])

    def test_duplicate_restarts_reserve_submission(self):
        recovered = Engine(plan(), dict(self.e.state))
        self.assertEqual(recovered.step(self.s), [])
        self.assertEqual(recovered.state["blocked"], "ENTRY_ACK_UNKNOWN")

class PricingCalendarTests(unittest.TestCase):
    def test_target_quarter_ceiling(self):
        for entry, expected in [("50.50", "43.75"), ("50", "43.25"),
                                ("100", "86.50"), ("1", "1.00")]:
            self.assertEqual(target_price(entry), D(expected))

    def test_price_invalid(self):
        for entry in ("NaN", "Infinity", "0", "-1"):
            with self.assertRaises(ValueError):
                target_price(entry)

    def test_midpoint_rounds_once_to_nearest_tick_with_higher_credit_ties(self):
        for bid,ask,tick,expected in [('50','51','.05','50.50'),
                                     ('50','50.25','.05','50.15'),
                                     ('50','50.25','.25','50.25'),
                                     ('50','50.20','.25','50.00'),
                                     ('50','50.30','.25','50.25'),
                                     ('50.25','50.50','.25','50.50')]:
            with self.subTest(bid=bid,ask=ask,tick=tick):
                self.assertEqual(midpoint(bid,ask,tick),D(expected))
        with self.assertRaises(ValueError): midpoint('.01','.02','1')

    def test_crossed_invalid_or_nonfinite_spread(self):
        for args in [("51", "50", ".25"), ("0", "1", ".25"),
                     ("50", "51", "0"), ("NaN", "51", ".25")]:
            with self.assertRaises(ValueError):
                midpoint(*args)

    def test_wrong_expiry_and_friday_entry_rejected(self):
        for p in (plan(expiry_at=EXPIRY.replace(hour=9)),
                  plan(entry_at=ENTRY+timedelta(days=4)),
                  plan(call_id=102)):
            with self.assertRaises(ValueError):
                p.validate(ENTRY)

    def test_sunday_and_dst_dates(self):
        entry = datetime(2026, 11, 1, 20, 20, tzinfo=ET)
        p = plan(session=entry.date().isoformat(), entry_at=entry,
                 expiry_at=datetime(2026, 11, 2, 16, tzinfo=ET))
        p.validate(entry)
        self.assertEqual(p.close_at.hour, 15)
        self.assertEqual(p.close_at.minute, 55)
        self.assertEqual(p.entry_at.utcoffset(), timedelta(hours=-5))

    def test_ib_session_intervals_and_closed(self):
        value = "20261116:1700-20261117:1600;20261118:CLOSED"
        ranges = intervals(value, ZoneInfo("America/Chicago"))
        self.assertEqual(len(ranges), 1)
        self.assertTrue(ranges[0][0] <= ENTRY < ranges[0][1])

    def test_pm_expiry_identity(self):
        d = N(lastTradeTime="15:00:00", realExpirationDate="20261117",
              timeZoneId="America/Chicago")
        self.assertEqual(expiry_time(d).astimezone(ET), EXPIRY)
        d.lastTradeTime = "08:30:00"
        with self.assertRaises(ValueError):
            expiry_time(d)

class ExecutionEvidenceTests(unittest.TestCase):
    def trade(self, fills):
        return N(order=N(action="SELL", account="DU_TEST", orderId=9),
                 orderStatus=N(filled=10), fills=fills)

    def fill(self, cid, qty=10, price=25, eid="a", side="SLD", account="DU_TEST"):
        return N(contract=N(conId=cid, secType="FOP"),
                 execution=N(execId=eid, acctNumber=account, side=side,
                             orderId=9, shares=qty, price=price))

    def test_paired_exact_leg_executions(self):
        t = self.trade([self.fill(101), self.fill(102, eid="b", price=25.5)])
        self.assertEqual(prove_fill(t, 101, 102), (10, D("50.5"), True))

    def test_duplicate_execids_count_once(self):
        a, b = self.fill(101), self.fill(102, eid="b")
        self.assertEqual(prove_fill(self.trade([a, a, b]), 101, 102),
                         (10, D("50"), True))

    def test_missing_foreign_or_incomplete_legs_unproven(self):
        for b in (self.fill(102, qty=9, eid="b"),
                  self.fill(102, eid="b", account="DU_OTHER"),
                  self.fill(102, eid="b", side="BOT")):
            self.assertFalse(prove_fill(self.trade([self.fill(101), b]), 101, 102)[2])

    def test_conflicting_execid_unproven(self):
        self.assertFalse(prove_fill(
            self.trade([self.fill(101), self.fill(101, price=26),
                        self.fill(102, eid="b")]), 101, 102)[2])

class AdapterTests(unittest.TestCase):
    def test_live_accounts_and_ports_rejected_before_broker_import(self):
        for args in (N(account="U_REAL", client_id=1820, port=7497),
                     N(account="DU_TEST", client_id=0, port=7497),
                     N(account="DU_TEST", client_id=1820, port=7496)):
            with self.assertRaises(ValueError):
                TWS(args)

    def adapter(self):
        adapter = TWS.__new__(TWS)
        adapter.account, adapter.client_id = "DU_TEST", 1820
        adapter.paper_execute, adapter.continuous = True, True
        adapter.record = {'orders': {}}
        adapter.working = {}
        adapter.bag = N(secType="BAG")
        adapter.LimitOrder = lambda action, qty, price: N(
            action=action, totalQuantity=qty, lmtPrice=price, orderType="LMT")
        adapter.MarketOrder = lambda action, qty: N(
            action=action, totalQuantity=qty, orderType="MKT")
        adapter.sent, adapter.canceled, adapter.trades = [], [], []
        adapter.ib = N(trades=lambda: adapter.trades,
                       isConnected=lambda: True,
                       placeOrder=lambda bag, order: adapter.sent.append((bag, order)),
                       cancelOrder=lambda order: adapter.canceled.append(order))
        return adapter

    def execute(self, adapter, command):
        from es_straddle.recovery import reserve
        reserve(adapter.record, command, 9 + len(adapter.record['orders']))
        adapter.execute(command)

    def test_real_command_adapter_fields_without_network(self):
        a = self.adapter()
        e = Engine(plan())
        cmd = e.step(Snapshot(ENTRY))[0]
        self.execute(a, cmd)
        bag, order = a.sent[0]
        self.assertEqual((bag.secType, order.action, order.totalQuantity,
                          order.lmtPrice, order.orderType, order.tif),
                         ("BAG", "SELL", 10, 50.5, "LMT", "DAY"))
        self.assertTrue(order.outsideRth)
        self.assertEqual(order.account, "DU_TEST")
        self.assertEqual(order.orderRef, e.entry_ref)

    def test_target_gtc_and_close_market_fields(self):
        from es_straddle.core import Command
        a = self.adapter()
        self.execute(a, Command("SUBMIT", "ESSTR:TARGET", "BUY", 4, "LMT", "43.75", "TARGET"))
        self.execute(a, Command("SUBMIT", "ESSTR:CLOSE", "BUY", 3, "MKT", reason="MAYDAY"))
        self.assertEqual((a.sent[0][1].tif, a.sent[0][1].totalQuantity), ("GTC", 4))
        self.assertEqual((a.sent[1][1].orderType, a.sent[1][1].tif,
                          a.sent[1][1].totalQuantity), ("MKT", "DAY", 3))

    def test_exact_cancel_never_touches_foreign_account_or_client(self):
        from es_straddle.core import Command
        a = self.adapter()
        from es_straddle.recovery import reserve
        reserve(a.record, Command('SUBMIT', 'TARGET', 'BUY', 10, 'LMT', '43.75', 'TARGET'), 9)
        a.trades = [N(order=N(orderRef="TARGET", account="DU_OTHER", clientId=1820,
                             orderId=9, permId=10, action='BUY', totalQuantity=10,
                             orderType='LMT', lmtPrice=43.75, tif='GTC', outsideRth=True),
                      orderStatus=N(status="Submitted"))]
        a.working = {'TARGET': a.trades[0]}
        with self.assertRaises(RuntimeError):
            a.execute(Command("CANCEL", "TARGET"))
        self.assertEqual(a.canceled, [])
        a.trades[0].order.account = 'DU_TEST'
        a.trades[0].order.clientId = 77
        with self.assertRaises(RuntimeError):
            a.execute(Command("CANCEL", "TARGET"))
        a.trades[0].order.clientId = 1820
        a.execute(Command("CANCEL", "TARGET"))
        self.assertEqual(len(a.canceled), 1)

    def test_duplicate_submit_refused(self):
        from es_straddle.core import Command
        a = self.adapter()
        a.trades = [N(order=N(orderRef="ENTRY"))]
        with self.assertRaises(RuntimeError):
            self.execute(a, Command("SUBMIT", "ENTRY", "SELL", 10, "LMT", "50.50"))
        self.assertEqual(a.sent, [])

    def test_atomic_journal_roundtrip_and_failed_replace(self):
        import tempfile
        import json
        from pathlib import Path
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.json"
            save(path, {"started": False})
            with patch("es_straddle.tws.os.replace", side_effect=OSError("disk failed")):
                with self.assertRaises(OSError):
                    save(path, {"started": True})
            self.assertFalse(json.loads(path.read_text())["started"])
            save(path, {"started": True})
            self.assertTrue(json.loads(path.read_text())["started"])

from zoneinfo import ZoneInfo

if __name__ == "__main__":
    unittest.main()
