'use strict';

const assert = require('assert');
const {
  ACTIVE_FIELDS,
  INTERN_FIELDS,
  CLOSED_FIELDS,
  MODEL_ALLOCATION_PER_POSITION,
  SWING_LEADERS_SPREADSHEET_ID,
  SWING_LEADERS_RANGE,
  parsePublicFeed,
  createSwingLeadersService,
  renderSwingLeadersHtml,
} = require('../lib/swing-leaders');

function fixtureRows() {
  return [
    ['Vixale Swing Leaders — Public Feed v1.1', 'value'],
    ['snapshot_date', '2026-08-27'],
    ['snapshot_time_et', '09:49 ET'],
    ['market_posture', 'Selective offense / moderate exposure.'],
    ['active_count', '2'],
    ['intern_count', '2'],
    ['cash_pct', '59.8%'],
    ['quote_source', 'GOOGLEFINANCE'],
    ['quote_delay_notice', 'Quotes may be delayed. This is a swing research/model portfolio, not execution data.'],
    ['research_disclaimer', 'Research/model portfolio only; not broker execution and not a guarantee of future performance.'],
    [],
    ['ACTIVE PORTFOLIO'],
    [...ACTIVE_FIELDS, 'Shares', 'Cost Basis ($)', 'Internal Note'],
    ['FCX', 'NYSE', '87', '2026-08-21', '$76.66', '$78.42', '2.30%', '2026-08-27', 'Copper leader near highs; structure intact.', '999', '$99999', 'PRIVATE'],
    ['TVTX', 'NASDAQ', '88', '2026-08-21', '$65.71', '$67.52', '2.75%', '2026-08-27', 'Biotech leader near highs.', '888', '$88888', 'PRIVATE'],
    [],
    ['INTERNS'],
    [...INTERN_FIELDS, 'Automation Config'],
    ['NVDA', '79', 'Wait for a tighter setup.', '2026-08-27', 'PRIVATE'],
    ['XYZ', '70', 'Early structure is improving.', '2026-08-27', 'PRIVATE'],
    [],
    ['CLOSED TRADES'],
    [...CLOSED_FIELDS, 'Shares', 'Cash Proceeds ($)', 'Realized P&L ($)', 'Review Run'],
    ['OLD', '2026-08-01', '$10.00', '2026-08-20', '$11.00', '10.00%', '70', 'TARGET', '100', '$1100', '$100', 'PRIVATE'],
    ['STLD', '2026-08-21', '$228.68', '2026-08-26', '$234.65', '2.61%', '84', 'DROPPED FROM ACTIVE PORTFOLIO', '10', '$2346.50', '$59.70', 'PRIVATE'],
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
  assert.strictEqual(fresh.data.intern_count, 2);

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
  assert.strictEqual(parsed.intern_count, 2);
  assert.strictEqual(parsed.cash_pct, '59.8%');
  assert.strictEqual(parsed.quote_source, 'GOOGLEFINANCE');
  assert.strictEqual(parsed.model_allocation_per_position, MODEL_ALLOCATION_PER_POSITION);
  assert.strictEqual(parsed.active_unrealized_model_pnl, 505);
  assert.strictEqual(parsed.closed_realized_model_pnl, 1261);
  assert.strictEqual(parsed.active_portfolio[0].entry_price, '$76.66');
  assert.strictEqual(parsed.active_portfolio[0].current_price, '$78.42');
  assert.strictEqual(parsed.active_portfolio[0].return_pct, '2.30%');
  assert.strictEqual(parsed.interns[0].ticker, 'NVDA');
  assert.strictEqual(parsed.closed_trades[0].ticker, 'STLD', 'closed trades must render newest exit first');

  const serialized = JSON.stringify(parsed);
  for (const forbidden of ['Shares', 'Cost Basis ($)', 'Cash Proceeds ($)', 'Realized P&L ($)', 'Automation Config', 'PRIVATE', 'Ready Now', 'CLOSE TO BREAKOUT']) {
    assert.ok(!serialized.includes(forbidden), `sanitized snapshot must not expose ${forbidden}`);
  }
  assert.deepStrictEqual(Object.keys(parsed.active_portfolio[0]), ACTIVE_FIELDS);
  assert.deepStrictEqual(Object.keys(parsed.interns[0]), INTERN_FIELDS);
  assert.deepStrictEqual(Object.keys(parsed.closed_trades[0]), CLOSED_FIELDS);

  assertRejectsRows(rows => { rows[4][1] = '3'; }, /active_count does not match/);
  assertRejectsRows(rows => { rows[5][1] = '1'; }, /intern_count does not match/);
  assertRejectsRows(rows => { rows[6][1] = 'not a percent'; }, /Invalid percentage/);
  assertRejectsRows(rows => { rows[7][1] = 'OTHER'; }, /GOOGLEFINANCE/);
  assertRejectsRows(rows => { rows[13][6] = 'n/a'; }, /Invalid percentage/);
  assertRejectsRows(rows => { rows[18][0] = 'FCX'; }, /already active/);
  assertRejectsRows(rows => { rows[23][7] = 'OTHER'; }, /Invalid exit_reason/);
  const reentryRows = fixtureRows();
  reentryRows[23][0] = 'FCX';
  assert.doesNotThrow(() => parsePublicFeed(reentryRows), 'closed history may contain a ticker that has since been re-entered');

  const html = renderSwingLeadersHtml(deepClone(parsed), { stale: true });
  assert.ok(html.includes('Vixale Swing Leaders'));
  assert.ok(html.includes('How Swing Leaders Works'));
  assert.ok(html.includes('Active Portfolio'));
  assert.ok(html.includes('Interns'));
  assert.ok(html.includes('Potential candidates under active research review.'));
  assert.ok(html.includes('Closed Trades'));
  assert.ok(html.includes('Unrealized Model P&amp;L'));
  assert.ok(html.includes('Realized Model P&amp;L'));
  assert.ok(html.includes('+$505.00'));
  assert.ok(html.includes('+$1,261.00'));
  assert.ok(html.includes('profit target is +10% from entry'));
  assert.ok(html.includes('daily closing price is more than 5% below entry'));
  assert.ok(html.includes('proprietary Vixale research metric shown on a 0–100 scale'));
  assert.ok(html.includes('09:49 ET'));
  assert.ok(html.includes('Stale — last valid snapshot'));
  assert.ok(html.includes('Quotes may be delayed. This is a swing research/model portfolio, not execution data.'));
  assert.ok(html.includes('@media(max-width:720px)'));
  assert.ok(!html.includes('PRIVATE'));
  assert.ok(!html.includes('Current Picks'));
  assert.ok(!html.includes('Close to Breakout'));
  assert.ok(!html.includes('READY NOW'));
  assert.ok(!html.includes('approved Public Feed'));
  assert.ok(!html.includes('website does not infer membership'));

  await testCacheFallback();
  console.log('Swing Leaders v1.1 feed, model P&L, sanitization, stale-cache, and responsive rendering tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
