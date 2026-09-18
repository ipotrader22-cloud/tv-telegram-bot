"use strict";
const assert=require("assert");
const fs=require("fs");
const offer=require("../lib/website-commercial-offer");
const pricing=require("../website_conversion_pricing_refinement");

assert.strictEqual(offer.DAY_TRIAL_DAYS,30);
assert.strictEqual(offer.SINGLE_SYSTEM_PRICE_MONTHLY,49);
assert.strictEqual(offer.THREE_SYSTEM_BUNDLE_PRICE_MONTHLY,99);
assert.strictEqual(offer.THREE_SEPARATE_SYSTEMS_PRICE_MONTHLY,147);
assert.strictEqual(offer.BUNDLE_SAVINGS_MONTHLY,48);
assert(offer.BUNDLE_REQUEST_TEXT.includes('$99/month Three-System Bundle'));
assert(offer.BUNDLE_REQUEST_TEXT.includes('Day Trading, Swing Trading, and Options'));
for(const system of offer.SYSTEMS){
  const text=offer.singleSystemRequestText(system.label);
  assert(text.includes('$49/month Single System plan'));
  assert(text.includes(system.label));
  assert(offer.singleSystemRequestUrl(system.label).startsWith('https://t.me/tradervip22?text='));
}

const html=pricing.renderPricingMain('swing-trading');
assert(html.includes('Choose one system or follow all three.'));
assert(html.includes('30 days free'));
assert(html.includes('Day Trading Telegram signals'));
assert(html.includes('$49<small>/month</small>'));
assert(html.includes('$99<small>/month</small>'));
assert(html.includes('$147/month'));
assert(html.includes('$48/month less'));
assert(html.includes('A request, not a fake checkout.'));
assert(html.includes('Free viewer access is separate.'));
assert(html.includes('does not implement an automatic checkout or trial-to-paid conversion'));
assert(html.includes('Swing and Options Telegram delivery is not included'));
assert(html.includes('class="vx-price-system is-selected"'));
assert(!/credit card required|auto.?renew|automatically billed/i.test(html));

const base='<!doctype html><html><head><title>Old</title></head><body><header>KEEP</header><main>OLD</main><footer>FOOT</footer></body></html>';
const refined=pricing.refinePricing(base,'options');
assert(refined.includes('<title>Vixale | Pricing</title>'));
assert(refined.includes('KEEP'));
assert(refined.includes('FOOT'));
assert(!refined.includes('>OLD<'));
assert(refined.includes('@media(max-width:600px)'));

const packageJson=JSON.parse(fs.readFileSync(require.resolve('../package.json'),'utf8'));
assert(packageJson.scripts.start.startsWith('node -r ./website_conversion_pricing_refinement.js -r ./website_conversion_results_refinement.js'));
console.log('Issue #123 PR5 pricing regression PASS');
