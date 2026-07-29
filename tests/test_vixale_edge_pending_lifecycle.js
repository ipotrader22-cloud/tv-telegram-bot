'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const pine = fs.readFileSync(
  path.join(root, 'pine', 'Vixale_Edge_Limit_Pullback_v1_1.pine'),
  'utf8'
);

class EdgeLifecycle {
  constructor() {
    this.pending = new Map();
    this.open = new Map();
    this.closed = [];
    this.bridge = [];
    this.alerts = [];
    this.targetWorking = false;
  }

  flip({ rth, beforeClose, setupId, side }) {
    if (!rth || !beforeClose || this.open.size) return;
    this.pending.set(setupId, side);
    this.alerts.push(['PENDING_SETUP', setupId]);
  }

  cancel(setupId, reason) {
    if (this.pending.delete(setupId)) this.alerts.push(['CANCEL', setupId, reason]);
  }

  submit(setupId) {
    assert(this.pending.has(setupId));
    this.bridge.push(['SETUP', setupId]);
  }

  fill(setupId) {
    const side = this.pending.get(setupId);
    if (!side) return;
    this.pending.delete(setupId);
    this.open.set(setupId, side);
    this.targetWorking = true;
    this.alerts.push(['OPEN', setupId]);
  }

  eod() {
    for (const setupId of [...this.pending.keys()]) {
      this.cancel(setupId, 'UNFILLED_BY_MARKET_CLOSE');
    }
  }
}

const first = 'VIXALE_EDGE:AAPL:60:LONG:1785254400000';
const second = 'VIXALE_EDGE:AAPL:60:SHORT:1785258000000';
const sim = new EdgeLifecycle();

sim.flip({ rth: true, beforeClose: true, setupId: first, side: 'LONG' });
sim.flip({ rth: false, beforeClose: true, setupId: second, side: 'SHORT' });
assert.deepStrictEqual(sim.alerts, [['PENDING_SETUP', first]], 'RTH emits one pending; overnight emits none');

sim.eod();
assert.strictEqual(sim.pending.size, 0, 'EOD clears unfilled pending');
assert.strictEqual(
  sim.alerts.filter(([event]) => event === 'CANCEL').length,
  1,
  'EOD emits exactly one cancel'
);
sim.eod();
assert.strictEqual(sim.alerts.length, 2, 'cleared pending does not reappear next day');
assert.strictEqual(sim.closed.length, 0, 'pending cancel creates no closed trade');

sim.flip({ rth: true, beforeClose: true, setupId: second, side: 'SHORT' });
sim.submit(second);
assert.strictEqual(sim.pending.has(second), true, 'SETUP submission preserves Pending');
sim.fill(second);
sim.fill(second);
assert.strictEqual(sim.pending.has(second), false, 'ENTRY_FILL removes exact Pending');
assert.strictEqual(sim.open.size, 1, 'ENTRY_FILL creates Open once');
assert.strictEqual(sim.alerts.filter(([event]) => event === 'OPEN').length, 1, 'OPEN publishes once');
sim.eod();
assert.strictEqual(sim.open.size, 1, 'open Edge position remains open at EOD');
assert.strictEqual(sim.targetWorking, true, 'open Edge ATR target remains working');

class EdgeCloseTiming {
  constructor() {
    this.alerts = [];
    this.pending = [];
    this.targetWorking = true;
    this.queued = null;
    this.testerFills = [];
  }

  stop({ setupId, barTime, atRthClose }) {
    if (!atRthClose) {
      this.alerts.push(['CLOSE_STOP', setupId, 'IMMEDIATE_RTH']);
      this.testerFills.push('signal-bar');
      return;
    }
    const key = `${setupId}:${barTime}`;
    if (this.queued?.key === key) return;
    this.queued = { key, setupId, barTime };
    this.alerts.push(['CLOSE_STOP', setupId, 'NEXT_RTH_OPEN']);
  }

  nextConfirmedRthOpen() {
    if (!this.queued) return;
    this.testerFills.push('next-rth-open');
    this.queued = null;
  }
}

const closeTiming = new EdgeCloseTiming();
closeTiming.stop({ setupId: second, barTime: 1785260700000, atRthClose: false });
closeTiming.stop({ setupId: second, barTime: 1785261600000, atRthClose: true });
closeTiming.stop({ setupId: second, barTime: 1785261600000, atRthClose: true });
assert.deepStrictEqual(
  closeTiming.alerts,
  [
    ['CLOSE_STOP', second, 'IMMEDIATE_RTH'],
    ['CLOSE_STOP', second, 'NEXT_RTH_OPEN'],
  ],
  'pre-close is immediate and the closing bar queues exactly once per setup/bar'
);
assert.strictEqual(closeTiming.pending.length, 0, 'closing-bar stop creates no opposite pending setup');
assert.strictEqual(closeTiming.targetWorking, true, 'closing-bar queue leaves target working overnight');
assert.deepStrictEqual(closeTiming.testerFills, ['signal-bar'], 'queued close does not fill at prior close');
closeTiming.nextConfirmedRthOpen();
assert.deepStrictEqual(
  closeTiming.testerFills,
  ['signal-bar', 'next-rth-open'],
  'queued tester close fills at the next regular-session open'
);

