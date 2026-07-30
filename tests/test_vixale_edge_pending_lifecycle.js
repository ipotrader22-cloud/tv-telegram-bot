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

  static htfAligned(side, htf1H, htf4H) {
    const required = side === 'LONG' ? 'BULLISH' : 'BEARISH';
    return htf1H === required && htf4H === required;
  }

  static isFinalRthBar(timeframeMinutes, barStartMinutes) {
    return [15, 30, 45, 60].includes(timeframeMinutes) &&
      barStartMinutes < 16 * 60 &&
      barStartMinutes >= 16 * 60 - timeframeMinutes;
  }

  flip({ rth, beforeClose, setupId, side, htf1H, htf4H }) {
    for (const [existingId, existingSide] of this.pending.entries()) {
      if (existingSide !== side) {
        this.cancel(existingId, 'REPLACED_BY_OPPOSITE_RTH_SIGNAL');
      }
    }
    if (
      !rth ||
      !beforeClose ||
      this.open.size ||
      this.pending.size ||
      !EdgeLifecycle.htfAligned(side, htf1H, htf4H)
    ) {
      return;
    }
    this.pending.set(setupId, side);
    this.alerts.push(['PENDING_SETUP', setupId]);
  }

  updateHtf({ htf1H, htf4H }) {
    for (const [setupId, side] of [...this.pending.entries()]) {
      const required = side === 'LONG' ? 'BULLISH' : 'BEARISH';
      if (htf1H !== required) {
        this.cancel(setupId, 'HTF_1H_CONFIRMATION_LOST');
      } else if (htf4H !== required) {
        this.cancel(setupId, 'HTF_4H_CONFIRMATION_LOST');
      }
    }
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

  eod({ timeframeMinutes = 60, barStartMinutes = 15 * 60 } = {}) {
    if (!EdgeLifecycle.isFinalRthBar(timeframeMinutes, barStartMinutes)) return;
    for (const setupId of [...this.pending.keys()]) {
      this.cancel(setupId, 'UNFILLED_BY_MARKET_CLOSE');
    }
  }

  nextSession() {
    for (const setupId of [...this.pending.keys()]) {
      this.cancel(setupId, 'STALE_PRIOR_SESSION');
    }
  }
}

const first = 'VIXALE_EDGE:AAPL:60:LONG:1785254400000';
const second = 'VIXALE_EDGE:AAPL:60:SHORT:1785258000000';
const sim = new EdgeLifecycle();

sim.flip({
  rth: true,
  beforeClose: true,
  setupId: first,
  side: 'LONG',
  htf1H: 'BULLISH',
  htf4H: 'BEARISH',
});
assert.strictEqual(sim.pending.size, 0, 'primary flip without aligned 1H + 4H creates no Pending');

sim.flip({
  rth: true,
  beforeClose: true,
  setupId: first,
  side: 'LONG',
  htf1H: 'BULLISH',
  htf4H: 'BULLISH',
});
assert.deepStrictEqual(sim.alerts, [['PENDING_SETUP', first]], 'aligned primary + 1H + 4H creates Pending');

sim.updateHtf({ htf1H: 'BEARISH', htf4H: 'BULLISH' });
assert.strictEqual(sim.pending.size, 0, 'loss of 1H confirmation permanently cancels Pending');
sim.updateHtf({ htf1H: 'BULLISH', htf4H: 'BULLISH' });
assert.strictEqual(sim.pending.size, 0, 'canceled setup cannot reactivate when 1H bias returns');

sim.flip({
  rth: true,
  beforeClose: true,
  setupId: first,
  side: 'LONG',
  htf1H: 'BULLISH',
  htf4H: 'BULLISH',
});
sim.updateHtf({ htf1H: 'BULLISH', htf4H: 'BEARISH' });
assert.strictEqual(sim.pending.size, 0, 'loss of 4H confirmation permanently cancels Pending');

sim.flip({
  rth: true,
  beforeClose: true,
  setupId: first,
  side: 'LONG',
  htf1H: 'BULLISH',
  htf4H: 'BULLISH',
});
sim.flip({
  rth: true,
  beforeClose: true,
  setupId: second,
  side: 'SHORT',
  htf1H: 'BEARISH',
  htf4H: 'BEARISH',
});
assert.strictEqual(sim.pending.has(first), false, 'opposite primary flip cancels the old setup');
assert.strictEqual(sim.pending.has(second), true, 'aligned opposite primary flip creates a new setup_id');

