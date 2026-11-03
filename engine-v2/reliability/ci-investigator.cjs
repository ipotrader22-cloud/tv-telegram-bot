'use strict';
// Read-only, fixed-vocabulary CI diagnosis. Logs/comments are UNTRUSTED data.
// No arbitrary commands, patches, external requests, pushes, deploys or mail sends.
const fs = require('node:fs');
const SHA = /^[a-f0-9]{40}$/;
const SAFE_ERROR = 'CURRENT_OPENING_COVERAGE_INCOMPLETE';
const TEST_NAME = 'Google cycle closes first using each stock source time, not a common fabricated cutoff';
const TEST_PATH = 'engine-v2/google-quote-provider.test.cjs';
const MAX_SIZE = 16384;
const MAX_ATTEMPTS = 1;
function investigate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { status: 'UNVERIFIED', reason: 'INVALID_INPUT', writes_performed: false };
  const run = input.run || {};
  if (!SHA.test(run.head_sha || '') || run.conclusion !== 'failure' ||
      !Number.isSafeInteger(run.id) || run.id < 1)
    return { status: 'UNVERIFIED', reason: 'FAILURE_RUN_NOT_VERIFIED', writes_performed: false };
  if ((input.attempts ?? 0) >= MAX_ATTEMPTS)
    return { status: 'BLOCKED', reason: 'TRIAL_ATTEMPT_LIMIT', writes_performed: false };
  if (input.log && (typeof input.log !== 'string' || input.log.length > MAX_SIZE))
    return { status: 'BLOCKED', reason: 'LOG_INPUT_EXCEEDS_BOUND', writes_performed: false };
  const observed = input.observation || {};
  if (observed.error_code !== SAFE_ERROR ||
      observed.test_name !== TEST_NAME ||
      observed.test_file !== TEST_PATH)
    return {
      status: 'UNVERIFIED', reason: 'UNKNOWN_FAILURE_SIGNATURE',
      run_id: run.id, source_sha: run.head_sha, writes_performed: false,
    };
  return {
    status: 'DIAGNOSTIC_HYPOTHESIS',
    run_id: run.id, source_sha: run.head_sha,
    normalized_error: SAFE_ERROR,
    affected_test: TEST_PATH,
    boundary: 'TEST_FIXTURE_ONLY',
    candidate_root_cause: 'MISSING_EXACT_0930_OPEN_IN_CARRIED_LOT_TEST_FIXTURE',
    bounded_repair: 'Supply exact same-session 09:30 RTH OPEN and source identity for the carried lot in this test fixture only.',
    independent_verification: [
      'node --test engine-v2/google-quote-provider.test.cjs',
      'node --test engine-v2/*.test.cjs',
    ],
    forbidden_paths: ['app.js', 'bridge/**', 'pine/**', 'engine-v2/delayed-model-cycle.cjs', 'engine-v2/clean-ledger.cjs'],
    writes_performed: false,
    agent_write_authorized: false,
    next_attempts_permitted: 0,
    note: 'This is a constrained diagnosis, not a production strategy fix or proof of live provider data.',
  };
}
function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== '--input') {
    process.stderr.write('Usage: ci-investigator.cjs --input <sanitized-fixture.json>\n');
    return 2;
  }
  let body;
  try {
    const file = fs.statSync(args[1]);
    if (file.size > MAX_SIZE) throw new Error('too large');
    body = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  } catch {
    process.stdout.write(JSON.stringify({status:'UNVERIFIED',reason:'INVALID_INPUT',writes_performed:false})+'\n');
    return 2;
  }
  const result = investigate(body);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.status === 'DIAGNOSTIC_HYPOTHESIS' ? 0 : 2;
}
if (require.main === module) process.exitCode = main();
module.exports = { investigate, MAX_SIZE, MAX_ATTEMPTS };
