'use strict';

const assert = require('assert');
const Module = require('module');

function fakeExpress() {
  return {
    set() {},
    use() {},
    get() {},
    post() {},
    listen() {
      throw new Error('app.listen must not run while app.js is required by tests');
    },
  };
}

fakeExpress.json = () => (_req, _res, next) => next?.();
fakeExpress.urlencoded = () => (_req, _res, next) => next?.();
fakeExpress.text = () => (_req, _res, next) => next?.();

const originalLoad = Module._load;
Module._load = function loadWithTestDoubles(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'googleapis') {
    return {
      google: {
        auth: { GoogleAuth: class GoogleAuth {} },
        sheets: () => ({}),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  buildRealizedEquityCurve,
  renderDashboardHtml,
} = require('../app.js').__test;
Module._load = originalLoad;

function testCurveUsesOnlyCloseTimeAndResult() {
  const values = [
    ['Trade ID', 'Open Time', 'Close Time', 'Symbol', 'Side', 'Entry', 'Exit', 'Size', 'Result', 'Event'],
    ['', '', '2026-08-20 15:59:00', '', '', '', '', '', '$100.25', ''],
    ['IGNORED', 'anything', '2026-08-20T12:00:00', 'GC1!', 'SHORT', '1', '2', '3', '-25.50', 'TP'],
    ['ANOTHER', '', '08/21/2026 10:30:00', 'NOT_USED', '', '', '', '', '+50', ''],
    ['BAD_DATE', '', 'not-a-date', 'SOXL', '', '', '', '', '999.00', ''],
    ['BAD_RESULT', '', '2026-08-22 15:00:00', 'SOXL', '', '', '', '', '', ''],
    ['NON_NUMERIC', '', '2026-08-22 15:00:00', 'SOXL', '', '', '', '', 'not-a-number', ''],
  ];

  assert.deepStrictEqual(buildRealizedEquityCurve(values), {
    points: [
      { date: '2026-08-20', daily_pnl: 74.75, cumulative_pnl: 74.75 },
      { date: '2026-08-21', daily_pnl: 50, cumulative_pnl: 124.75 },
    ],
    total_realized_pnl: 124.75,
  });
}

function testEmptyCurve() {
  assert.deepStrictEqual(buildRealizedEquityCurve([
    ['Trade ID', 'Open Time', 'Close Time', 'Symbol', 'Side', 'Entry', 'Exit', 'Size', 'Result', 'Event'],
  ]), {
    points: [],
    total_realized_pnl: 0,
  });
}

function testDashboardChartMarkup() {
  const html = renderDashboardHtml({
    open_positions: [],
    working_orders: [],
    pending_orders: [],
    recent_closed_trades: [],
    option_journal: { trades: [], error: false },
    equity_curve: {
      points: [
        { date: '2026-08-20', daily_pnl: 2000, cumulative_pnl: 2000 },
        { date: '2026-08-21', daily_pnl: -250, cumulative_pnl: 1750 },
      ],
      total_realized_pnl: 1750,
    },
    summary: {},
  });

  assert.ok(html.includes('Equity Curve — Realized P&amp;L'));
  assert.ok(html.includes('Total Realized P&amp;L'));
  assert.ok(html.includes('+$1,750.00'));
  assert.ok(html.includes("match(/^(\\d{4})-(\\d{2})-(\\d{2})$/)"));
  assert.ok(html.includes('const realizedEquityPoints ='));
  assert.ok(html.includes('Daily P&amp;L'));
  assert.ok(html.includes('Cumulative P&amp;L'));
  assert.ok(html.includes("}, '$0');"));
  assert.ok(html.includes('Open P&amp;L excluded'));
  assert.ok(html.includes('.equity-chart-svg { height: 300px; }'));
}

function testDashboardRussianMarkup() {
  const html = renderDashboardHtml({
    open_positions: [],
    working_orders: [],
    pending_orders: [],
    recent_closed_trades: [],
    option_journal: { trades: [], error: false },
    equity_curve: {
      points: [{ date: '2026-08-20', daily_pnl: 25, cumulative_pnl: 25 }],
      total_realized_pnl: 25,
    },
    summary: {},
  }, 'ru');

  assert.ok(html.includes('Накопленный реализованный P&amp;L'));
  assert.ok(html.includes('Open P&amp;L исключен'));
}

function testDashboardEmptyState() {
  const html = renderDashboardHtml({
    open_positions: [],
    working_orders: [],
    pending_orders: [],
    recent_closed_trades: [],
    option_journal: { trades: [], error: false },
    equity_curve: { points: [], total_realized_pnl: 0 },
    summary: {},
  });

  assert.ok(html.includes('No closed trades with realized P&amp;L yet.'));
  assert.ok(!html.includes('id="equity-chart-svg"'));
}

testCurveUsesOnlyCloseTimeAndResult();
testEmptyCurve();
testDashboardChartMarkup();
testDashboardRussianMarkup();
testDashboardEmptyState();
console.log('Dashboard realized equity curve tests passed.');