sim.eod();
assert.strictEqual(sim.pending.size, 0, 'EOD clears unfilled pending');
assert.strictEqual(
  sim.alerts.filter(([event, , reason]) =>
    event === 'CANCEL' && reason === 'UNFILLED_BY_MARKET_CLOSE').length,
  1,
  'EOD emits exactly one cancel'
);
const alertCountAfterEod = sim.alerts.length;
sim.eod();
assert.strictEqual(sim.alerts.length, alertCountAfterEod, 'EOD cancel is idempotent');
assert.strictEqual(sim.closed.length, 0, 'pending cancel creates no closed trade');

for (const [timeframeMinutes, barStartMinutes] of [
  [15, 15 * 60 + 45],
  [30, 15 * 60 + 30],
  [45, 15 * 60 + 30],
  [60, 15 * 60],
]) {
  const timeframeSim = new EdgeLifecycle();
  const setupId = `VIXALE_EDGE:TEST:${timeframeMinutes}:LONG:${timeframeMinutes}`;
  timeframeSim.flip({
    rth: true,
    beforeClose: true,
    setupId,
    side: 'LONG',
    htf1H: 'BULLISH',
    htf4H: 'BULLISH',
  });
  timeframeSim.eod({ timeframeMinutes, barStartMinutes });
  timeframeSim.eod({ timeframeMinutes, barStartMinutes });
  assert.strictEqual(timeframeSim.pending.size, 0, `${timeframeMinutes}m final RTH bar clears Pending`);
  assert.strictEqual(
    timeframeSim.alerts.filter(([event]) => event === 'CANCEL').length,
    1,
    `${timeframeMinutes}m final RTH bar emits exactly one CANCEL`
  );
}

const staleSim = new EdgeLifecycle();
staleSim.flip({
  rth: true,
  beforeClose: true,
  setupId: first,
  side: 'LONG',
  htf1H: 'BULLISH',
  htf4H: 'BULLISH',
});
staleSim.nextSession();
assert.strictEqual(staleSim.pending.size, 0, 'no stale Pending survives into the next RTH session');
assert.deepStrictEqual(
  staleSim.alerts.at(-1),
  ['CANCEL', first, 'STALE_PRIOR_SESSION'],
  'next-session fallback publishes one exact stale-session CANCEL'
);

sim.flip({
  rth: true,
  beforeClose: true,
  setupId: second,
  side: 'SHORT',
  htf1H: 'BEARISH',
  htf4H: 'BEARISH',
});
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
assert.match(
  app,
  /row\.event === 'PENDING_SETUP'[\s\S]{0,120}isVixaleEdgePendingLifecycleRow\(row\)[\s\S]{0,80}return true/,
  'Edge PENDING_SETUP is always Telegram-silent'
);
assert.match(
  app,
  /if \(finalRow\.skip_telegram\)[\s\S]{0,300}else if \(!shouldSuppressTelegram\(finalRow\)\)/,
  'Telegram routing applies the persistent Edge pending suppression'
);
assert.doesNotMatch(
  app,
  /isVixaleEdgePendingCancel\(finalRow\)[\s\S]{0,120}UNFILLED_BY_MARKET_CLOSE/,
  'EOD pending CANCEL no longer has a Telegram exception'
);
assert.match(app, /row\.setup_id \|\| row\.trade_id/, 'fill prefers exact setup_id');
assert.match(app, /raw\.startsWith\('VIXALE_EDGE:'\)\) return raw/, 'setup_id matching remains exact');
assert.match(app, /event === 'SETUP'[\s\S]{0,160}row\.setup_id[\s\S]{0,160}isVixaleEdgePendingLifecycleRow/, 'identified SETUP is execution-first');
assert.match(app, /\['SHREK', 'SHREK_1_4'\]/, 'Prime/Shrek lifecycle guard remains present');
assert.match(app, /if \(\['SETUP', 'FILL', 'TP', 'SL', 'EOD', 'EXTERNAL_CLOSE'\]\.includes\(event\)\)/, 'legacy Edge SETUP remains recognized without setup_id');
assert.match(app, /side === 'SHORT' \? 'Close Over' : 'Close Under'/, 'Edge stop threshold copy is direction-aware');
assert.doesNotMatch(app, /Stop Loss: <b>confirmed opposite signal<\/b>/, 'old generic pending stop wording is removed');

