'use strict';

const assert = require('node:assert/strict');
const {
  createBrokerEodCallbackRegistry,
  runBrokerEodCallback,
} = require('../lib/broker-eod-callbacks');

async function main() {
  const registry = createBrokerEodCallbackRegistry();
  const key = '2026-07-27:SPY:SHREK_1_4';
  let releaseFirstPublication;
  let firstPublicationStarted = false;

  const firstAttempt = runBrokerEodCallback(registry, key, async () => {
    firstPublicationStarted = true;
    await new Promise((resolve) => {
      releaseFirstPublication = resolve;
    });
    return {
      ok: false,
      retryable: true,
      reason: 'simulated downstream publication failure',
    };
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(firstPublicationStarted, true, 'first valid callback should begin processing');
  assert.equal(registry.state(key), 'in_flight', 'key should be reserved while processing');

  const concurrentDuplicate = await runBrokerEodCallback(registry, key, async () => {
    throw new Error('concurrent duplicate must not run');
  });
  assert.deepEqual(
    concurrentDuplicate,
    { processed: false, reason: 'in_flight' },
    'concurrent duplicate should be ignored while the first callback is active'
  );

  releaseFirstPublication();
  await assert.rejects(firstAttempt, /simulated downstream publication failure/);
  assert.equal(registry.state(key), 'available', 'failed publication should release the key');

  let retryPublicationCount = 0;
  const retry = await runBrokerEodCallback(registry, key, async () => {
    retryPublicationCount += 1;
    return { ok: true };
  });
  assert.equal(retry.processed, true, 'same callback key should be allowed to retry');
  assert.equal(retryPublicationCount, 1, 'retry should execute publication exactly once');
  assert.equal(registry.state(key), 'completed', 'successful retry should complete the key');

  const thirdDuplicate = await runBrokerEodCallback(registry, key, async () => {
    throw new Error('completed duplicate must not run');
  });
  assert.deepEqual(
    thirdDuplicate,
    { processed: false, reason: 'completed' },
    'duplicate after success should be ignored'
  );

  console.log('broker EOD callback idempotency simulation passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
