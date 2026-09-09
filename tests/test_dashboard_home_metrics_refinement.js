"use strict";

const assert = require("assert");
const packageJson = require("../package.json");
const {
  HOME_PATH,
  DASHBOARD_PATH,
  PERFORMANCE_PATH,
  DASHBOARD_LIVE_PNL_PATH,
  STYLE_ID,
  SCRIPT_ID,
  HOME_WIN_RATE_ID,
  DASHBOARD_OPEN_PNL_ID,
  PREVIEW_COPY,
  refineDashboardHomeMetrics,
} = require("../website_dashboard_home_metrics_refinement");

const start = packageJson.scripts.start;
assert(start.includes("-r ./website_dashboard_home_metrics_refinement.js"));
assert(
  start.indexOf("-r ./website_dashboard_home_metrics_refinement.js") < start.indexOf("-r ./website_home_system_selector_refinement.js"),
  "metrics refinement must preload before selector so its response transform sees the composed homepage preview"
);

const home = `<!doctype html><html><head></head><body>
<aside class="vx-home-proof-preview">
  <p class="vx-home-proof-preview-copy">${PREVIEW_COPY}</p>
  <div class="vx-home-proof-grid">
    <div><span>Open Positions</span><strong data-vx-mirror="vx-home-live-0">1</strong></div>
    <div><span>Pending Setups</span><strong data-vx-mirror="vx-home-live-1">2</strong></div>
    <div><span>Closed P&amp;L Today</span><strong data-vx-mirror="vx-home-live-3">+$10.00</strong></div>
    <div><span>Total Realized P&amp;L</span><strong data-vx-mirror="vx-home-equity-total">+$100.00</strong></div>
  </div>
</aside>
<div id="vx-home-live-open-pnl">+$25.50</div>
</body></html>`;

const refinedHome = refineDashboardHomeMetrics(home, HOME_PATH);
assert(!refinedHome.includes(PREVIEW_COPY), "requested preview sentence must be removed");
assert(refinedHome.includes("Live Open P&amp;L"));
assert(refinedHome.includes('data-vx-mirror="vx-home-live-open-pnl"'));
assert(refinedHome.includes("Win Rate"));
assert(refinedHome.includes(`id="${HOME_WIN_RATE_ID}"`));
assert(refinedHome.includes(`fetch('${PERFORMANCE_PATH}'`));
assert(refinedHome.includes("payload.summary.win_rate"));
assert(refinedHome.includes("value.toFixed(2) + '%'"));
assert(refinedHome.includes(`id="${STYLE_ID}"`));
assert(refinedHome.includes(`id="${SCRIPT_ID}"`));
assert.strictEqual((refinedHome.match(/<span>Live Open P&amp;L<\/span>/g) || []).length, 1);
assert.strictEqual(refineDashboardHomeMetrics(refinedHome, HOME_PATH), refinedHome, "home refinement must be idempotent");

const dashboard = `<!doctype html><html><head></head><body>
<div class="dashboard-header"><h1>Vixale Live Day Trading Dashboard</h1><p>Private live day-trading forward-test / paper-trading tracker</p></div>
<div class="system-grid"><div class="system-card"><strong>Vixale Prime</strong><p>Vixale Prime trades only intraday and closes all positions by 16:00 ET.</p></div><div class="system-card"><strong>Vixale Edge</strong><p>Vixale Edge can hold positions overnight when trade conditions remain active.</p></div></div>
<div class="summary-grid"><div class="summary-card"><div>Closed P&amp;L Today</div><div class="negative">-$486.72</div></div></div>
</body></html>`;

const refinedDashboard = refineDashboardHomeMetrics(dashboard, DASHBOARD_PATH);
assert(refinedDashboard.includes(`id="${STYLE_ID}"`));
assert(refinedDashboard.includes(`id="${SCRIPT_ID}"`));
assert(refinedDashboard.includes("vx-dashboard-title-inline"));
assert(refinedDashboard.includes("vx-dashboard-system-panels-inline"));
assert(refinedDashboard.includes("Vixale Prime"));
assert(refinedDashboard.includes("Vixale Edge"));
assert(refinedDashboard.includes("Closed P&L Today"));
assert(refinedDashboard.includes("Open Live P&L"));
assert(refinedDashboard.includes(`id="${DASHBOARD_OPEN_PNL_ID}"`));
assert(refinedDashboard.includes(`fetch('${DASHBOARD_LIVE_PNL_PATH}'`));
assert(refinedDashboard.includes("positions = Array.isArray"));
assert(refinedDashboard.includes("total += Number(position.open_pnl)"));
assert(refinedDashboard.includes("scheduleDashboardPnl(2000)"));
assert(refinedDashboard.includes("document.addEventListener('visibilitychange'"));
assert.strictEqual(refineDashboardHomeMetrics(refinedDashboard, DASHBOARD_PATH), refinedDashboard, "dashboard refinement must be idempotent");
assert.strictEqual(refineDashboardHomeMetrics(home, "/pricing"), home, "unrelated routes must remain unchanged");

console.log("Dashboard + homepage live metric presentation: PASS");
