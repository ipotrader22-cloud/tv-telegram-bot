'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function loadWithGoogleStub(request, parent, isMain) {
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
  LIVE_OPEN_PNL_PATH,
  OPEN_POSITIONS_CACHE_MS,
  STYLE_ID,
  SCRIPT_ID,
  CARD_ID,
  getOpenPositionRowsSnapshot,
  buildLiveOpenPnlPayload,
  handleLiveOpenPnlRequest,
  injectLiveOpenPnl,
} = require('../website_home_live_open_pnl');
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

const sampleHtml = `<!doctype html><html><head><title>Vixale</title></head><body>
<section class="vx-home-day-trading"><div class="wrap">
<section class="vx-home-live-strip-wrap"><div class="vx-home-live-strip">
<div class="vx-home-live-card"><div class="vx-home-live-label">Open Positions</div><div id="vx-home-live-0" class="vx-home-live-value">1</div></div>
<div class="vx-home-live-card"><div class="vx-home-live-label">Working Orders</div><div id="vx-home-live-1" class="vx-home-live-value">1</div></div>
<div class="vx-home-live-card"><div class="vx-home-live-label">Closed Trades Today</div><div id="vx-home-live-2" class="vx-home-live-value">2</div></div>
<div class="vx-home-live-card"><div class="vx-home-live-label">Closed P&amp;L Today</div><div id="vx-home-live-3" class="vx-home-live-value">+$42.50</div></div>
</div></section>
</div></section>
</body></html>`;

function fakeAppApi(livePositions) {
  let remembered = null;
  return {
    parseOpenPositionRow(row) {
      return {
        trade_id: String(row[0] || ''),
        symbol: String(row[2] || ''),
        side: String(row[3] || ''),
        entry: Number(row[5] || 0),
        size: Number(row[6] || 0),
        open_pnl: Number(row[10] || 0),
      };
    },
    rememberPublicDashboardPnlPositions(rows) {
      remembered = rows;
    },
    publicDashboardLivePnlPayload() {
      assert(Array.isArray(remembered), 'parsed Open Positions must hydrate the existing live P&L path');
      return { ok: true, positions: livePositions };
    },
  };
}

function testHomepageCardInjection() {
  const out = injectLiveOpenPnl(sampleHtml, '/');
  assert(out.includes('Live Open P&amp;L'));
  assert(out.includes(`id="${CARD_ID}"`));
  assert(out.includes(`id="${STYLE_ID}"`));
  assert(out.includes(`id="${SCRIPT_ID}"`));
  assert(out.includes('grid-template-columns:repeat(5,minmax(0,1fr))'));
  assert(out.includes(`fetch('${LIVE_OPEN_PNL_PATH}'`));
  assert(out.includes('schedule(2000)'));
  assert(out.includes("document.addEventListener('visibilitychange'"));
  assert.strictEqual((out.match(/class="vx-home-live-card"/g) || []).length, 5);
  assert.strictEqual(injectLiveOpenPnl(out, '/'), out, 'homepage injection must be idempotent');
  assert.strictEqual(injectLiveOpenPnl(sampleHtml, '/pricing'), sampleHtml, 'other routes must not change');
}

function testAggregateOnlyPayload() {
  const rows = [
    ['Trade ID', 'System', 'Symbol', 'Side', 'Open Time', 'Entry', 'Size', 'Target', 'Stop', 'Last', 'Open P&L', 'Raw'],
    ['AAPL_LONG', 'Vixale Prime', 'AAPL', 'LONG', '', '100', '2', '', '', '', '4.00', ''],
    ['MSFT_SHORT', 'Vixale Edge', 'MSFT', 'SHORT', '', '200', '1', '', '', '', '-1.00', ''],
  ];
  const payload = buildLiveOpenPnlPayload(rows, fakeAppApi([
    { trade_id: 'AAPL_LONG', open_pnl: 12.50 },
    { trade_id: 'MSFT_SHORT', open_pnl: -2.25 },
  ]));
  assert.deepStrictEqual(payload, { ok: true, open_pnl: 10.25 });
  assert.deepStrictEqual(Object.keys(payload).sort(), ['ok', 'open_pnl']);

  const serialized = JSON.stringify(payload);
  for (const privateToken of ['positions', 'trade_id', 'symbol', 'side', 'entry', 'size', 'price', 'bid', 'ask', 'last', 'source']) {
    assert(!serialized.includes(privateToken), `public aggregate must not expose ${privateToken}`);
  }

  const empty = buildLiveOpenPnlPayload([rows[0]], fakeAppApi([]));
  assert.deepStrictEqual(empty, { ok: true, open_pnl: 0 });

  const invalid = buildLiveOpenPnlPayload(rows, fakeAppApi([{ trade_id: 'AAPL_LONG', open_pnl: null }]));
  assert.strictEqual(invalid, null, 'unknown P&L must fail closed instead of publishing a partial total');
}

async function testOpenPositionsCache() {
  let reads = 0;
  const cache = { loadedAt: 0, rows: null };
  const reader = async () => {
    reads += 1;
    return [['header'], ['AAPL_LONG']];
  };

  const first = await getOpenPositionRowsSnapshot({ cache, readOpenPositionRows: reader, nowMs: 100000 });
  const second = await getOpenPositionRowsSnapshot({ cache, readOpenPositionRows: reader, nowMs: 100000 + OPEN_POSITIONS_CACHE_MS - 1 });
  assert.deepStrictEqual(first, second);
  assert.strictEqual(reads, 1, 'Open Positions should refresh at the existing 30-second page cadence, not every P&L tick');

  await getOpenPositionRowsSnapshot({ cache, readOpenPositionRows: reader, nowMs: 100000 + OPEN_POSITIONS_CACHE_MS + 1 });
  assert.strictEqual(reads, 2);
}

async function testEndpointShape() {
  const rows = [
    ['Trade ID', 'System', 'Symbol', 'Side', 'Open Time', 'Entry', 'Size', 'Target', 'Stop', 'Last', 'Open P&L', 'Raw'],
    ['AAPL_LONG', 'Prime', 'AAPL', 'LONG', '', '100', '2', '', '', '', '0', ''],
  ];
  const response = responseRecorder();
  await handleLiveOpenPnlRequest({}, response, {
    readOpenPositionRows: async () => rows,
    cache: { loadedAt: 0, rows: null },
    nowMs: 100000,
    appApi: fakeAppApi([{ trade_id: 'AAPL_LONG', open_pnl: 7.75 }]),
  });
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, { ok: true, open_pnl: 7.75 });
  assert.match(response.headers['Cache-Control'], /no-store/);

  const failed = responseRecorder();
  await handleLiveOpenPnlRequest({}, failed, {
    readOpenPositionRows: async () => { throw new Error('test failure'); },
    cache: { loadedAt: 0, rows: null },
    nowMs: 100000,
    appApi: fakeAppApi([]),
  });
  assert.strictEqual(failed.statusCode, 503);
  assert.deepStrictEqual(failed.body, { ok: false, error: 'live_open_pnl_unavailable' });
}

(async () => {
  testHomepageCardInjection();
  testAggregateOnlyPayload();
  await testOpenPositionsCache();
  await testEndpointShape();
  console.log('Homepage Live Open P&L aggregate: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
