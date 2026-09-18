"use strict";

const assert = require("assert");
const pkg = require("../package.json");
const {
  SWING_PATH,
  STYLE_ID,
  refineSwingReadability,
} = require("../website_swing_readability_refinement");

assert(pkg.scripts.start.startsWith("node -r ./website_swing_readability_refinement.js -r ./website_conversion_final_qa_refinement.js"));

const fixture = `<!doctype html><html><head></head><body>
<main data-vx-conversion-system-page="swing">
  <div class="hero-layout"><section class="hero"><h1>Follow a portfolio reviewed every day.</h1></section>
    <section class="summary" aria-label="Swing Leaders summary">
      <div class="summary-card posture"><small>Market Posture</small><strong>Selective / risk-aware</strong></div>
      <div class="summary-card"><small>Active Portfolio</small><strong>3</strong></div>
      <div class="summary-card"><small>Potential Candidates</small><strong>6</strong></div>
      <div class="summary-card"><small>Cash</small><strong>25%</strong></div>
      <div class="summary-card"><small>Model Allocation</small><strong>$10K</strong><span>per position</span></div>
    </section>
  </div>
  <section class="vx-evidence-context" data-vx-evidence-credibility="swing" aria-label="Swing evidence coverage"><h2>Swing evidence context</h2><p>Remove me.</p></section>
  <section class="how" aria-label="How Swing Leaders works">
    <h2>How Swing Leaders Works</h2>
    <div class="how-grid"><div class="how-item"><strong>Active Portfolio</strong><p>Old copy.</p></div></div>
    <div class="rules">Old rules copy.</div>
  </section>
</main></body></html>`;

const out = refineSwingReadability(fixture);
assert(out.includes(`id="${STYLE_ID}"`));
assert(!out.includes("Swing evidence context"));
assert(!out.includes('data-vx-evidence-credibility="swing"'));
assert(out.includes("How Swing Leaders Works"));
assert(out.includes("these are the model positions currently being followed"));
assert(out.includes("watch-list ideas, not model positions"));
assert(out.includes("these are model positions that have finished"));
assert(out.includes("The +10% profit target may trigger intraday"));
assert(out.includes("not a live intraday stop"));
assert(out.includes("$10K / position"));
assert(!out.includes("<strong>$10K</strong><span>per position</span>"));
assert(out.includes("font-size:clamp(30px,3.5vw,42px)!important"));
assert(out.includes("font-size:33px"));
assert(out.includes("font-size:18px"));
assert(out.includes('data-vx-swing-market-posture="1"'));
assert(out.includes("Selective / risk-aware"));

const howIndex = out.indexOf('data-vx-swing-how="beginner"');
const activeIndex = out.indexOf("<small>Active Portfolio</small>");
const posturePanelIndex = out.indexOf('data-vx-swing-market-posture="1"');
assert(howIndex >= 0 && activeIndex > howIndex, "How block must occupy the former Market Posture summary position");
assert(posturePanelIndex > activeIndex, "Market Posture must move to the former How block area");
assert.strictEqual((out.match(/Market Posture/g) || []).length, 2, "Market Posture should have one label plus aria-label only");
assert.strictEqual(refineSwingReadability(out), out, "Swing readability transform must be idempotent");
assert.strictEqual(SWING_PATH, "/trading-systems/swing-trading");

console.log("Swing readability refinement PASS");
