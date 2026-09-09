'use strict';

const assert = require('assert');

const {
  HOME_PATH,
  DASHBOARD_PATH,
  STYLE_ID,
  SCRIPT_ID,
  HOME_WIN_RATE_ID,
  DASHBOARD_OPEN_PNL_ID,
  HOME_PREVIEW_COPY,
  refineHome,
  refineDashboard,
  refinePage,
} = require('../website_dashboard_snapshot_refinement');

function homeFixture() {
  return `<!doctype html><html><head></head><body>
    <aside class="vx-home-proof-preview">
      <p class="vx-home-proof-preview-copy">${HOME_PREVIEW_COPY}</p>
      <div class="vx-home-proof-grid">
        <div><span>Open Positions</span><strong data-vx-mirror="vx-home-live-0">1</strong></div>
        <div><span>Pending Setups</span><strong data-vx-mirror="vx-home-live-1">2</strong></div>
        <div><span>Closed P&amp;L Today</span><strong data-vx-mirror="vx-home-live-3">+$10.00</strong></div>
        <div><span>Total Realized P&amp;L</span><strong data-vx-mirror="vx-home-equity-total">+$100.00</strong></div>
      </div>
    </aside>
    <div id="vx-home-live-open-pnl">+$25.00</div>
  </body></html>`;
}

function testHomeRefinement() {
  const html = refineHome(homeFixture());
  assert.ok(!html.includes(HOME_PREVIEW_COPY));
  assert.ok(html.includes('Live Open P&amp;L'));
  assert.ok(html.includes('data-vx-mirror="vx-home-live-open-pnl"'));
  assert.ok(html.includes('<span>Win Rate</span>'));
  assert.ok(html.includes(`id="${HOME_WIN_RATE_ID}"`));
  assert.ok(html.includes(`id="${STYLE_ID}"`));
  assert.ok(html.includes(`id="${SCRIPT_ID}"`));
  assert.ok(html.includes("fetch('/public-performance.json'"));
  assert.strictEqual((html.match(/Live Open P&amp;L/g) || []).length, 1);
  assert.strictEqual((html.match(new RegExp(`id=\\"${HOME_WIN_RATE_ID}\\"`, 'g')) || []).length, 1);
}

function testDashboardRefinement() {
  const source = '<!doctype html><html><head></head><body><h1>Vixale Live Day Trading Dashboard</h1></body></html>';
  const html = refineDashboard(source);
  assert.ok(html.includes(`id="${STYLE_ID}"`));
  assert.ok(html.includes(`id="${SCRIPT_ID}"`));
  assert.ok(html.includes('vx-dashboard-top-layout'));
  assert.ok(html.includes('Open Live P&L'));
  assert.ok(html.includes(`'${DASHBOARD_OPEN_PNL_ID}'`));
  assert.ok(html.includes("fetch('/dashboard/live-pnl.json'"));
  assert.ok(html.includes('grid-template-columns:repeat(7,minmax(0,1fr))'));
}

function testRoutingAndIdempotency() {
  const home = refinePage(homeFixture(), HOME_PATH);
  assert.strictEqual(refinePage(home, HOME_PATH), home);

  const dashboardSource = '<html><head></head><body>dashboard</body></html>';
  const dashboard = refinePage(dashboardSource, DASHBOARD_PATH);
  assert.strictEqual(refinePage(dashboard, DASHBOARD_PATH), dashboard);

  const untouched = '<html><body>other</body></html>';
  assert.strictEqual(refinePage(untouched, '/pricing'), untouched);
}

testHomeRefinement();
testDashboardRefinement();
testRoutingAndIdempotency();
console.log('Dashboard snapshot refinement tests passed.');
