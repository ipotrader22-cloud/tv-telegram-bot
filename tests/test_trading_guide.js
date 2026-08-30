'use strict';

const assert = require('assert');
const {
  GUIDE_PATH,
  PDF_ROUTE,
  injectTradingSystemsGuide,
  renderTradingGuideHtml,
} = require('../website_trading_guide');

const sampleTradingSystemsHtml = `<!doctype html><html><body>
<section class="wrap section horizon-section" id="day-trading"></section>
<section class="wrap section horizon-section" id="swing-trading"></section>
<section class="wrap section horizon-section" id="market-coverage"></section>
</body></html>`;

const injected = injectTradingSystemsGuide(sampleTradingSystemsHtml);
assert(injected.includes('How to Trade Vixale'));
assert(injected.includes(GUIDE_PATH));
assert(injected.includes(PDF_ROUTE));
assert.strictEqual((injected.match(/id="vx-how-to-trade-title"/g) || []).length, 1);
assert.strictEqual(injectTradingSystemsGuide(injected), injected, 'guide injection must be idempotent');

const guide = renderTradingGuideHtml();
for (const required of [
  'Prime / Edge',
  'AAPL',
  'MSFT',
  'SPY',
  '9:45–10:00 AM ET',
  '6:00–8:30 PM ET',
  'Active Portfolio',
  'Download Trading Guide (PDF)',
]) {
  assert(guide.includes(required), `missing guide content: ${required}`);
}

for (const forbidden of ['READY NOW', 'status NEW']) {
  assert(!guide.includes(forbidden), `obsolete Swing status leaked into guide: ${forbidden}`);
}

console.log('Trading guide presentation contract: PASS');
