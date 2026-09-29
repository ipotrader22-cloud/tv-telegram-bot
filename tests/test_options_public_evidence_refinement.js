"use strict";

const assert = require("assert");
const mod = require("../website_options_public_evidence_refinement");

const values = [
  ["ID", "Trade Date", "Entry Time", "Symbol", "Strategy", "Legs", "Expiration", "Contracts", "Multiplier", "Trade Type", "Entry Price", "Exit Date", "Exit Time", "Exit Price", "Fees", "Status", "Proof 1", "Proof 2", "Notes"],
  ["OPT-1", "2026-09-27", "10:00", "SPX", "Calendar", "Short 7680 / Long 7680", "2026-09-29", 10, 100, "Debit", 20.70, "2026-09-29", "14:00", 24.00, 102.42, "Closed", "/dashboard/options/OPT-1/proofs/1"],
  ["OPT-2", "2026-09-29", "11:15", "ES", "Straddle", "Short 6000C / 6000P", "2026-09-29", 2, 50, "Credit", 40, "", "", "", 0, "Open", "/dashboard/options/OPT-2/proofs/1"],
  ["OPT-3", "2026-09-30", "09:45", "SPX", "Debit spread", "Long 7700 / Short 7710", "2026-09-30", 1, 100, "Debit", 5, "2026-09-30", "15:10", 7, 0, "Closed"],
];

const evidence = mod.buildPublicOptionsEvidence(values);
assert.equal(evidence.trades.length, 3);
assert.equal(evidence.curve.points.length, 2);
assert.equal(evidence.curve.points[0].date, "2026-09-29");
assert.equal(evidence.curve.points[0].cumulative_pnl, 3197.58);
assert.equal(evidence.curve.points[1].cumulative_pnl, 3397.58);

const salesHtml = `<!doctype html><html><head></head><body>
<div class="vx-options-sales" data-vx-options-sales-page="1">
<section class="vx-options-hero"><div class="vx-options-actions"><a class="primary" href="https://t.me/example" target="_blank" rel="noopener noreferrer">Request Options Access</a></div></section>
<section class="vx-options-preview-section" id="options-dashboard-preview"><div class="vx-options-section-copy"><p>This is a real historical example from the existing Options dashboard, using actual journal fields and trade dates. Current open positions are not exposed in this public preview.</p></div><div class="vx-options-dashboard-shot" id="options-preview-card"><div>ACTUAL OPTIONS DASHBOARD EXAMPLE</div><div><div>nested</div></div></div></section>
<section class="vx-options-benefits"><div class="vx-options-benefit-grid"><article><span>01</span><h3>See new positions</h3><p>One</p></article><article><span>02</span><h3>Follow daily updates</h3><p>Two</p></article><article><span>03</span><h3>Review completed trades</h3><p>Three</p></article></div></section>
<section class="vx-options-results"><div><h2>The results are part of the service.</h2><p>Your subscription includes access to our closed-trade history and available brokerage screenshots, so you can look beyond the latest update and review the trading record.</p><strong>Open positions. Closed trades. Recorded results.</strong></div></section>
<section class="vx-options-subscription"><a class="vx-options-request" href="https://t.me/example" target="_blank" rel="noopener noreferrer">Request Options Access</a><small>Paid onboarding is currently handled manually through Vixale on Telegram. The button opens a pre-filled plan request; activation, payment, and access details are confirmed during onboarding.</small></section>
</div></body></html>`;

const refined = mod.refinePublicOptionsPage(salesHtml, evidence, "en", false);
assert(refined.includes(mod.PAGE_MARKER));
assert.equal((refined.match(/href="\/#password-access"/g) || []).length, 5, "two Options CTAs + three benefit cards should point to registration");
assert(!refined.includes("https://t.me/example"));
assert(refined.includes("Real trades. Daily updates. A record you can check."));
assert(refined.includes('href="#option-journal-public">proofs</a>'));
assert(refined.includes("The full Option Journal is published below"));
assert(!refined.includes("Current open positions are not exposed"));
assert(refined.includes('id="options-public-chart"'));
assert(refined.includes('id="option-journal-public"'));
assert(refined.indexOf('id="options-public-chart"') < refined.indexOf('id="options-preview-card"'), "chart must be above dashboard example");
assert(refined.indexOf('id="option-journal-public"') > refined.indexOf('id="options-dashboard-preview"'), "journal must follow preview section");
assert(refined.includes("SPX"));
assert(refined.includes("ES"));
assert(!refined.includes("/dashboard/options/OPT-1/proofs/1"), "protected proof URL must not be exposed");
assert(!refined.includes("/dashboard/options/OPT-2/proofs/1"), "protected proof URL must not be exposed");
assert(refined.includes("Start with Vixale viewer access"));

const unavailable = mod.refinePublicOptionsPage(salesHtml, { trades: [], curve: { points: [], total_realized_pnl: 0 } }, "en", true);
assert(unavailable.includes("Options performance history is temporarily unavailable."));
assert(unavailable.includes("The Option Journal is temporarily unavailable. No simulated data is substituted."));

const homeHtml = `<html><body><h3>Position details and supporting records are protected.</h3><p>Openings, updates and closures are published through the existing Options workflow. Public visitors see the product overview; entitled viewers can open the protected position history and brokerage records.</p></body></html>`;
const homeRefined = mod.refineHomeOptionsEvidenceCopy(homeHtml);
assert(homeRefined.includes("Options chart and trade journal are public."));
assert(homeRefined.includes("brokerage proof files remain protected for approved viewers."));
assert(!homeRefined.includes("entitled viewers can open the protected position history"));

console.log("options public evidence refinement: ok");
