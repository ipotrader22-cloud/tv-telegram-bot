'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { applyGates, toMarkdown } = require('./staging-audit.cjs');
const sha = '7a9e92d6078b1abb91cb64d1e9eed2e7908c5081';
const hash = 'a'.repeat(64);
const date = '2026-11-03';
function good() {
  return {
    source: { sha, session_date: date, as_of: '2026-11-03T15:00:00Z' },
    ci: {
      checkout_sha: sha,
      required_workflows: ['Engine 2 Shadow Tests'],
      runs: [{ name: 'Engine 2 Shadow Tests', head_sha: sha, status: 'completed',
        conclusion: 'success', created_at: '2026-11-03T10:00:00Z', id: 100 }],
    },
    render: {
      observer: {service_id: 'srv-db9bm0m7bikc73fece8g', branch: 'engine-v2-shadow-foundation-20261016', status: 'live', auto_deploy: false, deployed_sha: sha},
      cron: {service_id: 'crn-dbdknsl9fdbs73bfloi0', branch: 'engine-v2-shadow-foundation-20261016', status: 'live', auto_deploy: false, deployed_sha: sha},
    },
    session: {
      date, preopen_status: 'PREOPEN_PREPARED', price_policy: 'GOOGLE_LATEST_1000_MODEL_V1',
      decision_time_et: '10:02', source_timestamp_valid: true, carried_lot_count: 2,
      opening_0930_valid: true, carried_ownership_proven: true,
      google_same_session_valid: true, google_age_valid: true,
    },
    ledger: {
      session_date: date, snapshot_id: hash, database_identity_verified: true,
      read_only_transaction: true, single_writer_cron: true, single_run: true,
      unique_events_lots_outbox: true, restart_idempotency: true, accounting_reconciled: true,
    },
    sheet: {
      staging_workbook_identity: true, timezone: 'America/New_York',
      tabs: ['Portfolio', 'Open Positions', 'Closed Trades', 'Public Feed', 'Equity History', 'Engine 2 Quotes'],
      protected_formulas: true, immutable_history: true, accounting_parity: true,
      session_date: date, snapshot_id: hash,
    },
    api: {
      read_only_mode: true, no_store: true, exact_html: true,
      positions_amounts_parity: true, session_date: date, snapshot_id: hash,
    },
    resend: {
      audit_no_send: true, recipient_allowlisted: true, message_identity_verified: true,
      idempotency_verified: true, unauthorized_count: 0, delivery_status: 'DELIVERED',
    },
  };
}
function inspect(e, gate) {
  return applyGates(e).gates.find(g => g.gate === gate);
}
test('all simulated positive checks may pass logically but offline E2E never certifies LIVE', () => {
  const a = applyGates(good());
  assert.equal(a.evidence_logic_status, 'PASS');
  assert.equal(a.e2e_status, 'UNVERIFIED');
  assert.equal(a.cutover, 'NOT_AUTHORIZED');
  assert.equal(a.gates.length, 7);
});
test('prior head green is not evidence of exact head', () => {
  const e = good();
  e.ci.runs[0].head_sha = 'b'.repeat(40);
  assert.equal(inspect(e, 'GITHUB_EXACT_HEAD_CI').status, 'UNVERIFIED');
});
test('failed exact head run defeats earlier success', () => {
  const e = good();
  e.ci.runs.push({...e.ci.runs[0], id: 101, created_at: '2026-11-03T11:00:00Z', conclusion: 'failure'});
  assert.equal(inspect(e, 'GITHUB_EXACT_HEAD_CI').status, 'FAIL');
});
test('wrong Render revision always fails even if LIVE', () => {
  const e = good(); e.render.cron.deployed_sha = 'b'.repeat(40);
  assert.deepEqual(inspect(e, 'RENDER_DEPLOYED_REVISION').failures, ['cron_DEPLOYED_SHA']);
});
test('unknown Render evidence never fabricates a PASS', () => {
  const e = good(); delete e.render.cron;
  assert.equal(inspect(e, 'RENDER_DEPLOYED_REVISION').status, 'UNVERIFIED');
});
test('preopen exception and wrong date fail cron/market gate', () => {
  const e = good(); e.session.preopen_status = 'PREOPEN_PREPARATION_FAILED'; e.session.date = '2026-11-02';
  assert.equal(inspect(e, 'CRON_AND_MARKET_EVIDENCE').status, 'FAIL');
});
test('missing 09:30 OPEN for carried lots cannot be certified', () => {
  const e = good(); e.session.opening_0930_valid = false;
  assert.ok(inspect(e, 'CRON_AND_MARKET_EVIDENCE').failures.includes('OPENING_0930_EXACT_FOR_CARRIED'));
});
test('missing 09:30 evidence blocks unknown rather than inventing a price', () => {
  const e = good(); delete e.session.opening_0930_valid;
  assert.equal(inspect(e, 'CRON_AND_MARKET_EVIDENCE').status, 'UNVERIFIED');
});
test('fixed 09:40 policy is not silently converted to Google latest', () => {
  const e = good();
  e.session.price_policy = 'DELAYED_0940_MODEL_V1';
  e.session.bar_end_0940_valid = false;
  assert.ok(inspect(e, 'CRON_AND_MARKET_EVIDENCE').failures.includes('BAR_END_0940_EXACT'));
});
test('stale Google source is a fail, never a source-time workaround', () => {
  const e = good(); e.session.google_age_valid = false;
  assert.ok(inspect(e, 'CRON_AND_MARKET_EVIDENCE').failures.includes('GOOGLE_MAX_20_MIN_AGE'));
});
test('duplicated journal/outbox cannot pass', () => {
  const e = good(); e.ledger.unique_events_lots_outbox = false;
  assert.equal(inspect(e, 'POSTGRESQL_JOURNAL').status, 'FAIL');
});
test('missing database access remains UNVERIFIED', () => {
  const e = good(); e.ledger.database_identity_verified = null;
  assert.equal(inspect(e, 'POSTGRESQL_JOURNAL').status, 'UNVERIFIED');
});
test('staging workbook identity and protected formulas fail closed', () => {
  const e = good(); e.sheet.staging_workbook_identity = false; e.sheet.protected_formulas = false;
  assert.equal(inspect(e, 'PRIVATE_STAGING_SHEET').failures.length, 2);
});
test('missing expected staging tab is a FAIL', () => {
  const e = good(); e.sheet.tabs = ['Public Feed'];
  assert.equal(inspect(e, 'PRIVATE_STAGING_SHEET').status, 'FAIL');
});
test('API HTML mismatch or stale snapshot is a FAIL', () => {
  const e = good(); e.api.exact_html = false; e.api.snapshot_id = 'b'.repeat(64);
  assert.equal(inspect(e, 'SHADOW_API_HTML').failures.length, 2);
});
test('wrong recipient is a hard FAIL even if delivered', () => {
  const e = good(); e.resend.recipient_allowlisted = false;
  assert.equal(inspect(e, 'RESEND_DELIVERY').status, 'FAIL');
});
test('positive unauthorized recipient count is FAIL', () => {
  const e = good(); e.resend.unauthorized_count = 1;
  assert.equal(inspect(e, 'RESEND_DELIVERY').status, 'FAIL');
});
test('accepted is not delivered, and EMAIL_DISABLED is not delivered', () => {
  for (const status of ['ACCEPTED_NOT_DELIVERED', 'EMAIL_DISABLED']) {
    const e = good(); e.resend.delivery_status = status;
    assert.equal(inspect(e, 'RESEND_DELIVERY').status, 'UNVERIFIED');
  }
});
test('bounced delivery fails and preserves no-send audit contract', () => {
  const e = good(); e.resend.delivery_status = 'BOUNCED';
  assert.equal(inspect(e, 'RESEND_DELIVERY').status, 'FAIL');
});
test('untrusted extra fields never leak credentials or contents into report', () => {
  const e = good(); e.resend.api_key = 'secret-value'; e.api.html = 'private-user-data'; e.ci.runs[0].logs = 'malicious prompt-injection';
  const result = JSON.stringify(applyGates(e));
  assert.equal(result.includes('secret-value'), false);
  assert.equal(result.includes('private-user-data'), false);
  assert.equal(result.includes('malicious prompt-injection'), false);
});
test('Markdown output is derived from allowlisted gates only', () => {
  const md = toMarkdown(applyGates(good()));
  assert.match(md, /E2E: UNVERIFIED/);
  assert.match(md, /Cutover: NOT AUTHORIZED/);
});
