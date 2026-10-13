'use strict';

// Research identity reservation only. There is deliberately no enable switch:
// an approved freeze and live quantity contract require a separately reviewed PR.
function isSmioRsiPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return ['system_id', 'strategy_id', 'strategy', 'setup_id'].some(key =>
    typeof data[key] === 'string' && /SMIO_RSI/i.test(data[key])
  );
}

module.exports = { isSmioRsiPayload };
