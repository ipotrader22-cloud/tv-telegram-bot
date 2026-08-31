'use strict';

const assert = require('assert');
const {
  STYLE_ID,
  refineTradingGuideStyle,
} = require('../website_trading_guide_style_refinement');

const sample = `<!doctype html><html><head><style>
.hero h1{font-size:74px;font-weight:800}.section-head h2{font-size:34px;font-weight:800}
</style></head><body>
<section class="hero"><div class="hero-grid"><div><div class="kicker">Beginner execution guide</div><h1>How to Trade Vixale</h1><p>Guide copy.</p></div><aside class="hero-card">Trading Guide</aside></div></section>
<section class="section"><div class="section-head"><div><h2>Receive. Execute. Manage.</h2></div></div><div class="guide-grid"><article class="guide-card">Steps</article><aside class="example"><h3>AAPL example</h3></aside></div></section>
</body></html>`;

const refined = refineTradingGuideStyle(sample);

assert(refined.includes(`id="${STYLE_ID}"`));
assert(refined.includes('.hero h1{margin:10px 0 16px;font-size:clamp(38px,4.4vw,56px)'));
assert(refined.includes('font-weight:500'));
assert(refined.includes('.section-head h2{'));
assert(refined.includes('.guide-card,.example{border-color:#dce7e1'));
assert(refined.includes('How to Trade Vixale'));
assert(refined.includes('Receive. Execute. Manage.'));
assert.strictEqual(refineTradingGuideStyle(refined), refined, 'style refinement must be idempotent');

console.log('Trading Guide site-style refinement contract: PASS');
