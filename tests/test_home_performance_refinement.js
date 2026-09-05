"use strict";

const assert = require("assert");
const {
  TELEGRAM_URL,
  STYLE_ID,
  SCRIPT_ID,
  refineHomePerformance,
  resolveSnapshotWithTimeout,
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

const snapshot = {
  stale: false,
  updated_at: "2026-09-05T03:25:00.000Z",
  summary: {
    open_count: 9,
    working_count: 9,
    closed_count_today: 13,
    closed_pnl_today: 197.46,
    total_closed_pnl: 21940.77,
    win_rate: 70.63,
  },
  equity_curve: {
    total_realized_pnl: 21940.77,
    points: [
      { date: "2026-05-26", daily_pnl: 2000, cumulative_pnl: 2000 },
      { date: "2026-06-17", daily_pnl: 9000, cumulative_pnl: 11000 },
      { date: "2026-09-03", daily_pnl: 10940.77, cumulative_pnl: 21940.77 },
    ],
  },
};

const out = refineHomePerformance(sample, "/", snapshot);
assert(out.includes(`href="${TELEGRAM_URL}">Telegram</a>`));
assert(!out.includes(">Start Here</a>"));
assert(out.includes('class="vx-home-live-strip"'));
assert(out.includes("Open Positions"));
assert(out.includes("Working Orders"));
assert(out.includes("Closed Trades Today"));
assert(out.includes("+$197.46"));
assert(out.includes("+$21,940.77"));
assert(out.includes("70.63%"));
assert(out.indexOf('class="vx-home-live-strip"') < out.indexOf('class="vx-home-split"'));
assert(out.includes('class="vx-home-split"'));
assert(out.includes('class="vx-home-equity-preview"'));
assert(out.includes("Equity Curve — Realized P&amp;L"));
assert(out.includes("Watch our trading systems live before you trade them."));
assert(out.indexOf('class="vx-home-equity-preview"') < out.indexOf('class="vx-home-hero-copy"'));
assert(out.includes('id="vx-home-equity-svg"'));
assert(out.includes('<path d="M'));
assert(out.includes("Verified · Closed Trades ledger"));
assert(!out.includes("Loading verified performance…"));
assert(out.includes("fetch('/public-performance.json'"));
assert(out.includes("return sign+'$'+Math.abs"), "inline client script must preserve literal dollar sign");
assert(!out.includes("return sign+'</html>+Math.abs"), "String.replace must not corrupt inline script via $' replacement token");
assert(out.includes("setInterval(refresh,60000)"));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(out.indexOf('class="vx-home-split"') < out.indexOf('id="password-access"'));
assert.strictEqual(refineHomePerformance(out, "/", snapshot), out, "home live-summary refinement must be idempotent");

const unavailable = refineHomePerformance(sample, "/", null);
assert(unavailable.includes("Performance source unavailable"));
assert(unavailable.includes("No simulated values are shown."));
assert(!unavailable.includes("Loading verified performance…"));

const other = refineHomePerformance(sample, "/trading-systems", snapshot);
assert(other.includes(`href="${TELEGRAM_URL}">Telegram</a>`));
assert(!other.includes('class="vx-home-live-strip"'));
assert(!other.includes('class="vx-home-split"'));
assert(!other.includes(`id="${STYLE_ID}"`));

(async () => {
  const resolved = await resolveSnapshotWithTimeout(async () => snapshot, 50);
  assert.strictEqual(resolved, snapshot);
  const timedOut = await resolveSnapshotWithTimeout(() => new Promise(() => {}), 5);
  assert.strictEqual(timedOut, null);
  console.log("Homepage server-rendered live summary + equity: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
