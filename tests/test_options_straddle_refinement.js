'use strict';

const assert = require('assert');
const { refineOptionsStraddleHtml } = require('../website_options_straddle_refinement');

const source = `
<h3>Watch → Straddle → +10% → Follow Updates</h3>
<span>Enter the specified call + put combination in your broker platform.</span>
<span>Place the profit-taking limit at +10% above total straddle debit.</span>
<code>1 SPY straddle @ $10.00 debit = $1,000 · TGT $11.00</code>
<span>Target: +$100</span>
<strong>Open the straddle</strong>
<p>Use your broker platform to open the specified call and put combination from the published instruction.</p>
<strong>Place a +10% target</strong>
<p>Set the profit-taking limit 10% above the total debit paid for the straddle.</p>
<h3>SPY straddle example</h3>
<div>1 SPY STRADDLE @ $10.00 TOTAL DEBIT<br>100× multiplier = $1,000 cost</div>
<div><span>+10% target value</span><b>$11.00</b></div>
<div><span>Target proceeds</span><b>$1,100</b></div>
<div><span>If target fills</span><b class="positive">+$100</b></div>
<div>Options results depend on actual fills, bid/ask spreads, commissions, and the exact contracts specified in the signal.</div>
<div>6:00–8:30 PM ET → open straddle → +10% target → follow hedge/exit updates.</div>`;

const refined = refineOptionsStraddleHtml(source);

for (const required of [
  'Sell ES Straddle',
  'SELL 1 ES straddle @ 33.00 credit',
  'BUY TO CLOSE @ 29.75',
  'ES multiplier = 50',
  '33.00 × 0.90 = 29.70',
  '29.75 (nearest 0.25)',
  '+$162.50',
  'entry credit minus the buyback price, multiplied by 50 for ES',
]) assert(refined.includes(required), `missing: ${required}`);

for (const forbidden of [
  'SPY straddle example',
  'TOTAL DEBIT',
  '100× multiplier',
  'above total straddle debit',
  'open straddle → +10% target',
]) assert(!refined.includes(forbidden), `obsolete long-straddle copy remains: ${forbidden}`);

assert.strictEqual(refineOptionsStraddleHtml(refined), refined, 'refinement must be idempotent');
console.log('ES short straddle guide refinement: PASS');
