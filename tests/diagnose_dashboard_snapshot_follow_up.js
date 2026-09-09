'use strict';

const fs = require('fs');
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
  open_positions: [], working_orders: [], pending_orders: [], recent_closed_trades: [],
  option_journal: { trades: [], error: false },
  summary: { open_count: 11, working_count: 12, closed_count_today: 13, closed_pnl_today: 14.15, total_closed_pnl: 1617.18, win_rate: 68.63 },
});

function snippet(marker, radius = 850) {
  const i = html.indexOf(marker);
  console.log(`\n===== HTML ${marker} @ ${i} =====`);
  if (i >= 0) console.log(html.slice(Math.max(0, i - radius), Math.min(html.length, i + marker.length + radius)));
}
for (const marker of ['Last refreshed:', 'Vixale Prime', 'Closed P&L Today', 'Win Rate', '/dashboard/live-pnl.json']) snippet(marker);

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const lines = source.split(/\r?\n/);
console.log('\n===== APP SOURCE MATCHES =====');
for (let i = 0; i < lines.length; i += 1) {
  if (/win_rate|renderDashboardHtml\(|buildDashboard|closed_count_today|total_closed_pnl/i.test(lines[i])) {
    const start = Math.max(0, i - 5);
    const end = Math.min(lines.length, i + 7);
    console.log(`\n--- lines ${start + 1}-${end} ---`);
    console.log(lines.slice(start, end).map((line, index) => `${start + index + 1}: ${line}`).join('\n'));
  }
}
