"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function loadWithGoogleStub(request, parent, isMain) {
  if (request === "googleapis") return { google: { auth: { GoogleAuth: class GoogleAuth {} }, sheets: () => ({}) } };
  return originalLoad.call(this, request, parent, isMain);
};

const {
  STYLE_ID,
  SCRIPT_ID,
  refinePricingPerformance,
  resolveSnapshotWithTimeout,
} = require("../website_pricing_performance_fix");
Module._load = originalLoad;

const renderedPricing = `<!doctype html><html><head><title>Vixale | Watch System for Free</title></head><body>
<main><section class="vx-perf">
<div class="vx-perf-metrics">
<div id="vx-watch-closed-count" class="vx-perf-value">—</div>
<div id="vx-watch-closed-today" class="vx-perf-value">—</div>
<div id="vx-watch-total" class="vx-perf-value">—</div>
<div id="vx-watch-win" class="vx-perf-value">—</div>
</div>
<div class="vx-chart"><strong id="vx-watch-equity-total">—</strong>
<div id="vx-watch-chart-stage" class="vx-chart-stage" hidden><svg id="vx-watch-chart-svg" class="vx-chart-svg"></svg></div>
<div id="vx-watch-chart-empty" class="vx-chart-empty">Loading verified performance…</div></div>
<div id="vx-watch-status" class="vx-perf-status"><span><strong>Loading verified performance</strong></span></div>
</section></main>
<script id="vx-watch-system-script">const money=value=>{const sign='';return sign+'</html>+Math.abs(value);};</script>
</body></html>`;

const snapshot = {
  stale: false,
  updated_at: "2026-09-05T16:00:00.000Z",
  summary: {
    closed_count_today: 13,
    closed_pnl_today: 197.46,
    total_closed_pnl: 21940.77,
    win_rate: 70.63,
  },
  equity_curve: {
    total_realized_pnl: 21940.77,
    points: [
      { date: "2026-05-26", daily_pnl: 2000, cumulative_pnl: 2000 },
      { date: "2026-08-11", daily_pnl: 9000, cumulative_pnl: 11000 },
      { date: "2026-09-03", daily_pnl: 10940.77, cumulative_pnl: 21940.77 },
    ],
  },
};

const out = refinePricingPerformance(renderedPricing, "/pricing", snapshot);
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(!out.includes('id="vx-watch-system-script"'), "broken legacy browser script must be removed");
assert(out.includes('id="vx-watch-closed-count" class="vx-perf-value">13</div>'));
assert(out.includes('id="vx-watch-closed-today" class="vx-perf-value positive">+$197.46</div>'));
assert(out.includes('id="vx-watch-total" class="vx-perf-value positive">+$21,940.77</div>'));
assert(out.includes('id="vx-watch-win" class="vx-perf-value">70.63%</div>'));
assert(out.includes('<strong id="vx-watch-equity-total">+$21,940.77</strong>'));
assert(out.includes('<div id="vx-watch-chart-stage" class="vx-chart-stage">'));
assert(out.includes('<path d="M'));
assert(out.includes('id="vx-watch-chart-empty" class="vx-chart-empty" hidden'));
assert(!out.includes("Loading verified performance…"));
assert(out.includes("Verified performance data"));
assert(out.includes(".vx-chart-empty[hidden]{display:none!important}"));
assert(out.includes("return sign+'$'+Math.abs"), "literal money formatter must survive HTML injection");
assert.strictEqual(refinePricingPerformance(out, "/other", snapshot), out, "non-pricing path must remain untouched");

const unavailable = refinePricingPerformance(renderedPricing, "/pricing", null);
assert(unavailable.includes("Performance source unavailable"));
assert(unavailable.includes("No fallback or simulated values are shown."));
assert(unavailable.includes('id="vx-watch-chart-stage" class="vx-chart-stage" hidden'));
assert(!unavailable.includes('id="vx-watch-system-script"'));

(async () => {
  const fast = await resolveSnapshotWithTimeout(async () => snapshot, 50);
  assert.strictEqual(fast.summary.closed_count_today, 13);
  const timedOut = await resolveSnapshotWithTimeout(() => new Promise(() => {}), 5);
  assert.strictEqual(timedOut, null);
  console.log("Pricing verified-performance rendering fix: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
