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
  upsertLiveQuote,
  rememberPublicDashboardPnlPositions,
  publicDashboardLivePnlPayload,
  handlePublicDashboardLivePnlRequest,
  renderDashboardHtml,
} = require('../app.js').__test;
Module._load = originalLoad;

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function snapshot(openPnl = 125) {
  rememberPublicDashboardPnlPositions([{
    trade_id: 'SOXL_LONG',
    symbol: 'SOXL',
    side: 'LONG',
    entry: 10,
    size: 100,
    open_pnl: openPnl,
  }]);
}

async function testAuthorization() {
  const unauthorized = responseRecorder();
  await handlePublicDashboardLivePnlRequest({}, unauthorized, {
    getDashboardAuthorization: async () => ({ authorized: false }),
  });
  assert.strictEqual(unauthorized.statusCode, 401);
  assert.deepStrictEqual(unauthorized.body, { ok: false, error: 'dashboard_unauthorized' });
  assert.match(unauthorized.headers['Cache-Control'], /no-store/);

  for (const role of ['viewer', 'owner']) {
    const response = responseRecorder();
    await handlePublicDashboardLivePnlRequest({}, response, {
      getDashboardAuthorization: async () => ({ authorized: true, role }),
      publicDashboardLivePnlPayload: () => ({ ok: true, updated_at: 'now', positions: [] }),
    });
    assert.strictEqual(response.statusCode, 200, `${role} is authorized`);
    assert.deepStrictEqual(response.body.positions, []);
  }
}

function testFreshQuoteAndPublicShape() {
  snapshot();
  assert.strictEqual(upsertLiveQuote({
    symbol: 'SOXL',
    price: 12,
    bid: 11.99,
    ask: 12.01,
    last: 12,
    source: 'TWS',
    market_data_type: 1,
    timestamp_ms: Date.now(),
  }), true);

  const payload = publicDashboardLivePnlPayload();
  assert.deepStrictEqual(Object.keys(payload).sort(), ['ok', 'positions', 'updated_at']);
  assert.strictEqual(payload.positions.length, 1);
  assert.deepStrictEqual(payload.positions[0], { trade_id: 'SOXL_LONG', open_pnl: 200 });

  const serialized = JSON.stringify(payload);
  for (const privateField of [
    'price', 'bid', 'ask', 'last', 'source', 'age_seconds', 'market_data_type',
    'quote_status', 'quote_time', 'entry', 'size', 'symbol', 'side',
  ]) {
    assert.ok(!Object.prototype.hasOwnProperty.call(payload.positions[0], privateField));
    assert.ok(!serialized.includes(`"${privateField}"`));
  }
}

function testStaleAndMissingQuoteFallbacks() {
  snapshot(125);
  upsertLiveQuote({ symbol: 'SOXL', price: 20, timestamp_ms: Date.now() - 10 * 60 * 1000 });
  assert.strictEqual(publicDashboardLivePnlPayload().positions[0].open_pnl, 125);

  rememberPublicDashboardPnlPositions([{
    trade_id: 'QQQ_SHORT', symbol: 'QQQ', side: 'SHORT', entry: 500, size: 2, open_pnl: 18,
  }]);
  assert.deepStrictEqual(publicDashboardLivePnlPayload().positions, [
    { trade_id: 'QQQ_SHORT', open_pnl: 18 },
  ]);
}

function testEmptyStartupAndPollingMarkup() {
  rememberPublicDashboardPnlPositions([]);
  assert.deepStrictEqual(publicDashboardLivePnlPayload().positions, []);

  const html = renderDashboardHtml({
    open_positions: [],
    working_orders: [],
    pending_orders: [],
    recent_closed_trades: [],
    option_journal: { trades: [], error: false },
    summary: {},
  });
  assert.ok(html.includes("fetch('/dashboard/live-pnl.json'"));
  assert.ok(html.includes("document.addEventListener('visibilitychange'"));
  assert.ok(html.includes('publicPnlInFlight'));
  assert.ok(html.includes('window.setTimeout(refreshPublicOpenPnl, delay)'));
  assert.ok(!html.includes('window.setInterval(refreshPublicOpenPnl, 2000)'));
  assert.ok(html.includes("window.location.href = '/login'"));
}

(async () => {
  await testAuthorization();
  testFreshQuoteAndPublicShape();
  testStaleAndMissingQuoteFallbacks();
  testEmptyStartupAndPollingMarkup();
  console.log('Public dashboard live P&L tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
