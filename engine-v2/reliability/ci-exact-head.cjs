'use strict';

// Reliability-only CI evidence verifier. This module never contacts external systems.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SHA = /^[0-9a-f]{40}$/;
const STATES = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', UNVERIFIED: 'UNVERIFIED' });

function validateSha(value, field) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new TypeError(field + ' must be an exact 40-character lowercase Git SHA');
  }
  return value;
}

function normalizeRun(run) {
  if (!run || typeof run !== 'object') return null;
  // Whitelist metadata; exclude log bodies, secrets, actor and external comments.
  return {
    name: typeof run.name === 'string' ? run.name : '',
    head_sha: typeof run.head_sha === 'string' ? run.head_sha : '',
    status: typeof run.status === 'string' ? run.status : '',
    conclusion: typeof run.conclusion === 'string' ? run.conclusion : '',
    created_at: typeof run.created_at === 'string' ? run.created_at : '',
    run_attempt: Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 ? run.run_attempt : 1,
    id: Number.isSafeInteger(run.id) ? run.id : 0,
  };
}

function certifyHeadRuns({ expected_sha, checked_out_sha, required_workflows, runs }) {
  validateSha(expected_sha, 'expected_sha');
  if (checked_out_sha !== undefined && checked_out_sha !== null) {
    validateSha(checked_out_sha, 'checked_out_sha');
  }
  if (!Array.isArray(required_workflows) || required_workflows.length === 0 ||
      !required_workflows.every(x => typeof x === 'string' && x.trim().length > 0) ||
      new Set(required_workflows).size !== required_workflows.length) {
    throw new TypeError('required_workflows must be unique non-empty workflow names');
  }
  if (!Array.isArray(runs)) throw new TypeError('runs must be an array');

  const checkout = checked_out_sha == null ? STATES.UNVERIFIED :
    checked_out_sha === expected_sha ? STATES.PASS : STATES.FAIL;
  const checks = required_workflows.map(name => {
    const seen = runs.map(normalizeRun).filter(r => r && r.name === name);
    const matching = seen.filter(r => r.head_sha === expected_sha);
    if (!matching.length) return { workflow: name, status: STATES.UNVERIFIED, reason: 'NO_EXACT_HEAD_RUN', prior_head_runs: seen.length };

    // Re-runs are ordered by attempt first, then run creation time/ID. Never let an old
    // green result mask the latest failed attempt on the exact expected source.
    matching.sort((a, b) => (b.created_at.localeCompare(a.created_at)) ||
      (b.id - a.id) || (b.run_attempt - a.run_attempt));
    const latest = matching[0];
    const status = latest.status === 'completed' ?
      latest.conclusion === 'success' ? STATES.PASS :
      ['failure', 'timed_out', 'action_required'].includes(latest.conclusion) ? STATES.FAIL : STATES.UNVERIFIED :
      STATES.UNVERIFIED;
    return { workflow: name, status, reason: status === STATES.PASS ? 'EXACT_HEAD_SUCCESS' :
      status === STATES.FAIL ? 'EXACT_HEAD_FAILED' : 'NOT_COMPLETED_SUCCESSFULLY', run_id: latest.id, run_attempt: latest.run_attempt };
  });
  const gateStatuses = [checkout, ...checks.map(c => c.status)];
  const overall = gateStatuses.includes(STATES.FAIL) ? STATES.FAIL :
    gateStatuses.every(s => s === STATES.PASS) ? STATES.PASS : STATES.UNVERIFIED;
  return { overall, expected_sha, checkout, checks };
}

function selfCertificate({ env = process.env, checkoutSha } = {}) {
  const expected_sha = validateSha(env.EXPECTED_HEAD_SHA, 'EXPECTED_HEAD_SHA');
  const checked_out_sha = checkoutSha || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  validateSha(checked_out_sha, 'checked_out_sha');
  const status = checked_out_sha === expected_sha ? STATES.PASS : STATES.FAIL;
  return {
    gate: 'CHECKOUT_HEAD_MATCH', status, expected_sha, checked_out_sha,
    github_run_id: /^\d+$/.test(env.GITHUB_RUN_ID || '') ? env.GITHUB_RUN_ID : null,
    github_run_attempt: /^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') ? env.GITHUB_RUN_ATTEMPT : null,
    observed_at: new Date().toISOString(),
    note: 'Checkout identity only. GitHub workflow conclusion and staging/provider gates require independent verification.'
  };
}

function main(argv = process.argv.slice(2), env = process.env) {
  if (!((argv.length === 1 && argv[0] === '--self') ||
        (argv.length === 2 && argv[0] === '--runs-file'))) {
    throw new Error('Usage: node ci-exact-head.cjs --self OR --runs-file <path>');
  }
  if (argv[0] === '--self') {
    const result = selfCertificate({ env });
    const output = path.resolve('engine-v2/out/reliability-ci-head.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    process.stdout.write('CHECKOUT_HEAD_MATCH=' + result.status + ' SHA=' + result.expected_sha + '\n');
    return result.status === STATES.PASS ? 0 : 1;
  }
  // This input is offline metadata generated by a separate read-only GitHub query.
  // It is never downloaded implicitly and may contain only non-secret run fields.
  const input = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const result = certifyHeadRuns(input);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.overall === STATES.PASS ? 0 : result.overall === STATES.UNVERIFIED ? 2 : 1;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (err) { process.stderr.write('CERTIFICATION_ERROR: ' + err.message + '\n'); process.exitCode = 1; }
}

module.exports = { STATES, certifyHeadRuns, selfCertificate, main };
