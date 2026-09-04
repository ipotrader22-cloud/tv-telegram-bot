'use strict';

const assert = require('assert');
const {
  ACTIVE_FIELDS,
  INTERN_FIELDS,
  CLOSED_FIELDS,
  EQUITY_HISTORY_PUBLIC_FIELDS,
  MODEL_ALLOCATION_PER_POSITION,
  SWING_LEADERS_SPREADSHEET_ID,
  SWING_LEADERS_RANGE,
  SWING_LEADERS_EQUITY_HISTORY_RANGE,
  parsePublicFeed,
  parseEquityHistory,
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

function equityHistoryRows() {
  return [
    ['snapshot_date', 'snapshot_time_et', 'realized_model_pnl', 'unrealized_model_pnl', 'total_model_pnl', 'model_equity', 'active_count'],
    ['2026-08-27', 'INCEPTION', '-', '-', '-', '$100,000.00', '0'],
    ['2026-08-27', '09:49 ET', '-$813.00', '-$157.00', '-$970.00', '$99,030.00', '4'],
    ['2026-08-28', '09:59 ET', '-$813.00', '-$252.00', '-$1,065.00', '$98,935.00', '4'],
    ['2026-08-31', '10:00 ET', '-$813.00', '-$252.00', '-$1,065.00', '$98,935.00', '4'],
    ['2026-09-01', '10:00 ET', '-$1,412.00', '+$572.00', '-$840.00', '$99,160.00', '3'],
    ['2026-09-02', '10:01 ET', '+$193.00', '-$236.00', '-$43.00', '$99,957.00', '4'],
    ['2026-09-03', '10:00 ET', '+$193.00', '+$66.00', '+$259.00', '$100,259.00', '4'],
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

function testEquityHistoryParser() {
  const unsorted = equityHistoryRows();
  const row = unsorted.pop();
  unsorted.splice(2, 0, row);
  const parsed = parseEquityHistory(unsorted);

  assert.strictEqual(parsed.length, 7);
  assert.deepStrictEqual(parsed[0], {
    snapshot_date: '2026-08-27',
    snapshot_time_et: 'INCEPTION',
    total_model_pnl: 0,
  });
  assert.strictEqual(parsed[parsed.length - 1].snapshot_date, '2026-09-03');
  assert.strictEqual(parsed[parsed.length - 1].total_model_pnl, 259);
  assert.deepStrictEqual(Object.keys(parsed[1]), EQUITY_HISTORY_PUBLIC_FIELDS);
  assert.ok(!parsed.some(point => point.snapshot_date === '2026-08-29'), 'missing dates must remain absent');
  assert.ok(!parsed.some(point => point.snapshot_date === '2026-08-30'), 'missing dates must remain absent');

  const invalidDash = equityHistoryRows();
  invalidDash[2][4] = '-';
  assert.throws(() => parseEquityHistory(invalidDash), /Invalid currency for Equity History total_model_pnl/);

  const noInception = equityHistoryRows().slice(1);
  noInception[0] = equityHistoryRows()[0];
  assert.throws(() => parseEquityHistory(noInception), /must start with the Trading Lab \$0 inception row/);

  const nonZeroInception = equityHistoryRows();
  nonZeroInception[1][4] = '$1.00';
  assert.throws(() => parseEquityHistory(nonZeroInception), /inception total_model_pnl must be zero/);

  const duplicate = equityHistoryRows();
  duplicate.push(deepClone(duplicate[2]));
  assert.throws(() => parseEquityHistory(duplicate), /Duplicate Equity History snapshot/);
}

async function testCacheFallbackAndDailyAppend() {
  let publicFeedShouldFail = false;
  let equityHistoryShouldFail = false;
  let reads = 0;
  const history = equityHistoryRows().slice(0, 3);
  const client = {
    spreadsheets: {
      values: {
        async get(request) {
          reads += 1;
          assert.strictEqual(request.spreadsheetId, SWING_LEADERS_SPREADSHEET_ID);
          assert.strictEqual(request.valueRenderOption, 'FORMATTED_VALUE');
          if (request.range === SWING_LEADERS_RANGE) {
            if (publicFeedShouldFail) throw new Error('temporary Public Feed failure');
            return { data: { values: fixtureRows() } };
          }
          if (request.range === SWING_LEADERS_EQUITY_HISTORY_RANGE) {
            if (equityHistoryShouldFail) throw new Error('temporary Equity History failure');
            return { data: { values: deepClone(history) } };
          }
          throw new Error(`unexpected range ${request.range}`);
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
  assert.strictEqual(fresh.data.equity_history.length, 2);
  assert.strictEqual(fresh.data.equity_history[0].total_model_pnl, 0);
  assert.strictEqual(reads, 2);

  history.push(['2026-08-28', '09:59 ET', '-$813.00', '-$252.00', '-$1,065.00', '$98,935.00', '4']);
  const appended = await service.getSnapshot({ force: true });
  assert.strictEqual(appended.data.equity_history.length, 3, 'new appended Trading Lab row must appear on the next normal refresh');
  assert.strictEqual(appended.data.equity_history[2].snapshot_date, '2026-08-28');
  assert.strictEqual(reads, 4);

  equityHistoryShouldFail = true;
  const cachedHistory = await service.getSnapshot({ force: true });
  assert.strictEqual(cachedHistory.available, true);
  assert.strictEqual(cachedHistory.stale, false, 'Equity History failure must not mark a fresh Public Feed snapshot stale');
  assert.deepStrictEqual(cachedHistory.data.equity_history, appended.data.equity_history, 'Equity History failure must retain the last valid history');
  assert.ok(logged.some(line => line.includes('Equity History refresh failed')));
  assert.strictEqual(reads, 6);

  publicFeedShouldFail = true;
  const stale = await service.getSnapshot({ force: true });
  assert.strictEqual(stale.available, true);
  assert.strictEqual(stale.stale, true);
  assert.deepStrictEqual(stale.data, cachedHistory.data, 'failed Public Feed refresh must retain the complete last valid snapshot');
  assert.ok(logged.some(line => line.includes('Public Feed refresh failed')));
  assert.strictEqual(reads, 7);

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

  testEquityHistoryParser();

  const candidateReason = 'Energy leadership remains supportive; strong fundamentals and digital/data-center exposure, but entry discipline matters near highs.';
  const displayData = deepClone(parsed);
  displayData.interns[0].ticker = 'SLB';
  displayData.interns[0].score = 84;
  displayData.interns[0].brief_reason = candidateReason;
  displayData.interns[0].review_date = '2026-09-02';
  displayData.equity_history = parseEquityHistory(equityHistoryRows());

  const html = renderSwingLeadersHtml(displayData, { stale: true });
  assert.ok(html.includes('Vixale Swing Leaders'));
  assert.ok(html.includes('How Swing Leaders Works'));
  assert.ok(html.includes('Active Portfolio'));
  assert.ok(html.includes('Potential Candidates'));
  assert.ok(html.includes('Potential candidates under active research review.'));
  assert.ok(html.includes('Closed Trades'));
  assert.ok(html.includes('Unrealized Model P&amp;L'));
  assert.ok(html.includes('Realized Model P&amp;L'));
  assert.ok(html.includes('+$505.00'));
  assert.ok(html.includes('+$1,261.00'));
  assert.ok(html.includes('profit target is +10% from entry and may trigger intraday'));
  assert.ok(html.includes('Stop-losses are evaluated only during the scheduled morning review'));
  assert.ok(html.includes('current review price is more than 5% below entry'));
  assert.ok(html.includes('position is closed at that price'));
  assert.ok(!html.includes('daily closing price is more than 5% below entry'));
  assert.ok(!html.includes('intraday −5% stop'));
  assert.ok(!html.includes('EOD stop'));
  assert.ok(html.includes('proprietary Vixale research metric shown on a 0–100 scale'));
  assert.ok(html.includes('09:49 ET'));
  assert.ok(html.includes('Stale — last valid snapshot'));
  assert.ok(html.includes('Quotes may be delayed. This is a swing research/model portfolio, not execution data.'));
  assert.ok(html.includes('class="candidate-table"'));
  assert.ok(html.includes('<th>Ticker</th><th>Score</th><th>Why We’re Watching</th><th>Reviewed</th>'));
  assert.ok(html.includes(candidateReason), 'Trading Lab brief_reason must remain visible verbatim');
  assert.ok(html.includes('2026-09-02'), 'review_date must remain visible');
  assert.ok(html.includes('candidate-col-reason'));
  assert.ok(html.includes('width:62%'));
  assert.ok(html.includes('@media(max-width:720px)'));
  assert.ok(html.includes('class="hero-layout"'));
  assert.ok(html.includes('grid-template-areas:"hero chart" "summary summary"'));
  assert.ok(html.includes('grid-template-areas:"hero" "summary" "chart"'));
  assert.ok(html.includes('class="equity-chart-card"'));
  assert.ok(html.includes('Model P&amp;L'));
  assert.ok(html.includes('class="equity-chart-svg"'));
  assert.ok(html.includes('class="zero-baseline"'));
  assert.ok(html.includes('class="equity-line"'));
  assert.ok(html.includes('Model P&amp;L: $0.00'));
  assert.ok(html.includes('Model P&amp;L: +$259.00'));
  assert.ok(html.includes('2026-08-27 · Inception'));
  assert.ok(html.includes('2026-09-03 · 10:00 ET'));
  assert.ok(!html.includes('realized_model_pnl'));
  assert.ok(!html.includes('unrealized_model_pnl'));
  assert.ok(!html.includes('model_equity'));
  assert.ok(!html.includes('PRIVATE'));
  assert.ok(!html.includes('Current Picks'));
  assert.ok(!html.includes('Close to Breakout'));
  assert.ok(!html.includes('READY NOW'));
  assert.ok(!html.includes('approved Public Feed'));
  assert.ok(!html.includes('website does not infer membership'));
  assert.ok(!html.includes('Interns'), 'Interns must not appear in public-facing HTML');
  assert.ok(!html.includes('intern-card'));
  assert.ok(!html.includes('intern-grid'));

  await testCacheFallbackAndDailyAppend();
  console.log('Swing Leaders daily Model P&L equity curve tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