assert.match(app, /PENDING_SETUP: 'PENDING_SETUP'/, 'app recognizes PENDING_SETUP');
assert.match(app, /event === 'PENDING_SETUP' \|\| isVixaleEdgePendingCancel\(row\)/, 'pending events cannot reach bridge');
assert.match(app, /row\.setup_id \|\| row\.trade_id/, 'fill prefers exact setup_id');
assert.match(app, /raw\.startsWith\('VIXALE_EDGE:'\)\) return raw/, 'setup_id matching remains exact');
assert.match(app, /event === 'SETUP'[\s\S]{0,160}row\.setup_id[\s\S]{0,160}isVixaleEdgePendingLifecycleRow/, 'identified SETUP is execution-first');
assert.match(app, /\['SHREK', 'SHREK_1_4'\]/, 'Prime/Shrek lifecycle guard remains present');
assert.match(app, /if \(\['SETUP', 'FILL', 'TP', 'SL', 'EOD', 'EXTERNAL_CLOSE'\]\.includes\(event\)\)/, 'legacy Edge SETUP remains recognized without setup_id');
assert.match(app, /Stop Loss: <b>confirmed opposite signal<\/b>/, 'pending setup describes the confirmed opposite-signal stop');
assert.doesNotMatch(app, /Stop Loss Ref: <b>\$\{row\.stop\}<\/b>/, 'pending setup does not expose the numeric stop reference');

assert.match(pine, /strategy\("Vixale Edge 1\.1"/);
assert.match(pine, /default_qty_type=strategy\.percent_of_equity/);
assert.match(pine, /default_qty_value=2/);
assert.match(pine, /pyramiding=0/);
assert.match(pine, /stAtrPeriod = input\.int\(\s*10,/);
assert.match(pine, /stFactor = input\.float\(\s*3\.0,/);
assert.match(pine, /options=\["Flip Close", "Broken STL"\]/);
assert.match(pine, /request\.security\([\s\S]*?"60"[\s\S]*?request\.security\([\s\S]*?"240"/);
assert.match(pine, /payload_version\\":2/);
assert.match(pine, /system_id\\":\\"VIXALE_EDGE/);
assert.match(pine, /eod_policy\\":\\"NO_EOD_CLOSE/);
assert.match(pine, /target_tif\\":\\"GTC/);
assert.match(pine, /process_orders_on_close=false/);
assert.match(pine, /closeExecutionPolicy[\s\S]*?"NEXT_RTH_OPEN"[\s\S]*?"IMMEDIATE_RTH"/);
assert.match(pine, /signal_at_rth_close\\":/);
assert.match(pine, /signal_session_date\\":\\"/);
assert.match(pine, /signal_bar_time\\":/);
assert.match(pine, /STOP_LOSS_SIGNAL_AT_RTH_CLOSE/);
assert.match(pine, /queuedCloseIsNew[\s\S]*?lastQueuedCloseSetupId[\s\S]*?lastQueuedCloseSignalBarTime/);
assert.match(
  pine,
  /strategy\.close\(\s*queuedLongClose \? "Long Limit" : "Short Limit",\s*comment="Stop Loss next RTH open"\)/
);
const queuedPineSection = pine.slice(
  pine.indexOf('// Confirmed 16:00 ET closing-bar Stop Loss signal'),
  pine.indexOf('// Working Resting LIMIT Order')
);
assert.doesNotMatch(queuedPineSection, /strategy\.cancel/, 'closing-bar signal does not cancel the active target');
assert.match(queuedPineSection, /activeSetupId/, 'closing-bar signal retains the active setup_id');
assert.doesNotMatch(queuedPineSection, /PENDING_SETUP/, 'closing-bar signal creates no opposite pending setup');
assert.match(pine, /comment="Stop Loss",\s*immediately=true/);
assert.match(
  pine,
  /useAtrTarget and \(_event == "SETUP" or _event == "PENDING_SETUP" or _event == "CANCEL"\)/
);
assert.match(pine, /UNFILLED_BY_MARKET_CLOSE/);
assert.match(pine, /REPLACED_BY_OPPOSITE_RTH_SIGNAL/);
assert.match(pine, /table\.cell\(statusTable, 0, 5, "ENTRY FLIP CLOSE"\)/);
assert.doesNotMatch(pine, /table\.cell\(statusTable, 0, 5, "STOP LOSS REF"\)/);
assert.doesNotMatch(pine, /strategy\.close_all|closeEod|newNyDay/);

console.log('Vixale Edge pending/next-RTH lifecycle simulation: focused checks passed');
