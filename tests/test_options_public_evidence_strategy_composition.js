"use strict";

const assert = require("assert");
const evidence = require("../website_options_public_evidence_refinement");
const strategy = require("../website_strategy_page_design_refinement");

const values = [
  ["ID", "Trade Date", "Entry Time", "Symbol", "Strategy", "Legs", "Expiration", "Contracts", "Multiplier", "Trade Type", "Entry Price", "Exit Date", "Exit Time", "Exit Price", "Fees", "Status", "Proof 1", "Proof 2", "Notes"],
  ["OPT-1", "2026-09-27", "10:00", "SPX", "Calendar", "Short 7680 / Long 7680", "2026-09-29", 10, 100, "Debit", 20.70, "2026-09-29", "14:00", 24.00, 102.42, "Closed", "/dashboard/options/OPT-1/proofs/1"],
];

const publicEvidence = evidence.buildPublicOptionsEvidence(values);

const salesHtml = `<!doctype html><html><head></head><body>
<div class="vx-options-sales" data-vx-options-sales-page="1">
  <nav class="vx-options-family-nav"><a href="/trading-systems/day-trading">Day Trading</a><a href="/trading-systems/swing-trading">Swing Trading</a><a class="active" href="/trading-systems/options">Options</a></nav>
  <section class="vx-options-hero">
    <div class="vx-options-hero-copy"><h1>Options</h1><div class="vx-options-actions"><a href="#options-dashboard-preview">See How It Works ↓</a></div></div>
    <div class="vx-options-hero-preview"><div class="vx-options-dashboard-shot compact" id="options-hero-preview">Hero preview</div></div>
  </section>
  <section class="vx-options-preview-section" id="options-dashboard-preview">
    <div class="vx-options-section-copy"><h2>Take a look inside.</h2><p>Preview copy</p><a class="vx-options-inline-cta" href="#options-preview-card">Preview the Dashboard</a></div>
    <div class="vx-options-dashboard-shot" id="options-preview-card">Dashboard preview</div>
  </section>
  <section class="vx-options-results"><div><h2>Results</h2><p>Results copy</p><strong>Recorded results.</strong><small>Risk note.</small></div><div class="vx-options-results-preview">Result preview</div></section>
</div>
</body></html>`;

const withEvidence = evidence.refinePublicOptionsPage(salesHtml, publicEvidence, "en", false);
assert(withEvidence.includes('class="vx-options-public-preview-stack"'));
assert(withEvidence.includes('id="options-public-chart"'));
assert(withEvidence.includes('id="option-journal-public"'));

const composed = strategy.refineStrategyPageDesign(withEvidence, strategy.OPTIONS_PATH);

assert(composed.includes('class="vx-options-unified-story"'), "Options layout should still consolidate into the unified story");
assert(composed.includes('class="vx-options-public-preview-stack"'), "strategy composition must preserve the public chart/dashboard stack");
assert(composed.includes('id="options-public-chart"'), "public realized P&L chart must survive strategy composition");
assert(composed.includes("Realized P&L curve"), "public chart heading must survive strategy composition");
assert(composed.includes('class="vx-options-x-tick"'));
assert(composed.includes('class="vx-options-y-tick"'));
assert(composed.includes('stroke-dasharray="4 4"'));
assert(composed.includes('>Proofs</th>'));
assert(composed.includes('id="options-preview-card"'), "dashboard example must remain present");
assert(composed.indexOf('id="options-public-chart"') < composed.indexOf('id="options-preview-card"'), "chart must remain above the dashboard example");
assert(composed.includes('id="option-journal-public"'), "public Option Journal must remain present");
assert.equal((composed.match(/id="options-dashboard-preview"/g) || []).length, 1, "unified Options story should own the preview anchor exactly once");
assert(!composed.includes("/dashboard/options/OPT-1/proofs/1"), "protected proof URL must remain private");

console.log("options public evidence + strategy composition: ok");
