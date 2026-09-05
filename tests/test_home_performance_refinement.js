"use strict";

const assert = require("assert");
const {
  TELEGRAM_URL,
  DAY_TRADING_PATH,
  SWING_TRADING_PATH,
  OPTIONS_PATH,
  STYLE_ID,
  SCRIPT_ID,
  DAY_SCOPE_MARKER,
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
assert(out.includes(DAY_SCOPE_MARKER));
assert(out.includes("Live Day Trading"));
assert(out.includes("Day Trading System Status"));
assert(out.includes("Current status and realized performance for Vixale day-trading systems."));
assert(out.includes("Day Trading only · The status cards and equity curve on this page do not include Swing Trading or Options."));
assert(out.includes('aria-label="Day Trading system status summary"'));
assert(out.includes("Open Positions"));
assert(out.includes("Working Orders"));
assert(out.includes("Closed Trades Today"));
assert(out.includes("+$197.46"));
assert(!out.includes("Win Rate"), "homepage current-status strip should not show Win Rate");
assert(!out.includes("Total Closed P&amp;L"), "homepage current-status strip should not duplicate total P&L");
assert(out.includes("+$21,940.77"), "equity card should retain total realized P&L");
assert(out.includes("Day Trading performance"));
assert(out.includes("Day Trading closed trades only · Open P&amp;L excluded"));
assert(out.includes("Day Trading Equity Curve — Realized P&L"));
assert(out.includes(`href="${DAY_TRADING_PATH}">Day Trading details →</a>`));
assert(out.includes(`href="${DAY_TRADING_PATH}">Explore Day Trading</a>`));
assert(out.includes(`href="${SWING_TRADING_PATH}"`));
assert(out.includes("Explore Swing Trading →"));
assert(out.includes(`href="${OPTIONS_PATH}"`));
assert(out.includes("Explore Options →"));
assert(out.includes("Watch our trading systems live before you trade them."));
assert(out.indexOf('class="vx-home-hero"') < out.indexOf('class="vx-home-day-trading"'), "hero must appear before Day Trading status");
assert(out.indexOf('class="vx-home-day-trading"') < out.indexOf('id="password-access"'), "Day Trading status must appear before access form");
assert(out.includes('id="vx-home-equity-svg"'));
assert(out.includes('<path d="M'));
assert(out.includes("Verified · Closed Trades ledger"));
assert(out.includes("fetch('/public-performance.json'"));
assert(out.includes("return sign+'$'+Math.abs"), "inline client script must preserve literal dollar sign");
assert(!out.includes("return sign+'</html>+Math.abs"), "String.replace must not corrupt inline script via $' replacement token");
assert(out.includes("setInterval(refresh,60000)"));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`));
assert.strictEqual(refineHomePerformance(out, "/", snapshot), out, "home Day Trading refinement must be idempotent");

const unavailable = refineHomePerformance(sample, "/", null);
assert(unavailable.includes("Status unavailable"));
assert(unavailable.includes("Performance source unavailable"));
assert(unavailable.includes("No simulated values are shown."));

const stale = refineHomePerformance(sample, "/", { ...snapshot, stale: true });
assert(stale.includes('id="vx-home-day-badge" class="vx-home-day-badge stale">Last verified</span>'));

const other = refineHomePerformance(sample, "/trading-systems", snapshot);
assert(other.includes(`href="${TELEGRAM_URL}">Telegram</a>`));
assert(!other.includes(DAY_SCOPE_MARKER));
assert(!other.includes(`id="${STYLE_ID}"`));

(async () => {
  const resolved = await resolveSnapshotWithTimeout(async () => snapshot, 50);
  assert.strictEqual(resolved, snapshot);
  const timedOut = await resolveSnapshotWithTimeout(() => new Promise(() => {}), 5);
  assert.strictEqual(timedOut, null);
  console.log("Homepage Day Trading scope + system navigation: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
