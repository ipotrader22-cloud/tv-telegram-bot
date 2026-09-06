"use strict";

const assert = require("assert");
const {
  STYLE_ID,
  TOP_MARKER,
  DAY_ANCHOR_ID,
  SWING_TRADING_PATH,
  OPTIONS_PATH,
  refineHomeSystemSelector,
} = require("../website_home_system_selector_refinement");

const sample = `<!doctype html><html><head><title>Vixale</title></head><body><main>
<section class="vx-home-hero"><div class="wrap"><div class="vx-home-hero-copy">
<a class="vx-home-hero-kicker" href="/dashboard">Vixale live dashboard</a>
<h1>Watch our trading systems live before you trade them.</h1>
<p class="vx-home-hero-lead">See active trade ideas, open trades, closed trades, and recorded results in one read-only dashboard.</p>
<div class="vx-home-hero-actions"><a href="#password-access">Request 7-Day Access</a><a href="/trading-systems">Explore Trading Systems</a></div>
<p class="vx-home-hero-proof">Read-only dashboard · Manual approval · Individual access code</p>
<p class="vx-home-hero-login">Already have access? <a href="/dashboard">Dashboard Login</a></p>
</div></div></section>
<section class="vx-home-day-trading" aria-labelledby="vx-home-day-title"><div class="wrap">
<div class="vx-home-day-head"><div><div class="vx-home-day-kicker">Live Day Trading</div><h2 id="vx-home-day-title">Day Trading System Status</h2></div></div>
<section class="vx-home-live-strip-wrap"><div>status</div></section>
<div class="vx-home-day-performance"><section class="vx-home-equity-preview">equity</section></div>
<section class="vx-home-other-systems"><div class="vx-home-other-grid">
<a class="vx-home-system-card" href="${SWING_TRADING_PATH}">Swing Trading</a>
<a class="vx-home-system-card" href="${OPTIONS_PATH}">Options</a>
</div></section>
</div></section>
<section id="password-access">Access</section>
</main></body></html>`;

const out = refineHomeSystemSelector(sample, "/");
assert(out.includes(TOP_MARKER));
assert(out.includes(`id="${DAY_ANCHOR_ID}"`));
assert(out.includes(`href="#${DAY_ANCHOR_ID}"`));
assert(out.includes(`href="${SWING_TRADING_PATH}"`));
assert(out.includes(`href="${OPTIONS_PATH}"`));
assert(out.includes("View Live Day Trading ↓"));
assert(out.includes("Explore Swing Trading →"));
assert(out.includes("Explore Options →"));
assert.strictEqual((out.match(/class="vx-home-system-card"/g) || []).length, 3, "top selector must contain exactly three system cards");
assert(!out.includes('class="vx-home-other-systems"'), "lower Swing/Options duplicate must be removed");
assert(out.indexOf('class="vx-home-system-stack"') < out.indexOf('class="vx-home-hero"'), "desktop DOM should place selector before hero");
assert(out.indexOf(TOP_MARKER) < out.indexOf(`id="${DAY_ANCHOR_ID}"`), "top selector/hero block must precede Live Day Trading");
assert(out.indexOf(`id="${DAY_ANCHOR_ID}"`) < out.indexOf('id="password-access"'), "Live Day Trading must remain above access form");
assert(out.includes("font-size:clamp(28px,2.5vw,32px)"), "hero H1 must use reduced desktop type scale");
assert(out.includes(`id="${STYLE_ID}"`));
assert.strictEqual(refineHomeSystemSelector(out, "/"), out, "homepage selector refinement must be idempotent");
assert.strictEqual(refineHomeSystemSelector(sample, "/trading-systems"), sample, "non-home routes must remain unchanged");

console.log("Homepage system selector + compact hero: PASS");
