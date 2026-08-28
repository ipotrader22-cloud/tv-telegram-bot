'use strict';

const assert = require('assert');
const {
  ACTIVE_FIELDS,
  WATCH_FIELDS,
  CLOSED_FIELDS,
  SWING_LEADERS_SPREADSHEET_ID,
  SWING_LEADERS_RANGE,
  parsePublicFeed,
  createSwingLeadersService,
  renderSwingLeadersHtml,
} = require('../lib/swing-leaders');

function fixtureRows() {
  return [
    ['Vixale Swing Leaders — Public Feed v1.0', 'value'],
    ['snapshot_date', '2026-08-27'],
    ['snapshot_time_et', '09:49 ET'],
    ['market_posture', 'Selective offense / moderate exposure.'],
    ['active_count', '2'],
    ['watch_count', '2'],
    ['cash_pct', '49.9%'],
    ['quote_source', 'GOOGLEFINANCE'],
    ['quote_delay_notice', 'Quotes may be delayed. This is a swing research/model portfolio, not execution data.'],
    ['research_disclaimer', 'Research/model portfolio only; not broker execution and not a guarantee of future performance.'],
    [],
    ['ACTIVE POSITIONS'],
    [...ACTIVE_FIELDS, 'Shares', 'Cost Basis ($)', 'Internal Note'],
    ['FCX', 'NYSE', '87', 'Ready Now', '2026-08-21', '$76.66', '$78.42', '2.30%', '2026-08-27', 'Copper leader near highs; structure intact.', '999', '$99999', 'PRIVATE'],
    ['TVTX', 'NASDAQ', '88', 'READY NOW', '2026-08-21', '$65.71', '$67.52', '2.75%', '2026-08-27', 'Biotech leader near highs.', '888', '$88888', 'PRIVATE'],
    [],
    ['WATCHLIST'],
    [...WATCH_FIELDS, 'Automation Config'],
    ['NVDA', '79', 'CLOSE TO BREAKOUT', 'Wait for a tighter setup.', '2026-08-27', 'PRIVATE'],
    ['XYZ', '70', 'EARLY WATCH', 'Early structure is improving.', '2026-08-27', 'PRIVATE'],
    [],
    ['CLOSED TRADES'],
    [...CLOSED_FIELDS, 'Shares', 'Cash Proceeds ($)', 'Realized P&L ($)', 'Review Run'],
    ['OLD', '2026-08-01', '$10.00', '2026-08-20', '$11.00', '10.00%', '70', 'Model exit.', '100', '$1100', '$100', 'PRIVATE'],
    ['STLD', '2026-08-21', '$228.68', '2026-08-26', '$234.65', '2.61%', '84', 'Dropped from Ready Now', '10', '$2346.50', '$59.70', 'PRIVATE'],
  ];
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertRejectsRows(mutator, pattern) {
  const rows = fixtureRows();
  mutator(rows);
  assert.throws(() => parsePublicFeed(rows), pattern);
}

async function testCacheFallback() {
  let shouldFail = false;
  let reads = 0;
  const client = {
    spreadsheets: {
      values: {
        async get(request) {
          reads += 1;
          assert.strictEqual(request.spreadsheetId, SWING_LEADERS_SPREADSHEET_ID);
          assert.strictEqual(request.range, SWING_LEADERS_RANGE);
          assert.strictEqual(request.valueRenderOption, 'FORMATTED_VALUE');
          if (shouldFail) throw new Error('temporary Sheets failure');
          return { data: { values: fixtureRows() } };
        },
      },
    },
  };
  const logged = [];
  const service = createSwingLeadersService({
    getSheetsClient: async () => client,
    cacheMs: 300000,
    logger: { error: (...args) => logged.push(args.join(' ')) },
  });

  const fresh = await service.getSnapshot({ force: true });
  assert.strictEqual(fresh.available, true);
  assert.strictEqual(fresh.stale, false);
  assert.strictEqual(fresh.data.active_count, 2);

  shouldFail = true;
  const stale = await service.getSnapshot({ force: true });
  assert.strictEqual(stale.available, true);
  assert.strictEqual(stale.stale, true);
  assert.deepStrictEqual(stale.data, fresh.data, 'failed refresh must retain the complete last valid snapshot');
  assert.ok(logged.length >= 1, 'feed failure must be logged server-side');
  assert.strictEqual(reads, 2);

  const noCacheService = createSwingLeadersService({
    getSheetsClient: async () => ({ spreadsheets: { values: { get: async () => { throw new Error('down'); } } } }),
    logger: { error() {} },
  });
  const unavailable = await noCacheService.getSnapshot({ force: true });
  assert.deepStrictEqual(unavailable, { available: false, stale: true, data: null });
}

async function run() {
  const parsed = parsePublicFeed(fixtureRows());
  assert.strictEqual(parsed.snapshot_date, '2026-08-27');
  assert.strictEqual(parsed.snapshot_time_et, '09:49 ET');
  assert.strictEqual(parsed.market_posture, 'Selective offense / moderate exposure.');
  assert.strictEqual(parsed.active_count, 2);
  assert.strictEqual(parsed.watch_count, 2);
  assert.strictEqual(parsed.cash_pct, '49.9%');
  assert.strictEqual(parsed.quote_source, 'GOOGLEFINANCE');
  assert.strictEqual(parsed.active_positions[0].entry_price, '$76.66');
  assert.strictEqual(parsed.active_positions[0].current_price, '$78.42');
  assert.strictEqual(parsed.active_positions[0].return_pct, '2.30%');
  assert.strictEqual(parsed.watchlist[0].classification, 'CLOSE TO BREAKOUT');
  assert.strictEqual(parsed.watchlist[1].classification, 'EARLY WATCH');
  assert.strictEqual(parsed.closed_trades[0].ticker, 'STLD', 'closed trades must render newest exit first');

  const serialized = JSON.stringify(parsed);
  for (const forbidden of ['Shares', 'Cost Basis ($)', 'Cash Proceeds ($)', 'Realized P&L ($)', 'Automation Config', 'PRIVATE']) {
    assert.ok(!serialized.includes(forbidden), `sanitized snapshot must not expose ${forbidden}`);
  }
  assert.deepStrictEqual(Object.keys(parsed.active_positions[0]), ACTIVE_FIELDS);
  assert.deepStrictEqual(Object.keys(parsed.watchlist[0]), WATCH_FIELDS);
  assert.deepStrictEqual(Object.keys(parsed.closed_trades[0]), CLOSED_FIELDS);

  assertRejectsRows(rows => { rows[4][1] = '3'; }, /active_count does not match/);
  assertRejectsRows(rows => { rows[5][1] = '1'; }, /watch_count does not match/);
  assertRejectsRows(rows => { rows[7][1] = 'OTHER'; }, /GOOGLEFINANCE/);
  assertRejectsRows(rows => { rows[14][3] = 'BUY'; }, /Invalid active status/);
  assertRejectsRows(rows => { rows[18][2] = 'READY NOW'; }, /Invalid watch classification/);
  assertRejectsRows(rows => { rows[23][0] = 'FCX'; }, /still active/);

  const html = renderSwingLeadersHtml(deepClone(parsed), { stale: true });
  assert.ok(html.includes('Vixale Swing Leaders'));
  assert.ok(html.includes('Market Posture'));
  assert.ok(html.includes('Current Picks'));
  assert.ok(html.includes('Close to Breakout / Early Watch'));
  assert.ok(html.includes('Closed Trades'));
  assert.ok(html.includes('09:49 ET'));
  assert.ok(html.includes('Stale — last valid snapshot'));
  assert.ok(html.includes('Quotes may be delayed. This is a swing research/model portfolio, not execution data.'));
  assert.ok(html.includes('@media(max-width:720px)'));
  assert.ok(!html.includes('PRIVATE'));
  assert.ok(!html.includes('Cost Basis'));
  assert.ok(!html.includes('Realized P&amp;L ($)'));

  await testCacheFallback();
  console.log('Swing Leaders feed, sanitization, stale-cache, and responsive rendering tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
