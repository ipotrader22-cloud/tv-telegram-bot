'use strict';

const Module = require('module');

function fakeExpress() {
  return {
    set() {}, use() {}, get() {}, post() {},
    listen() { throw new Error('app.listen must not run while app.js is required by diagnostics'); },
  };
}
fakeExpress.json = () => (_req, _res, next) => next?.();
fakeExpress.urlencoded = () => (_req, _res, next) => next?.();
fakeExpress.text = () => (_req, _res, next) => next?.();

const originalLoad = Module._load;
Module._load = function loadWithTestDoubles(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'googleapis') {
    return { google: { auth: { GoogleAuth: class GoogleAuth {} }, sheets: () => ({}) } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const testApi = require('../app.js').__test;
Module._load = originalLoad;

const html = testApi.renderDashboardHtml({
  open_positions: [],
  working_orders: [],
  pending_orders: [],
  recent_closed_trades: [],
  option_journal: { trades: [], error: false },
  summary: {
    open_count: 11,
    working_count: 12,
    closed_count_today: 13,
    closed_pnl_today: 14.15,
    total_closed_pnl: 1617.18,
    win_rate: 68.63,
  },
});

function snippet(marker, radius = 900) {
  const i = html.indexOf(marker);
  console.log(`\n===== ${marker} @ ${i} =====`);
  if (i < 0) return;
  console.log(html.slice(Math.max(0, i - radius), Math.min(html.length, i + marker.length + radius)));
}

for (const marker of [
  'Vixale Live Day Trading Dashboard',
  'Private live day-trading forward-test / paper-trading tracker',
  'Last refreshed:',
  'Vixale Prime',
  'Vixale Edge',
  'Closed P&L Today',
  'Total Closed P&L',
  'Win Rate',
  '68.63',
  '/dashboard/live-pnl.json',
]) snippet(marker);

const keys = Object.keys(testApi).filter(key => /dashboard|summary|win|closed|pnl/i.test(key)).sort();
console.log('\n===== __test relevant keys =====');
console.log(keys.join('\n'));
