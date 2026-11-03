'use strict';
// Offline, read-only evidence compiler. Imported JSON is untrusted: no live E2E PASS.
const fs = require('node:fs');
const path = require('node:path');

const SHA = /^[a-f0-9]{40}$/;
const DATE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const STATES = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', UNVERIFIED: 'UNVERIFIED' });
const REQUIRED_TABS = ['Portfolio', 'Open Positions', 'Closed Trades', 'Public Feed', 'Equity History', 'Engine 2 Quotes'];
const SERVICES = Object.freeze({
  observer: 'srv-db9bm0m7bikc73fece8g',
  cron: 'crn-dbdknsl9fdbs73bfloi0',
});
const POLICIES = new Set(['DELAYED_0940_MODEL_V1', 'GOOGLE_LATEST_1000_MODEL_V1']);

function flag(name, value) {
  return { name, status: value === true ? STATES.PASS :
    value === false ? STATES.FAIL : STATES.UNVERIFIED };
}
function equal(name, actual, expected) {
  return flag(name, actual === undefined || actual === null || expected === undefined || expected === null ?
    null : actual === expected);
}
function group(name, results) {
  const status = results.some(x => x.status === STATES.FAIL) ? STATES.FAIL :
    results.every(x => x.status === STATES.PASS) ? STATES.PASS : STATES.UNVERIFIED;
  return {
    gate: name, status,
    failures: results.filter(x => x.status === STATES.FAIL).map(x => x.name),
    unknowns: results.filter(x => x.status === STATES.UNVERIFIED).map(x => x.name),
  };
}
function verified(value) {
  return typeof value === 'boolean' ? value : null;
}
function isSha(s) { return SHA.test(s || ''); }
function parseMinute(v) {
  if (typeof v !== 'string' || !/^\d\d:\d\d$/.test(v)) return null;
  const h = Number(v.slice(0, 2)), m = Number(v.slice(3));
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}
function applyGates(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('evidence must be an object');
  const source = input.source || {}, ci = input.ci || {}, render = input.render || {},
    session = input.session || {}, ledger = input.ledger || {},
    sheet = input.sheet || {}, api = input.api || {}, resend = input.resend || {};
  const sourceSHA = source.sha, date = source.session_date;
  const ciRuns = Array.isArray(ci.runs) ? ci.runs : [];
  const required = Array.isArray(ci.required_workflows) && ci.required_workflows.length ?
    ci.required_workflows : ['Engine 2 Shadow Tests', 'Engine 2 Exact Head Certification (isolated)'];
  const ciParts = [
    flag('SOURCE_SHA_VALID', isSha(sourceSHA)),
    equal('CHECKOUT_SHA_MATCH', ci.checkout_sha, sourceSHA),
  ];
  for (const workflow of required) {
    const matches = ciRuns.filter(r => r && r.name === workflow && r.head_sha === sourceSHA);
    const last = matches.slice().sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
      Number(b.id || 0) - Number(a.id || 0) ||
      Number(b.run_attempt || 0) - Number(a.run_attempt || 0))[0];
    const pass = !last ? null : last.status !== 'completed' ? null :
      last.conclusion === 'success' ? true :
      ['failure', 'timed_out', 'action_required'].includes(last.conclusion) ? false : null;
    ciParts.push(flag('EXACT_HEAD_CI_' + workflow.replace(/[^a-z0-9]/gi, '_'), pass));
  }

  const renderParts = [];
  for (const [kind, expectedID] of Object.entries(SERVICES)) {
    const svc = render[kind] || {};
    renderParts.push(equal(kind + '_SERVICE_ID', svc.service_id, expectedID));
    renderParts.push(equal(kind + '_BRANCH', svc.branch, 'engine-v2-shadow-foundation-20261016'));
    renderParts.push(equal(kind + '_LIVE', svc.status, 'live'));
    renderParts.push(flag(kind + '_NO_AUTODEPLOY', verified(svc.auto_deploy) === null ?
      null : !svc.auto_deploy));
    renderParts.push(equal(kind + '_DEPLOYED_SHA', svc.deployed_sha, sourceSHA));
  }

  const phase = session.preopen_status;
  const decisionMinute = parseMinute(session.decision_time_et);
  const expectedSource = session.price_policy;
  const pricePolicyValid = expectedSource === undefined || expectedSource === null ? null : POLICIES.has(expectedSource);
  const carried = Number.isInteger(session.carried_lot_count) && session.carried_lot_count >= 0 ?
    session.carried_lot_count : null;
  const sessionParts = [
    equal('SESSION_DATE', session.date, date),
    flag('SESSION_DATE_VALID', DATE.test(date || '') && DATE.test(session.date || '') ?
      true : !session.date ? null : false),
    equal('PREOPEN_PREPARED', phase, 'PREOPEN_PREPARED'),
    flag('PRICE_POLICY_APPROVED', pricePolicyValid),
    flag('SOURCE_TIMESTAMP_VERIFIED', verified(session.source_timestamp_valid)),
    flag('DECISION_WINDOW_1000_1005',
      decisionMinute === null ? null : decisionMinute >= 600 && decisionMinute <= 605),
    flag('CARRIED_LOT_COUNT_KNOWN', carried === null ? null : true),
    flag('OPENING_0930_EXACT_FOR_CARRIED',
      carried === null ? null : carried === 0 ? true : verified(session.opening_0930_valid)),
    flag('CARRIED_OWNERSHIP_PROVEN',
      carried === null ? null : carried === 0 ? true : verified(session.carried_ownership_proven)),
  ];
  if (expectedSource === 'DELAYED_0940_MODEL_V1') {
    sessionParts.push(flag('BAR_END_0940_EXACT', verified(session.bar_end_0940_valid)));
  }
  if (expectedSource === 'GOOGLE_LATEST_1000_MODEL_V1') {
    sessionParts.push(flag('GOOGLE_SAME_RTH_SESSION', verified(session.google_same_session_valid)));
    sessionParts.push(flag('GOOGLE_MAX_20_MIN_AGE', verified(session.google_age_valid)));
  }

  const ledgerParts = [
    flag('DATABASE_IDENTITY', verified(ledger.database_identity_verified)),
    flag('READ_ONLY_TRANSACTION', verified(ledger.read_only_transaction)),
    flag('SINGLE_WRITER_CRON', verified(ledger.single_writer_cron)),
    flag('SINGLE_RUN', verified(ledger.single_run)),
    flag('UNIQUE_EVENTS_LOTS_OUTBOX', verified(ledger.unique_events_lots_outbox)),
    flag('RESTART_RETRY_IDEMPOTENCY', verified(ledger.restart_idempotency)),
    flag('MODEL_ACCOUNTING_RECONCILED', verified(ledger.accounting_reconciled)),
    equal('LEDGER_DATE', ledger.session_date, date),
  ];
  const sheetTabs = Array.isArray(sheet.tabs) ? sheet.tabs : [];
  const sheetParts = [
    flag('PRIVATE_STAGING_WORKBOOK_ID', verified(sheet.staging_workbook_identity)),
    equal('SHEET_TIMEZONE', sheet.timezone, 'America/New_York'),
    flag('REQUIRED_STAGING_TABS', sheet.tabs === undefined ? null :
      REQUIRED_TABS.every(t => sheetTabs.includes(t))),
    flag('PROTECTED_SPILL_FORMULAS', verified(sheet.protected_formulas)),
    flag('CLOSED_EQUITY_HISTORY_IMMUTABLE', verified(sheet.immutable_history)),
    flag('CASH_EQUITY_PNL_PARITY', verified(sheet.accounting_parity)),
    equal('SHEET_SESSION_DATE', sheet.session_date, date),
    equal('SHEET_VS_LEDGER_SNAPSHOT', sheet.snapshot_id, ledger.snapshot_id),
  ];
  const apiParts = [
    flag('READ_ONLY_MODE', verified(api.read_only_mode)),
    flag('HTTP_NO_STORE', verified(api.no_store)),
    flag('EXACT_UNCACHED_HTML', verified(api.exact_html)),
    flag('POSITION_AMOUNTS_PARITY', verified(api.positions_amounts_parity)),
    equal('API_VS_LEDGER_SNAPSHOT', api.snapshot_id, ledger.snapshot_id),
    equal('API_SESSION_DATE', api.session_date, date),
  ];
  const resendState = resend.delivery_status;
  const resendParts = [
    flag('AUDIT_PERFORMED_NO_SEND', verified(resend.audit_no_send)),
    flag('EXACT_STAGING_RECIPIENT', verified(resend.recipient_allowlisted)),
    flag('EXACT_FROM_SUBJECT_BODY', verified(resend.message_identity_verified)),
    flag('DURABLE_IDEMPOTENCY', verified(resend.idempotency_verified)),
    flag('ZERO_UNAUTHORIZED_RECIPIENTS', resend.unauthorized_count === undefined ?
      null : Number.isInteger(resend.unauthorized_count) && resend.unauthorized_count === 0),
    flag('PROVIDER_DELIVERED',
      resendState === undefined || resendState === 'EMAIL_DISABLED' || resendState === 'ACCEPTED_NOT_DELIVERED' ?
        null : resendState === 'DELIVERED' ? true :
          ['BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED'].includes(resendState) ? false : null),
  ];

  const gates = [
    group('GITHUB_EXACT_HEAD_CI', ciParts),
    group('RENDER_DEPLOYED_REVISION', renderParts),
    group('CRON_AND_MARKET_EVIDENCE', sessionParts),
    group('POSTGRESQL_JOURNAL', ledgerParts),
    group('PRIVATE_STAGING_SHEET', sheetParts),
    group('SHADOW_API_HTML', apiParts),
    group('RESEND_DELIVERY', resendParts),
  ];
  const logicStatus = gates.some(g => g.status === STATES.FAIL) ? STATES.FAIL :
    gates.every(g => g.status === STATES.PASS) ? STATES.PASS : STATES.UNVERIFIED;
  // A portable metadata file, even if it claims LIVE, cannot prove its own provider provenance.
  // Only independently authenticated live provider adapters may promote an E2E claim.
  const overall = logicStatus === STATES.FAIL ? STATES.FAIL : STATES.UNVERIFIED;
  return {
    report_version: 1,
    as_of: typeof source.as_of === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(source.as_of) ? source.as_of : null,
    source_sha: isSha(sourceSHA) ? sourceSHA : null,
    research_session_date: DATE.test(date || '') ? date : null,
    price_policy: POLICIES.has(expectedSource) ? expectedSource : null,
    decision_at: typeof session.decision_at === 'string' ? session.decision_at : null,
    published_at: typeof api.published_at === 'string' ? api.published_at : null,
    snapshot_id: /^[a-f0-9]{64}$/i.test(ledger.snapshot_id || '') ? ledger.snapshot_id : null,
    gates,
    evidence_logic_status: logicStatus,
    e2e_status: overall,
    cutover: 'NOT_AUTHORIZED',
    provenance: 'OFFLINE_UNTRUSTED_EVIDENCE',
    note: 'Provider observations must be authenticated independently; offline fixtures never certify live staging.',
  };
}
function toMarkdown(report) {
  const lines = [
    '# Engine 2 read-only evidence gates',
    '',
    'Evidence origin: OFFLINE / UNTRUSTED. This report cannot authorize staging or production cutover.',
    '',
    'Source SHA: ' + (report.source_sha || 'UNVERIFIED'),
    'Session: ' + (report.research_session_date || 'UNVERIFIED'),
    'Logic: ' + report.evidence_logic_status + ' | E2E: ' + report.e2e_status + ' | Cutover: NOT AUTHORIZED',
    '',
    '| Gate | Status | Failures | Unknowns |', '| --- | --- | --- | --- |',
    ...report.gates.map(g => '| ' + g.gate + ' | ' + g.status + ' | ' +
      (g.failures.join(', ') || '—') + ' | ' + (g.unknowns.join(', ') || '—') + ' |'),
    '',
    'No writes, mail sends, or external provider calls were performed by this report compiler.',
  ];
  return lines.join('\n') + '\n';
}
function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== '--input')
    throw new Error('Usage: node staging-audit.cjs --input <sanitized-evidence.json>');
  const file = path.resolve(args[1]);
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const report = applyGates(input);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.stderr.write(toMarkdown(report));
  return report.evidence_logic_status === STATES.FAIL ? 1 : 2;
}
if (require.main === module) {
  try { process.exitCode = main(); }
  catch { process.stderr.write('STAGING_AUDIT_INPUT_INVALID\n'); process.exitCode = 2; }
}
module.exports = { STATES, REQUIRED_TABS, applyGates, toMarkdown, main };
