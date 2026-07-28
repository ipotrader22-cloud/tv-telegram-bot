'use strict';

function createBrokerEodCallbackRegistry() {
  const inFlight = new Set();
  const completed = new Set();

  return {
    reserve(key) {
      if (completed.has(key)) return { accepted: false, reason: 'completed' };
      if (inFlight.has(key)) return { accepted: false, reason: 'in_flight' };
      inFlight.add(key);
      return { accepted: true, reason: 'reserved' };
    },

    complete(key) {
      inFlight.delete(key);
      completed.add(key);
    },

    release(key) {
      inFlight.delete(key);
    },

    state(key) {
      if (completed.has(key)) return 'completed';
      if (inFlight.has(key)) return 'in_flight';
      return 'available';
    },
  };
}

function isRetryableFailure(result) {
  return Boolean(
    result &&
    typeof result === 'object' &&
    (result.retryable === true || result.retryable_failure === true) &&
    (result.ok === false || result.success === false)
  );
}

async function runBrokerEodCallback(registry, key, processCallback) {
  const reservation = registry.reserve(key);
  if (!reservation.accepted) {
    return {
      processed: false,
      reason: reservation.reason,
    };
  }

  try {
    const result = await processCallback();
    if (isRetryableFailure(result)) {
      const error = new Error(result.error || result.reason || 'retryable broker EOD callback failure');
      error.retryable = true;
      throw error;
    }

    registry.complete(key);
    return {
      processed: true,
      reason: 'completed',
      result,
    };
  } catch (error) {
    registry.release(key);
    throw error;
  }
}

module.exports = {
  createBrokerEodCallbackRegistry,
  runBrokerEodCallback,
};
