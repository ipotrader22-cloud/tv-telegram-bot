'use strict';

const assert = require('assert');
const {
  SWING_LEADERS_RANGE,
  SWING_LEADERS_EQUITY_HISTORY_RANGE,
  normalizePublicFeedRows,
  parsePublicFeed,
  createSwingLeadersService,
} = require('../lib/swing-leaders');

function canonicalRows() {
  return [
    ['Vixale Swing Leaders — Public Feed v1.1', 'value'],
    ['snapshot_date', '2026-09-04'],
    ['snapshot_time_et', '09:55 ET'],
    ['market_posture', 'Selective.'],
    ['active_count', '1'],
    ['candidate_count', '1'],
    ['cash_pct', '80.0%'],
    ['quote_source', 'GOOGLEFINANCE'],
    ['quote_delay_notice', 'Quotes may be delayed.'],
    ['research_disclaimer', 'Research/model portfolio only.'],
    [],
    ['ACTIVE PORTFOLIO'],
    ['ticker', 'exchange', 'score', 'entry_date', 'entry_price', 'current_price', 'return_pct', 'last_review_date', 'brief_note'],
    ['ANET', 'NYSE', '88', '2026-09-04', '$193.23', '$193.23', '0.00%', '2026-09-04', 'Fresh Active promotion.'],
    [],
    ['POTENTIAL CANDIDATES'],
    ['ticker', 'score', 'brief_reason', 'review_date'],
    ['SNOW', '86', 'Strong AI/product-revenue catalyst.', '2026-09-04'],
    [],
    ['CLOSED TRADES'],
    ['ticker', 'entry_date', 'entry_price', 'exit_date', 'exit_price', 'return_pct', 'last_score', 'exit_reason'],
  ];
}

function legacyRows() {
  return canonicalRows().map(row => {
    const copy = [...row];
    if (copy[0] === 'candidate_count') copy[0] = 'intern_count';
    if (copy[0] === 'POTENTIAL CANDIDATES') copy[0] = 'INTERNS';
    return copy;
  });
}

function equityRows() {
  return [
    ['snapshot_date', 'snapshot_time_et', 'realized_model_pnl', 'unrealized_model_pnl', 'total_model_pnl', 'model_equity', 'active_count'],
    ['2026-08-21', 'INCEPTION', '-', '-', '-', '$100,000.00', '0'],
  ];
}

async function run() {
  const canonical = parsePublicFeed(canonicalRows());
  assert.strictEqual(canonical.intern_count, 1);
  assert.strictEqual(canonical.interns[0].ticker, 'SNOW');

  const legacy = parsePublicFeed(legacyRows());
  assert.strictEqual(legacy.intern_count, 1);
  assert.strictEqual(legacy.interns[0].ticker, 'SNOW');

  const normalized = normalizePublicFeedRows(canonicalRows());
  assert.ok(normalized.some(row => row[0] === 'intern_count'));
  assert.ok(normalized.some(row => row[0] === 'INTERNS'));
  assert.ok(!normalized.some(row => row[0] === 'candidate_count'));
  assert.ok(!normalized.some(row => row[0] === 'POTENTIAL CANDIDATES'));

  const conflictingCount = canonicalRows();
  conflictingCount.splice(6, 0, ['intern_count', '2']);
  assert.throws(() => parsePublicFeed(conflictingCount), /conflicting candidate count aliases/);

  const conflictingSection = canonicalRows();
  conflictingSection.splice(18, 0, ['INTERNS']);
  assert.throws(() => parsePublicFeed(conflictingSection), /both candidate section aliases/);

  const client = {
    spreadsheets: {
      values: {
        async get(request) {
          if (request.range === SWING_LEADERS_RANGE) return { data: { values: canonicalRows() } };
          if (request.range === SWING_LEADERS_EQUITY_HISTORY_RANGE) return { data: { values: equityRows() } };
          throw new Error(`Unexpected range ${request.range}`);
        },
      },
    },
  };

  const service = createSwingLeadersService({
    getSheetsClient: async () => client,
    logger: { error() {} },
  });
  const result = await service.getSnapshot({ force: true });
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.stale, false);
  assert.strictEqual(result.data.intern_count, 1);
  assert.strictEqual(result.data.interns[0].ticker, 'SNOW');
  assert.strictEqual(result.data.equity_history.length, 1);

  console.log('Swing Leaders candidate feed compatibility tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