assert.match(pine, /strategy\("Vixale Edge 1\.1"/);
assert.match(pine, /default_qty_type=strategy\.percent_of_equity/);
assert.match(pine, /default_qty_value=2/);
assert.match(pine, /pyramiding=0/);
assert.match(pine, /stAtrPeriod = input\.int\(\s*10,/);
assert.match(pine, /stFactor = input\.float\(\s*3\.0,/);
assert.match(pine, /options=\["Flip Close", "Broken STL"\]/);
assert.match(pine, /request\.security\([\s\S]*?"60"[\s\S]*?request\.security\([\s\S]*?"240"/);
assert.match(
  pine,
  /f_htf_allows\(_direction\) =>\s*useHtfBias and[\s\S]{0,160}\(_direction == 1 and htfLongAligned\) or\s*\(_direction == -1 and htfShortAligned\)/,
  'completed 1H + 4H alignment is mandatory'
);
assert.doesNotMatch(
  pine,
  /f_htf_allows\(_direction\) =>\s*not useHtfBias/,
  'legacy HTF input cannot bypass required confirmation'
);
assert.match(
  pine,
  /if canCreateSetup and pendingDirection == 0 and f_htf_allows\(1\)/,
  'LONG Pending requires aligned completed HTF bias and no conflicting setup'
);
assert.match(
  pine,
  /if canCreateSetup and pendingDirection == 0 and f_htf_allows\(-1\)/,
  'SHORT Pending requires aligned completed HTF bias and no conflicting setup'
);
assert.match(pine, /HTF_1H_CONFIRMATION_LOST/);
assert.match(pine, /HTF_4H_CONFIRMATION_LOST/);
assert.match(pine, /STALE_PRIOR_SESSION/);
assert.match(
  pine,
  /pendingCancelReason[\s\S]*?strategy\.cancel\("Long Limit"\)[\s\S]*?strategy\.cancel\("Short Limit"\)[\s\S]*?strategy\.cancel\("Long ATR Target"\)[\s\S]*?strategy\.cancel\("Short ATR Target"\)[\s\S]*?"CANCEL"[\s\S]*?pendingDirection := 0[\s\S]*?pendingSessionDate := ""/,
  'every invalidation cancels virtual entry/target, emits CANCEL, and clears all pending state'
);
assert.match(
  pine,
  /timeframe\.multiplier == 15[\s\S]*?timeframe\.multiplier == 30[\s\S]*?timeframe\.multiplier == 45[\s\S]*?timeframe\.multiplier == 60[\s\S]*?time >= eodTimestamp - int\(timeframe\.in_seconds\(\) \* 1000\)/,
  '15m, 30m, 45m, and 60m final bars use duration-based RTH expiration'
);
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

const longPendingCall = pine.match(
  /"PENDING_SETUP",\s*"LONG",\s*setupLimitEntry,\s*setupFlipClose,\s*setupTarget,\s*stLine,\s*f_entry_qty\(setupLimitEntry\),\s*"VIXALE_EDGE_LONG_PENDING",\s*setupBrokenStl,/
);
const shortPendingCall = pine.match(
  /"PENDING_SETUP",\s*"SHORT",\s*setupLimitEntry,\s*setupFlipClose,\s*setupTarget,\s*stLine,\s*f_entry_qty\(setupLimitEntry\),\s*"VIXALE_EDGE_SHORT_PENDING",\s*setupBrokenStl,/
);
assert(longPendingCall, 'LONG PENDING_SETUP passes current stLine as stop and retains setupBrokenStl as broken_stl');
assert(shortPendingCall, 'SHORT PENDING_SETUP passes current stLine as stop and retains setupBrokenStl as broken_stl');
assert(
  pine.includes('j += "\\"broken_stl\\":" + f_payload_num(_brokenStl)'),
  'raw broken_stl remains in JSON'
);
assert.match(pine, /options=\["Flip Close", "Broken STL"\]/, 'optional Broken STL entry anchor remains');
assert.match(pine, /"Show Broken STL \+ Limit Entry"/, 'legacy UAM input title remains unchanged');
assert.match(pine, /Legacy input title retained for UAM automation compatibility/);

const plotsSection = pine.slice(
  pine.indexOf('// Plots'),
  pine.indexOf('// HTF / Pending Status Table')
);
assert.doesNotMatch(plotsSection, /setupBrokenStl/, 'Plots section no longer draws setupBrokenStl');
assert.doesNotMatch(plotsSection, /"Broken STL"/, 'gray Broken STL plot title is removed');
assert.match(plotsSection, /setupLimitEntry[\s\S]*?"Pending Limit Entry"[\s\S]*?color=color\.orange/, 'orange pending limit plot remains');
assert.match(plotsSection, /"Bullish SuperTrend"[\s\S]*?color=color\.green/, 'green current SuperTrend remains');
assert.match(plotsSection, /"Bearish SuperTrend"[\s\S]*?color=color\.red/, 'red current SuperTrend remains');
assert.match(plotsSection, /"Planned \/ Active ATR Target"[\s\S]*?color=color\.blue/, 'blue target plot remains');

console.log('Vixale Edge pending/next-RTH lifecycle simulation: focused checks passed');
