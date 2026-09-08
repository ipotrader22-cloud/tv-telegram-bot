"use strict";

const assert = require("assert");
const packageJson = require("../package.json");
const {
  STYLE_ID,
  SCRIPT_ID,
  TOP_MARKER,
  PREVIEW_MARKER,
  DAY_ANCHOR_ID,
  SWING_TRADING_PATH,
  OPTIONS_PATH,
  refineHomeSystemSelector,
} = require("../website_home_system_selector_refinement");

const startCommand = packageJson.scripts.start;
assert(startCommand.indexOf("-r ./website_home_system_selector_refinement.js") < startCommand.indexOf("-r ./website_home_performance_refinement.js"), "selector preload must be registered before performance so its response transform runs after existing homepage refinements");

const sample = `<!doctype html><html><head><title>Vixale</title></head><body><main>
<section class="vx-home-hero"><div class="wrap"><div class="vx-home-hero-copy">
<a class="vx-home-hero-kicker" href="/trading-systems">Vixale trading systems</a>
<h1>See how our trading systems perform before you commit.</h1>
<p class="vx-home-hero-lead">Follow current activity and recorded results.</p>
<div class="vx-home-hero-actions"><a href="/#password-access">Request Free Access</a><a href="#live-day-trading">Explore Performance</a></div>
<p class="vx-home-hero-proof">Read-only viewer access · Email verification · Manual review</p>
<p class="vx-home-hero-login">Already have access? <a href="/dashboard">Viewer Login</a></p>
</div></div></section>
<section class="vx-home-day-trading" aria-labelledby="vx-home-day-title"><div class="wrap">
<div class="vx-home-day-head"><div><div class="vx-home-day-kicker">Live Day Trading</div><h2 id="vx-home-day-title">Day Trading System Status</h2></div><div><span id="vx-home-day-badge">Data current</span><span id="vx-home-day-updated">Last updated: Sep 8</span></div></div>
<section class="vx-home-live-strip-wrap"><div class="vx-home-live-strip"><div><div id="vx-home-live-0">2</div></div><div><div id="vx-home-live-1">3</div></div><div><div id="vx-home-live-3" class="positive">+$100.00</div></div></div></section>
<div class="vx-home-day-performance"><section class="vx-home-equity-preview"><strong id="vx-home-equity-total">+$1,000.00</strong></section></div>
<section class="vx-home-other-systems"><div class="vx-home-other-grid">
<a class="vx-home-system-card" href="${SWING_TRADING_PATH}">Swing Trading</a>
<a class="vx-home-system-card" href="${OPTIONS_PATH}">Options</a>
</div></section>
</div></section>
<section id="password-access">Access</section>
</main></body></html>`;

const out = refineHomeSystemSelector(sample, "/");
assert(out.includes(TOP_MARKER));
assert(out.includes(PREVIEW_MARKER));
assert(out.includes(`id="${DAY_ANCHOR_ID}"`));
assert(out.includes(`href="#${DAY_ANCHOR_ID}"`));
assert(out.includes(`href="${SWING_TRADING_PATH}"`));
assert(out.includes(`href="${OPTIONS_PATH}"`));
assert(out.includes("View Day Trading ↓"));
assert(out.includes("Explore Swing Trading →"));
assert(out.includes("Explore Options →"));
assert(out.includes('data-vx-mirror="vx-home-live-0"'));
assert(out.includes('data-vx-mirror="vx-home-live-1"'));
assert(out.includes('data-vx-mirror="vx-home-live-3"'));
assert(out.includes('data-vx-mirror="vx-home-equity-total"'));
assert(out.includes("rather than being simulated"));
assert.strictEqual((out.match(/class="vx-home-system-card"/g) || []).length, 3, "selector must contain exactly three system cards");
assert(!out.includes('class="vx-home-other-systems"'), "lower Swing/Options duplicate must be removed");
assert(out.indexOf('class="vx-home-hero"') < out.indexOf(PREVIEW_MARKER), "hero must lead the top composition");
assert(out.indexOf(PREVIEW_MARKER) < out.indexOf('class="vx-home-system-stack"'), "system selector must sit below hero + evidence preview");
assert(out.indexOf(TOP_MARKER) < out.indexOf(`id="${DAY_ANCHOR_ID}"`), "top hero/preview/selector block must precede Live Day Trading");
assert(out.indexOf(`id="${DAY_ANCHOR_ID}"`) < out.indexOf('id="password-access"'), "Live Day Trading must remain above access form");
assert(out.includes("font-size:clamp(48px,4.8vw,58px)"), "hero H1 must use the restored desktop hierarchy");
assert(out.includes("font-size:clamp(34px,10vw,40px)"), "mobile hero must remain readable without oversized type");
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(out.includes("new MutationObserver(sync)"));
assert.strictEqual(refineHomeSystemSelector(out, "/"), out, "homepage selector refinement must be idempotent");
assert.strictEqual(refineHomeSystemSelector(sample, "/trading-systems"), sample, "non-home routes must remain unchanged");

console.log("Homepage hero-first selector + verified preview: PASS");
