'use strict';

const assert = require('assert');
const Module = require('module');

function fakeExpress() {
  return {
    set() {}, use() {}, get() {}, post() {},
    listen() { throw new Error('app.listen must not run while app.js is required by tests'); },
  };
}
fakeExpress.json = () => (_req, _res, next) => next?.();
fakeExpress.urlencoded = () => (_req, _res, next) => next?.();
fakeExpress.text = () => (_req, _res, next) => next?.();

const originalLoad = Module._load;
Module._load = function loadWithTestDoubles(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'googleapis') {
    return { google: { auth: { GoogleAuth: class GoogleAuth {} }, sheets: () => ({}) } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { renderDashboardHtml } = require('../app.js').__test;
Module._load = originalLoad;

const {
  HOME_PATH,
  DASHBOARD_PATH,
  PUBLIC_DASHBOARD_WIN_RATE_PATH,
  STYLE_ID,
  SCRIPT_ID,
  HOME_WIN_RATE_ID,
  DASHBOARD_OPEN_PNL_ID,
  DASHBOARD_HEADER_CLASS,
  DASHBOARD_METRIC_CLASS,
  HOME_PREVIEW_COPY,
  findTagByClass,
  buildDashboardWinRatePayload,
  handlePublicDashboardWinRateRequest,
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

function dashboardFixture() {
  return renderDashboardHtml({
    updated_at: '2026-09-09 16:30:00',
    open_positions: [],
    working_orders: [],
    pending_orders: [],
    recent_closed_trades: [],
    equity_curve: { points: [], total_realized_pnl: 0 },
    option_journal: { trades: [], error: false },
    summary: {
      open_count: 11,
      pending_count: 12,
      closed_count_today: 13,
      closed_pnl_today: 14.15,
      total_closed_pnl: 1617.18,
      win_rate: 68.63,
    },
  });
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(headers) { Object.assign(this.headers, headers); return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function testHomeRefinement() {
  const html = refineHome(homeFixture());
  assert.ok(!html.includes(HOME_PREVIEW_COPY), 'deleted preview sentence must stay absent');
  assert.ok(html.includes('data-vx-mirror="vx-home-live-open-pnl"'));
  assert.ok(html.includes(`id="${HOME_WIN_RATE_ID}"`));
  assert.ok(html.includes(`id="${STYLE_ID}"`));
  assert.ok(html.includes(`id="${SCRIPT_ID}"`));
  assert.ok(html.includes(`fetch('${PUBLIC_DASHBOARD_WIN_RATE_PATH}'`));
  assert.ok(!html.includes("fetch('/public-performance.json'"), 'homepage Win Rate must not use the broader public-performance denominator');
  assert.ok(html.includes("value.toFixed(2) + '%'"), 'homepage Win Rate must format the dashboard value to two decimals');

  const proofRange = findTagByClass(html, 'div', 'vx-home-proof-grid');
  assert.ok(proofRange, 'homepage proof grid must exist');
  const proof = html.slice(proofRange.start, proofRange.end);
  const labels = [...proof.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(match => match[1].replace(/&amp;/g, '&'));
  assert.deepStrictEqual(labels, [
    'Open Positions',
    'Pending Setups',
    'Closed P&L Today',
    'Total Realized P&L',
    'Live Open P&L',
    'Win Rate',
  ]);
  assert.strictEqual((proof.match(/Live Open P&amp;L/g) || []).length, 1, 'homepage snapshot must contain one Live Open P&L');
  assert.strictEqual((proof.match(/<span>Win Rate<\/span>/g) || []).length, 1, 'homepage snapshot must contain one Win Rate');
}

function testDashboardRefinement() {
  const source = dashboardFixture();
  assert.ok(source.includes('Vixale Live Strategy Dashboard'), 'test must exercise the real renderer title that broke the old selector');
  const html = refineDashboard(source);

  assert.ok(html.includes('<h1>Vixale Live Day Trading Dashboard</h1>'));
  assert.ok(html.includes('Private live day-trading forward-test / paper-trading tracker'));
  assert.ok(!html.includes('<h1>Vixale Live Strategy Dashboard</h1>'));
  assert.ok(html.includes(`id="${STYLE_ID}"`));
  assert.ok(html.includes(`id="${SCRIPT_ID}"`));

  const headerRange = findTagByClass(html, 'div', DASHBOARD_HEADER_CLASS);
  const metricRange = findTagByClass(html, 'div', DASHBOARD_METRIC_CLASS);
  assert.ok(headerRange, 'desktop header grid must be emitted server-side');
  assert.ok(metricRange, 'seven-card metric row must be emitted server-side');
  const header = html.slice(headerRange.start, headerRange.end);
  const metrics = html.slice(metricRange.start, metricRange.end);

  assert.ok(header.includes('<strong>Vixale Prime</strong>'));
  assert.ok(header.includes('<strong>Vixale Edge</strong>'));
  assert.ok(header.indexOf('Vixale Prime') < header.indexOf('Vixale Edge'));
  assert.ok(html.indexOf('Last refreshed:') > headerRange.end, 'refresh line must sit below the primary header row');
  assert.ok(html.indexOf('Last refreshed:') < metricRange.start, 'refresh line must remain above the metric strip');
  assert.ok(html.includes('Option Straddles'), 'existing third strategy note must not be deleted');
  assert.ok(html.indexOf('Option Straddles') > metricRange.end, 'other strategy note must not force Prime/Edge or metrics downward');

  assert.strictEqual((metrics.match(/Live Open P&amp;L/g) || []).length, 1, 'dashboard must contain exactly one Live Open P&L card');
  assert.strictEqual((metrics.match(new RegExp(`id="${DASHBOARD_OPEN_PNL_ID}"`, 'g')) || []).length, 1);
  const closedTodayIndex = metrics.indexOf('Closed P&L Today');
  const liveIndex = metrics.indexOf('Live Open P&amp;L');
  const totalIndex = metrics.indexOf('Total Closed P&L');
  assert.ok(closedTodayIndex >= 0 && closedTodayIndex < liveIndex && liveIndex < totalIndex, 'metric order must be Closed P&L Today → Live Open P&L → Total Closed P&L');

  assert.ok(html.includes("fetch('/dashboard/live-pnl.json'"));
  assert.ok(html.includes("classList.remove('positive', 'negative', 'neutral')"));
  assert.ok(html.includes("el.classList.add('positive')"));
  assert.ok(html.includes("el.classList.add('negative')"));
  assert.ok(html.includes("el.classList.add('neutral')"));
  assert.ok(!html.includes('cloneNode('), 'dashboard card insertion must not depend on runtime DOM cloning');
  assert.ok(!html.includes('locateMetricCard'), 'dashboard card insertion must not use heuristic runtime card detection');
  assert.ok(!html.includes('leafByExactText'), 'dashboard layout must not depend on exact runtime text selectors');

  assert.ok(html.includes(`grid-template-columns:repeat(7,minmax(0,1fr))`));
  assert.ok(html.includes(`@media(max-width:1180px){.${DASHBOARD_HEADER_CLASS}{grid-template-columns:1fr}`));
  assert.ok(html.includes(`@media(max-width:760px){.${DASHBOARD_METRIC_CLASS}{grid-template-columns:repeat(2,minmax(0,1fr))`));
}

async function testAuthoritativeWinRateProjection() {
  assert.deepStrictEqual(
    buildDashboardWinRatePayload({ summary: { win_rate: 68.63 }, open_positions: [{ secret: true }] }),
    { ok: true, win_rate: 68.63 },
  );
  assert.strictEqual(buildDashboardWinRatePayload({ summary: { win_rate: null } }), null);

  const response = responseRecorder();
  let calls = 0;
  await handlePublicDashboardWinRateRequest({}, response, {
    getDashboardData: async () => {
      calls += 1;
      return { summary: { win_rate: 68.63 }, open_positions: [{ trade_id: 'PRIVATE' }] };
    },
  });
  assert.strictEqual(calls, 1, 'public projection must call the authoritative Dashboard data builder once');
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, { ok: true, win_rate: 68.63 });
  assert.deepStrictEqual(Object.keys(response.body).sort(), ['ok', 'win_rate']);
  assert.ok(!JSON.stringify(response.body).includes('PRIVATE'), 'public endpoint must expose only the aggregate Win Rate');
  assert.match(response.headers['Cache-Control'], /no-store/);

  const unavailable = responseRecorder();
  await handlePublicDashboardWinRateRequest({}, unavailable, { appApi: {} });
  assert.strictEqual(unavailable.statusCode, 503);
  assert.deepStrictEqual(unavailable.body, { ok: false, error: 'dashboard_win_rate_unavailable' });
}

function testRoutingAndIdempotency() {
  const home = refinePage(homeFixture(), HOME_PATH);
  assert.strictEqual(refinePage(home, HOME_PATH), home);

  const dashboard = refinePage(dashboardFixture(), DASHBOARD_PATH);
  assert.strictEqual(refinePage(dashboard, DASHBOARD_PATH), dashboard);

  const untouched = '<html><body>other</body></html>';
  assert.strictEqual(refinePage(untouched, '/pricing'), untouched);
}

(async () => {
  testHomeRefinement();
  testDashboardRefinement();
  await testAuthoritativeWinRateProjection();
  testRoutingAndIdempotency();
  console.log('Dashboard snapshot refinement tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
