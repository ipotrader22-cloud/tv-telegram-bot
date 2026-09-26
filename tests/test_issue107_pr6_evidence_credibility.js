"use strict";

const assert = require("assert");
const pkg = require("../package.json");
const {
  HOME_PATH,
  PRICING_PATH,
  SWING_PATH,
  OPTIONS_PATH,
  MARKER,
  transformHome,
  transformPricing,
  transformSwing,
  transformOptions,
  refineEvidenceCredibility,
} = require("../website_evidence_credibility_refinement");

assert(pkg.scripts.start.startsWith("node -r ./website_evidence_credibility_refinement.js "), "credibility refinement must be the first preload so it sees final rendered HTML");

const home = `<!doctype html><html><head></head><body>
<div class="vx-home-day-kicker">Live Day Trading</div>
<span id="vx-home-day-updated">Last updated: checking…</span></div>
<div>Verified · Closed Trades ledger</div><div>Last verified snapshot · update delayed</div>
<div>Verified performance is temporarily unavailable. No simulated values are shown.</div>
<script>
const included=Number(c.included_trade_count);
    if(!Number.isFinite(included)){
      coverage.textContent='Coverage unavailable';
      return;
    }
    const range=first&&last?(first===last?first:first+' – '+last):'No included realized closes yet';
    coverage.textContent=range+'. '+included+' closed trade'+(included===1?'':'s');
if(equityStatus)equityStatus.textContent='Performance update unavailable';
if(equityStatus)equityStatus.textContent='Performance update delayed';
</script></body></html>`;
const homeOut = transformHome(home);
assert(homeOut.includes("Day Trading Evidence"));
assert(homeOut.includes("Closed Trades ledger · realized P&amp;L source"));
assert(homeOut.includes("Cached Closed Trades snapshot · update delayed"));
assert(homeOut.includes("Day Trading realized-results source is temporarily unavailable"));
assert(homeOut.includes("formatCoverageDate"));
assert(homeOut.includes("month:'short',day:'numeric',year:'numeric',timeZone:'UTC'"));
assert(homeOut.includes("Realized Closed Trades only; open P&L excluded;"));
assert(!homeOut.includes("adds no separate fee/commission adjustment"));
assert(!homeOut.includes("does not mean the market is open or a trade is active"));
assert(!homeOut.includes("vx-evidence-freshness-note"));
assert(!homeOut.includes("Verified · Closed Trades ledger"));

const pricing = `<!doctype html><html><head></head><body>
<h2 id="vx-watch-performance-title">Verified performance preview</h2><p>Realized results, aggregated from the dashboard data source.</p>
<div id="vx-watch-chart-empty">Loading verified performance…</div>
<div id="vx-watch-status" class="vx-perf-status"><span><strong>Loading verified performance</strong></span><span>Closed Trades only · Open P&amp;L excluded</span></div>
<script>
const empty=$('vx-watch-chart-empty'), stage=$('vx-watch-chart-stage'), status=$('vx-watch-status');
if(status){const when=data.updated_at?new Date(data.updated_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'recently';status.innerHTML='<span><strong>'+(data.stale?'Last verified snapshot':'Verified performance data')+'</strong> · '+when+'</span><span>Closed Trades only · Open P&amp;L excluded</span>';}
if(status)status.innerHTML='<span><strong>Performance source unavailable</strong></span><span>Try again later or request dashboard access.</span>';
</script>
<div>Verified performance is temporarily unavailable. No fallback or simulated values are shown.</div>
</body></html>`;
const pricingOut = transformPricing(pricing);
assert(pricingOut.includes("Day Trading realized-results preview"));
assert(pricingOut.includes("Closed Trades ledger used by the Day Trading dashboard"));
assert(pricingOut.includes('id="vx-watch-coverage"'));
assert(pricingOut.includes("Closed Trades ledger · refresh succeeded"));
assert(pricingOut.includes("Cached Closed Trades snapshot"));
assert(pricingOut.includes("included closed trade"));
assert(pricingOut.includes("no separate website fee/commission adjustment"));
assert(pricingOut.includes("refresh status does not indicate market or trade activity"));
assert(pricingOut.includes("No fallback or simulated values are shown"));
assert(!pricingOut.includes("Verified performance preview"));
assert(!pricingOut.includes("Verified performance data"));

const swing = `<!doctype html><html><head></head><body>
<section class="hero"><h1>Vixale Swing Trading</h1></section>
<svg><circle aria-label="2026-08-20 · Inception; Model P&amp;L $0.00"></circle><circle aria-label="2026-09-17 · 10:30 ET; Model P&amp;L +$250.00"></circle></svg>
<section class="how" aria-label="How Swing Leaders works"><h2>How</h2></section>
<table><tbody><tr><td data-label="Exit Date">2026-09-10</td></tr><tr><td data-label="Exit Date">2026-09-15</td></tr></tbody></table>
</body></html>`;
const swingOut = transformSwing(swing);
assert(swingOut.includes(`${MARKER}="swing"`));
assert(swingOut.includes("Trading Lab research/model portfolio"));
assert(swingOut.includes("2026-08-20 – 2026-09-17 · 2 displayed snapshots"));
assert(swingOut.includes("2026-09-10 – 2026-09-15 · 2 closed model trades"));
assert(swingOut.includes("Active positions are model unrealized P&amp;L"));
assert(swingOut.includes("does not add a separate commission or fee adjustment"));
assert(swingOut.includes("does not mean the market is open or trading is active"));
assert.strictEqual(transformSwing(swingOut), swingOut, "Swing transform must be idempotent");

const options = `<!doctype html><html><head></head><body><main><div class="vx-system-sequence"><section>Options content</section></div></main></body></html>`;
const optionsOut = transformOptions(options);
assert(optionsOut.includes(`${MARKER}="options"`));
assert(optionsOut.includes("owner-entered Option Journal"));
assert(optionsOut.includes("open records are excluded from the realized curve"));
assert(optionsOut.includes("subtracts the recorded Fees field"));
assert(optionsOut.includes("does not mean an options trade is active"));
assert.strictEqual(transformOptions(optionsOut), optionsOut, "Options transform must be idempotent");

assert.strictEqual(refineEvidenceCredibility("<html>unchanged</html>", "/about"), "<html>unchanged</html>");
assert(refineEvidenceCredibility(home, HOME_PATH).includes("Day Trading Evidence"));
assert(refineEvidenceCredibility(pricing, PRICING_PATH).includes("realized-results preview"));
assert(refineEvidenceCredibility(swing, SWING_PATH).includes("Swing evidence context"));
assert(refineEvidenceCredibility(options, OPTIONS_PATH).includes("Options evidence context"));

console.log("Issue #107 PR6 evidence credibility: PASS");
