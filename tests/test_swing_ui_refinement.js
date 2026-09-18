"use strict";

const assert = require("assert");
const pkg = require("../package.json");
const {
  SWING_PATH,
  STYLE_ID,
  PAGE_MARKER,
  refineSwingHtml,
} = require("../website_swing_ui_refinement");

const start = pkg.scripts.start;
assert(start.startsWith("node -r ./website_conversion_final_qa_refinement.js -r ./website_conversion_access_services_refinement.js"));
assert(start.includes("-r ./website_swing_ui_refinement.js -r ./website_conversion_pricing_refinement.js"));

const fixture = `<!doctype html><html><head></head><body>
<main data-vx-conversion-system-page="swing">
  <div class="hero-layout">
    <section class="hero"><h1>Follow a portfolio reviewed every day.</h1></section>
    <section class="summary" aria-label="Swing Leaders summary">
      <div class="summary-card posture"><small>Market Posture</small><strong>Selective / risk-aware</strong></div>
      <div class="summary-card"><small>Active Portfolio</small><strong>4</strong></div>
      <div class="summary-card"><small>Potential Candidates</small><strong>7</strong></div>
      <div class="summary-card"><small>Cash</small><strong>20%</strong></div>
      <div class="summary-card"><small>Model Allocation</small><strong>$10K</strong><span>per position</span></div>
    </section>
  </div>
  <section class="vx-evidence-context" data-vx-evidence-credibility="swing" aria-label="Swing evidence coverage">
    <h2>Swing evidence context</h2><p>Evidence type: Trading Lab research/model portfolio.</p><div><strong>Coverage</strong></div>
  </section>
  <section class="how" aria-label="How Swing Leaders works">
    <h2>How Swing Leaders Works</h2>
    <div class="how-grid"><div class="how-item"><strong>Active Portfolio</strong><p>Old technical wording.</p></div></div>
    <div class="rules">Old rules copy.</div>
  </section>
</main>
</body></html>`;

const out = refineSwingHtml(fixture);
assert(out.includes(PAGE_MARKER));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes("font-size:clamp(30px,3.5vw,42px)!important"));
assert(out.includes(".vx-swing-how-card h2{margin:0 0 16px;font-size:33px"));
assert(out.includes("font-size:18px;line-height:1.5"));

assert(!out.includes("Swing evidence context"));
assert(!out.includes('data-vx-evidence-credibility="swing"'));
assert(!out.includes("Old technical wording"));
assert(!out.includes("Old rules copy"));

assert(out.includes('data-vx-swing-how="beginner"'));
assert(out.includes("Stocks that are currently in the model portfolio."));
assert(out.includes("They are not open positions and may never be added."));
assert(out.includes("The 5% stop reference is checked during the scheduled morning review, not as an automatic intraday stop."));
assert(out.includes("$10K / position"));
assert(!out.includes("$10K</strong><span>per position"));

const howIndex = out.indexOf('data-vx-swing-how="beginner"');
const activeMetricIndex = out.indexOf("<small>Active Portfolio</small>");
const movedPostureIndex = out.indexOf('data-vx-swing-market-posture="1"');
const allocationIndex = out.indexOf("$10K / position");
assert(howIndex >= 0 && howIndex < activeMetricIndex, "How block should occupy the former Market Posture position in the summary");
assert(movedPostureIndex > allocationIndex, "Market Posture should move to the former How block position below the summary");
assert(out.includes('<p class="vx-swing-posture-copy">Selective / risk-aware</p>'));

assert.strictEqual(refineSwingHtml(out), out, "Swing UI refinement must be idempotent");
assert.strictEqual(SWING_PATH, "/trading-systems/swing-trading");

console.log("Swing UI presentation refinement: PASS");
