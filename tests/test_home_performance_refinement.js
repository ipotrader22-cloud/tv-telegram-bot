"use strict";

const assert = require("assert");
const {
  TELEGRAM_URL,
  STYLE_ID,
  SCRIPT_ID,
  refineHomePerformance,
} = require("../website_home_performance_refinement");

const sample = `<!doctype html><html><head><title>Vixale</title></head><body>
<nav><a href="#start-here">Start Here</a></nav>
<main>
<section class="vx-home-hero"><div class="wrap"><div class="vx-home-hero-copy">
<a class="vx-home-hero-kicker" href="/dashboard">Vixale live dashboard</a>
<h1>Watch our trading systems live before you trade them.</h1>
<p class="vx-home-hero-lead">See active trade ideas.</p>
<div class="vx-home-hero-actions"><a href="#password-access">Request 7-Day Access</a></div>
</div></div></section>
<section id="password-access"><h2>Request access to the live dashboard.</h2></section>
</main></body></html>`;

const out = refineHomePerformance(sample, "/");
assert(out.includes(`href="${TELEGRAM_URL}">Telegram</a>`));
assert(!out.includes(">Start Here</a>"));
assert(out.includes('class="vx-home-split"'));
assert(out.includes('class="vx-home-equity-preview"'));
assert(out.includes("Equity Curve — Realized P&amp;L"));
assert(out.includes("Watch our trading systems live before you trade them."));
assert(out.indexOf('class="vx-home-equity-preview"') < out.indexOf('class="vx-home-hero-copy"'));
assert(out.includes("fetch('/public-performance.json'"));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(out.indexOf('class="vx-home-split"') < out.indexOf('id="password-access"'));
assert.strictEqual(refineHomePerformance(out, "/"), out, "home split refinement must be idempotent");

const other = refineHomePerformance(sample, "/trading-systems");
assert(other.includes(`href="${TELEGRAM_URL}">Telegram</a>`));
assert(!other.includes('class="vx-home-split"'));
assert(!other.includes(`id="${STYLE_ID}"`));

console.log("Homepage performance split + Telegram nav: PASS");
