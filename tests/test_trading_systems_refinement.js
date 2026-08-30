'use strict';

const assert = require('assert');
const {
  GUIDE_PATH,
  SWING_PATH,
  refineTradingSystemsHtml,
} = require('../website_trading_systems_refinement');

const sample = `<!doctype html><html><head></head><body>
<nav><div class="nav-links"><a href="/">Home</a></div></nav>
<section class="wrap section horizon-section" id="day-trading"></section>
<section class="wrap section horizon-section" id="swing-trading">
  <div>ATR / % based targets</div>
  <div>One Swing Trading section. No Daily / Weekly split.</div>
</section>
<section class="wrap section horizon-section" id="market-coverage"></section>
</body></html>`;

const refined = refineTradingSystemsHtml(sample);
assert(refined.includes('Beginner Guide'));
assert(refined.includes(`href="${GUIDE_PATH}"`));
assert(refined.includes('Vixale Swing System'));
assert(refined.includes(`href="${SWING_PATH}"`));
assert(refined.includes(`${GUIDE_PATH}#swing-trading`));
assert(refined.includes('+10% from the actual entry price.'));
assert(refined.includes('5% stop level, evaluated on the daily close.'));
assert(refined.includes('9:45–10:00 AM ET'));
assert(refined.includes('scanner identifies symbols'));
assert(refined.includes('no longer meet the selection criteria'));
assert(!refined.includes('ATR / % based targets'));
assert(!refined.includes('No Daily / Weekly split'));
assert.strictEqual(refineTradingSystemsHtml(refined), refined, 'refinement must be idempotent');

console.log('Trading Systems refinement contract: PASS');
