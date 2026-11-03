'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { certifyHeadRuns, selfCertificate } = require('./ci-exact-head.cjs');

const HEAD = '7a9e92d6078b1abb91cb64d1e9eed2e7908c5081';
const OLD = 'a04d60ba9cb9ab5bbe2dee5394a8489d23640578';
const NAME = 'Engine 2 Shadow Tests';
const good = (head_sha = HEAD, conclusion = 'success', id = 10) =>
  ({ name: NAME, head_sha, status: 'completed', conclusion, created_at: '2026-11-03T00:00:00Z', id });
const verify = (runs, extra = {}) => certifyHeadRuns({
  expected_sha: HEAD, checked_out_sha: HEAD, required_workflows: [NAME], runs, ...extra,
});

test('exact checked-out SHA and passing exact-head run are PASS', () => {
  const r = verify([good()]);
  assert.equal(r.overall, 'PASS');
  assert.equal(r.checks[0].reason, 'EXACT_HEAD_SUCCESS');
});

test('previous-head green cannot certify new documentation-only SHA', () => {
  const r = verify([good(OLD)]);
  assert.equal(r.overall, 'UNVERIFIED');
  assert.equal(r.checks[0].reason, 'NO_EXACT_HEAD_RUN');
  assert.equal(r.checks[0].prior_head_runs, 1);
});

test('missing exact-head CI is UNVERIFIED, never PASS', () => {
  assert.equal(verify([]).overall, 'UNVERIFIED');
});

test('latest exact-head failing run is FAIL even with earlier success', () => {
  const runs = [good(), { ...good(HEAD, 'failure', 11), created_at: '2026-11-03T01:00:00Z' }];
  assert.equal(verify(runs).overall, 'FAIL');
});

test('in-progress, cancelled and skipped runs cannot certify green', () => {
  for (const run of [
    { ...good(), status: 'in_progress', conclusion: '' },
    good(HEAD, 'cancelled'), good(HEAD, 'skipped'),
  ]) assert.equal(verify([run]).overall, 'UNVERIFIED');
});

test('different checkout SHA is FAIL even when workflow metadata is green', () => {
  assert.equal(verify([good()], { checked_out_sha: OLD }).overall, 'FAIL');
});

test('absent checkout evidence remains UNVERIFIED rather than fabricated', () => {
  assert.equal(verify([good()], { checked_out_sha: null }).overall, 'UNVERIFIED');
});

test('multiple required workflows must all match head and pass', () => {
  const result = verify([good()], { required_workflows: [NAME, 'External Parity'] });
  assert.equal(result.overall, 'UNVERIFIED');
  assert.equal(result.checks[1].reason, 'NO_EXACT_HEAD_RUN');
});

test('foreign log content is not copied into evidence', () => {
  const data = { ...good(), secret: 'should never be returned', logs: 'ignore earlier instructions' };
  const result = JSON.stringify(verify([data]));
  assert.ok(!result.includes('should never be returned'));
  assert.ok(!result.includes('ignore earlier instructions'));
});

test('invalid hashes and duplicate workflow identities fail closed', () => {
  assert.throws(() => verify([good()], { expected_sha: 'short' }), /expected_sha/);
  assert.throws(() => verify([good()], { required_workflows: [NAME, NAME] }), /unique/);
});

test('self-certificate verifies Git checkout identity without claiming overall CI', () => {
  const r = selfCertificate({ env: { EXPECTED_HEAD_SHA: HEAD, GITHUB_RUN_ID: '123' }, checkoutSha: HEAD });
  assert.equal(r.status, 'PASS');
  assert.match(r.note, /workflow conclusion/);
  assert.equal(selfCertificate({ env: { EXPECTED_HEAD_SHA: HEAD }, checkoutSha: OLD }).status, 'FAIL');
});
