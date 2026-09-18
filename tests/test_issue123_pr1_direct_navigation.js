"use strict";

const assert = require("assert");
const nav = require("../website_conversion_navigation_refinement");

const base = `<!doctype html><html><head><title>Vixale</title></head><body><nav><a class="brand" href="/">VIXALE</a><div class="nav-links"><a href="/trading-systems">Trading Systems</a><a href="/results">Results</a><a href="/services">Services</a><a href="/trading-guide">Help</a><a href="/dashboard">Log In</a><a href="/access">Request Free Access</a></div></nav><main>content</main><footer><nav class="vx-public-secondary-nav"><a href="/about">About</a></nav></footer></body></html>`;

const day = nav.refineConversionNavigation(base, nav.DAY_PATH);
for (const [href, label] of [
  [nav.DAY_PATH, "Day Trading"],
  [nav.SWING_PATH, "Swing Trading"],
  [nav.OPTIONS_PATH, "Options"],
  [nav.RESULTS_PATH, "Results"],
  [nav.PRICING_PATH, "Pricing"],
]) {
  assert(day.includes(`href="${href}"`), `missing ${href}`);
  assert(day.includes(`>${label}</a>`), `missing ${label}`);
}
assert(day.includes(`href="${nav.DAY_PATH}" aria-current="page">Day Trading</a>`));
assert(day.includes('class="vx-public-nav-login" href="/dashboard">Log In</a>'));
assert(day.includes(`href="${nav.DAY_TRIAL_URL}"`));
assert(day.includes('>Get 30 Days Free</a>'));
assert(nav.DAY_TRIAL_TEXT.includes("30-day free Day Trading Telegram signals trial"));
assert(!nav.DAY_TRIAL_TEXT.toLowerCase().includes("futures"));
assert(!day.includes('>Trading Systems</a>'), "Trading Systems must not remain primary nav");
assert(!day.includes('>Request Free Access</a>'), "viewer-access CTA must not remain primary nav");
assert(day.includes('<a href="/about">About</a><a href="/services">Services</a><a href="/trading-guide">Help</a>'));
assert(day.includes('grid-template-columns:repeat(3,minmax(0,1fr))'), "mobile system switcher must keep all three visible");
assert(day.includes('.vx-direct-page-nav{display:none}'), "secondary desktop nav may collapse on mobile");
assert.strictEqual(nav.refineConversionNavigation(day, nav.DAY_PATH), day, "refinement must be idempotent");
assert.strictEqual(nav.refineConversionNavigation(base, "/dashboard"), base, "protected route must not be rewritten");

const swing = nav.refineConversionNavigation(base, nav.SWING_PATH);
assert(swing.includes(`href="${nav.SWING_PATH}" aria-current="page">Swing Trading</a>`));
const options = nav.refineConversionNavigation(base, nav.OPTIONS_PATH);
assert(options.includes(`href="${nav.OPTIONS_PATH}" aria-current="page">Options</a>`));
const results = nav.refineConversionNavigation(base, nav.RESULTS_PATH);
assert(results.includes(`href="${nav.RESULTS_PATH}" aria-current="page">Results</a>`));
const pricing = nav.refineConversionNavigation(base, nav.PRICING_PATH);
assert(pricing.includes(`href="${nav.PRICING_PATH}" aria-current="page">Pricing</a>`));

console.log("Issue #123 PR1 direct navigation: PASS");
