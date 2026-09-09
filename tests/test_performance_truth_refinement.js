"use strict";

const assert = require("assert");
const {
  STYLE_ID,
  SCRIPT_ID,
  transformHomepagePerformanceTruth,
} = require("../website_performance_truth_refinement");

const freshHtml = `<!doctype html><html><head></head><body>
<section class="vx-home-day-trading"><div class="wrap">
<div class="vx-home-day-actions"><div class="vx-home-day-action-row"><span id="vx-home-day-badge" class="vx-home-day-badge"><i></i>Live</span></div><a class="vx-home-day-dashboard-link" href="/dashboard">Dashboard</a></div>
<div class="vx-home-live-strip"><div class="vx-home-live-card"><div class="vx-home-live-label">Working Orders</div><div id="vx-home-live-1">3</div></div></div>
<div class="vx-home-equity-head"><div><p>Day Trading closed trades only · Open P&amp;L excluded</p></div></div>
<div id="vx-home-equity-status">Verified · Closed Trades ledger</div>
</div></section>
<script>function apply(data){const s=data.summary||{},badge=document.getElementById('vx-home-day-badge');set('vx-home-live-1',String(Number(s.working_count||0)),0);if(badge){badge.classList.toggle('stale',Boolean(data.stale));badge.classList.remove('unavailable');badge.innerHTML=data.stale?'Last verified':'<i></i>Live';}}</script>
</body></html>`;

const out = transformHomepagePerformanceTruth(freshHtml, "/");
assert(out.includes("Pending Setups"));
assert(!out.includes(">Working Orders<"));
assert(out.includes("s.pending_count"));
assert(!out.includes("s.working_count"));
assert(out.includes('<i></i>Data current</span>'));
assert(out.includes('id="vx-home-day-updated"'));
assert(out.includes("Last updated: checking…"));
assert(out.includes('id="vx-home-equity-coverage"'));
assert(out.includes("Awaiting Closed Trades ledger"));
assert(out.includes("included_trade_count"));
assert(!out.includes("omitted_row_count"));
assert(out.includes("coverage.textContent=range+'. '+included+' closed trade'+(included===1?'':'s')"));
assert(!out.includes("Coverage: '+range"));
assert(!out.includes("Open P&L excluded';"));
assert(out.includes("Update delayed"));
assert(out.includes("Data unavailable"));
assert(out.includes("failures>=2"));
assert(out.includes("timeZone:'America/New_York'"));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(!out.includes("badge.innerHTML=data.stale?'Last verified':'<i></i>Live'"), "legacy Live badge writer must be disabled");
assert.strictEqual(transformHomepagePerformanceTruth(out, "/"), out, "final performance truth transform must be idempotent");

const staleHtml = freshHtml.replace('class="vx-home-day-badge"><i></i>Live</span>', 'class="vx-home-day-badge stale">Last verified</span>');
assert(transformHomepagePerformanceTruth(staleHtml, "/").includes('class="vx-home-day-badge stale">Update delayed</span>'));
const unavailableHtml = freshHtml.replace('class="vx-home-day-badge"><i></i>Live</span>', 'class="vx-home-day-badge unavailable">Status unavailable</span>');
assert(transformHomepagePerformanceTruth(unavailableHtml, "/").includes('class="vx-home-day-badge unavailable">Data unavailable</span>'));
assert.strictEqual(transformHomepagePerformanceTruth(freshHtml, "/services"), freshHtml, "non-home routes must remain untouched");

console.log("Homepage performance truth refinement: PASS");
