"use strict";

const assert = require("assert");
const { refineHomepage } = require("../website_home_conversion_refinement");
const { refineHomePerformance } = require("../website_home_performance_refinement");
const { injectLiveOpenPnl } = require("../website_home_live_open_pnl");
const { refineHomeSystemSelector } = require("../website_home_system_selector_refinement");
const { refineHomeHtml } = require("../website_public_ia_refinement");
const { refinePublicPolish } = require("../website_public_polish_refinement");
const { refineNavigationAndDisclosure } = require("../website_navigation_disclosure_refinement");
const { transformHomepagePerformanceTruth } = require("../website_performance_truth_refinement");

const base = `<!doctype html><html><head><title>Vixale</title><link rel="canonical" href="https://www.vixale.com/"></head><body>
<nav><div class="nav-links"><a href="#live">Live System</a><a href="/trading-systems">Trading Systems</a><a href="#start">Start Here</a><a href="#why">Why It Makes Sense</a><a href="#creators">Creators</a><a href="/dashboard">Live Dashboard</a></div></nav>
<main>
<section class="wrap hero"><div><div class="hero-kicker">Vixale live dashboard</div><a class="hero-title-link" href="/dashboard"><h1>Watch the systems live.</h1></a><p>Follow the systems.</p><div class="actions"><a href="#password-access">Request Dashboard Access</a></div></div></section>
<section id="password-access"><h2>Request access to the live dashboard.</h2><p>Send a short access request. Every request is reviewed manually before an individual dashboard code is created.</p><p>Once approved, you will receive a reply by email with the login instructions.</p><button>Request Dashboard Access</button></section>
</main>
<footer><p><strong>Important disclosure:</strong> Trading involves risk.</p></footer>
</body></html>`;

const snapshot = {
  stale: false,
  updated_at: "2026-09-08T22:45:00.000Z",
  summary: {
    open_count: 2,
    pending_count: 3,
    closed_count_today: 4,
    closed_pnl_today: 125.5,
    total_closed_pnl: 1100,
    win_rate: 60,
  },
  equity_curve: {
    total_realized_pnl: 1100,
    coverage: {
      first_close_date: "2026-09-01",
      last_close_date: "2026-09-08",
      included_trade_count: 10,
      omitted_row_count: 1,
    },
    points: [
      { date: "2026-09-01", daily_pnl: 500, cumulative_pnl: 500 },
      { date: "2026-09-08", daily_pnl: 600, cumulative_pnl: 1100 },
    ],
  },
};

let out = refineHomepage(base);
out = refineHomePerformance(out, "/", snapshot);
out = injectLiveOpenPnl(out, "/");
out = refineHomeSystemSelector(out, "/");
out = refineHomeHtml(out);
out = refinePublicPolish(out, "/");
out = refineNavigationAndDisclosure(out, "/");
out = transformHomepagePerformanceTruth(out, "/");

assert(out.includes("See how our trading systems perform before you commit."));
assert(out.includes('class="vx-home-proof-preview"'));
assert(out.includes('class="vx-home-system-stack"'));
assert(out.includes('id="live-day-trading"'));
assert(out.indexOf('class="vx-home-hero"') < out.indexOf('class="vx-home-proof-preview"'));
assert(out.indexOf('class="vx-home-proof-preview"') < out.indexOf('class="vx-home-system-stack"'));
assert(out.indexOf('class="vx-home-system-stack"') < out.indexOf('id="live-day-trading"'));
assert(out.includes('data-vx-mirror="vx-home-live-0"'));
assert(out.includes('data-vx-mirror="vx-home-live-1"'));
assert(out.includes('data-vx-mirror="vx-home-live-3"'));
assert(out.includes('data-vx-mirror="vx-home-equity-total"'));
assert(out.includes("Pending Setups"));
assert(!out.includes("Working Orders"));
assert(out.includes("Data current"));
assert(out.includes("Last updated: checking"));
assert(out.includes("Coverage: awaiting Closed Trades ledger"));
assert(out.includes('id="vx-home-live-open-pnl"'));
assert(out.includes('href="/#password-access">Request Free Access</a>'));
assert(!out.includes("7-Day"));
assert(!out.includes("7 days"));
for (const navText of ["Trading Systems", "Performance", "Services", "About", "Trading Guide", "Login", "Request Free Access"]) {
  assert(out.includes(`>${navText}</a>`), `missing final navigation item ${navText}`);
}
assert.strictEqual((out.match(/class="vx-home-system-card"/g) || []).length, 3);
assert(out.includes(".vx-home-equity-svg text{fill:#5f6d67!important;font-size:11px!important}"));

console.log("Audit PR3 homepage composition: PASS");
