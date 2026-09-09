from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


app_path = Path('app.js')
app = app_path.read_text()

app = replace_once(
    app,
    "  const s = data.summary;\n  const optionJournal = data.option_journal || {};",
    "  const s = data.summary;\n  const openPnlValues = (data.open_positions || []).map(row => cleanNumber(row.open_pnl));\n  const dashboardOpenPnl = openPnlValues.some(value => value === '')\n    ? ''\n    : Number(openPnlValues.reduce((sum, value) => sum + value, 0).toFixed(2));\n  const optionJournal = data.option_journal || {};",
    'server snapshot aggregate',
)

app = replace_once(
    app,
    "      <td>${num(row.entry)}</td>\n      <td class=\"muted-dash\">—</td>\n      <td>${num(row.size, 0)}</td>",
    "      <td>${num(row.entry)}</td>\n      <td>${num(row.target) || '—'}</td>\n      <td>${num(row.stop) || '—'}</td>\n      <td>${num(row.size, 0)}</td>",
    'open position target/stop cells',
)

app = replace_once(
    app,
    '<td><span class="open-position-label">OPEN POSITION</span></td>',
    '<td><span class="open-position-label">LIVE POSITION</span></td>',
    'live position badge',
)

app = replace_once(
    app,
    "        <div class=\"card\">\n          <div class=\"label\">Closed P&L Today</div>\n          <div class=\"value ${moneyClass(s.closed_pnl_today)}\">${renderMoney(s.closed_pnl_today)}</div>\n        </div>\n        <div class=\"card\">\n          <div class=\"label\">Total Closed P&L</div>",
    "        <div class=\"card\">\n          <div class=\"label\">Closed P&L Today</div>\n          <div class=\"value ${moneyClass(s.closed_pnl_today)}\">${renderMoney(s.closed_pnl_today)}</div>\n        </div>\n        <div class=\"card vx-dashboard-live-open-pnl-card\">\n          <div class=\"label\">Live Open P&L</div>\n          <div id=\"vx-dashboard-open-live-pnl\" class=\"value ${moneyClass(dashboardOpenPnl)}\">${renderMoney(dashboardOpenPnl) || '—'}</div>\n        </div>\n        <div class=\"card\">\n          <div class=\"label\">Total Closed P&L</div>",
    'native Live Open P&L metric card',
)

app = replace_once(
    app,
    "        <h2>Open Positions</h2>\n        <span>Open P&amp;L updates live. Final exit and result appear after the trade closes.</span>",
    "        <h2>Open Positions</h2>\n        <span>Open P&amp;L updates live. Target and Stop Ref are system reference levels; final exit and result appear after the trade closes.</span>",
    'open positions helper copy',
)

app = replace_once(
    app,
    "              <th>Entry</th>\n              <th>Exit</th>\n              <th>Qty</th>",
    "              <th>Entry</th>\n              <th>Target</th>\n              <th>Stop Ref</th>\n              <th>Qty</th>",
    'open positions headers',
)

old_poll = """        const payload = await response.json();
        const byTradeId = new Map(
          (payload.positions || []).map(position => [String(position.trade_id || ''), position])
        );

        document.querySelectorAll('.public-pnl-row').forEach(row => {
          const tradeId = String(row.dataset.tradeId || '');
          const position = byTradeId.get(tradeId);
          if (!position) return;

          if (position.open_pnl === '' || position.open_pnl === null || position.open_pnl === undefined) return;
          const pnl = Number(position.open_pnl);
          if (!Number.isFinite(pnl)) return;

          const cell = row.querySelector('.js-public-pnl');
          if (!cell) return;

          cell.textContent = publicPnlMoney(pnl);
          setPublicPnlClass(cell, pnl);
        });
"""
new_poll = """        const payload = await response.json();
        const positions = Array.isArray(payload.positions) ? payload.positions : [];
        const byTradeId = new Map(
          positions.map(position => [String(position.trade_id || ''), position])
        );
        const publicRows = Array.from(document.querySelectorAll('.public-pnl-row'));
        let aggregateOpenPnl = 0;
        let aggregateComplete = true;

        publicRows.forEach(row => {
          const tradeId = String(row.dataset.tradeId || '');
          const position = byTradeId.get(tradeId);
          if (!position || position.open_pnl === '' || position.open_pnl === null || position.open_pnl === undefined) {
            aggregateComplete = false;
            return;
          }

          const pnl = Number(position.open_pnl);
          if (!Number.isFinite(pnl)) {
            aggregateComplete = false;
            return;
          }

          aggregateOpenPnl += pnl;
          const cell = row.querySelector('.js-public-pnl');
          if (!cell) return;

          cell.textContent = publicPnlMoney(pnl);
          setPublicPnlClass(cell, pnl);
        });

        const aggregateCell = document.getElementById('vx-dashboard-open-live-pnl');
        if (aggregateCell && aggregateComplete) {
          aggregateCell.textContent = publicPnlMoney(aggregateOpenPnl);
          setPublicPnlClass(aggregateCell, aggregateOpenPnl);
        }
"""
app = replace_once(app, old_poll, new_poll, 'single live P&L polling path')
app_path.write_text(app)

refinement_path = Path('website_dashboard_snapshot_refinement.js')
refinement = refinement_path.read_text()
start_marker = 'const browserScript = `\n<script id="${SCRIPT_ID}">'
end_marker = '\n\nfunction injectScript(html) {'
start = refinement.find(start_marker)
end = refinement.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('refinement browserScript markers not found')

browser_script = '''const browserScript = `
<script id="${SCRIPT_ID}">
(() => {
  const refreshHomeWinRate = async () => {
    const target = document.getElementById('${HOME_WIN_RATE_ID}');
    if (!target || document.hidden) return;
    try {
      const response = await fetch('${PUBLIC_DASHBOARD_WIN_RATE_PATH}', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      const value = Number(payload && payload.win_rate);
      if (!Number.isFinite(value)) return;
      target.textContent = value.toFixed(2) + '%';
    } catch (_) {}
  };

  const boot = () => {
    refreshHomeWinRate();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshHomeWinRate();
  });
})();
</script>`;'''
refinement = refinement[:start] + browser_script + refinement[end:]
refinement_path.write_text(refinement)

test_path = Path('tests/test_dashboard_snapshot_refinement.js')
test = test_path.read_text()
test = replace_once(
    test,
    "    open_positions: [],\n    working_orders: [],",
    "    open_positions: [{\n      system: 'Vixale Edge',\n      trade_id: 'XLE_LONG',\n      open_time: '2026-09-09 09:58:26',\n      symbol: 'XLE',\n      side: 'LONG',\n      entry: 65.53,\n      target: 68.25,\n      stop: 64.10,\n      size: 305,\n      open_pnl: -54.90,\n    }],\n    working_orders: [],",
    'dashboard test open position fixture',
)
test = replace_once(
    test,
    "      open_count: 11,\n      pending_count: 12,",
    "      open_count: 1,\n      pending_count: 12,\n      open_pnl: -54.90,",
    'dashboard test summary fixture',
)
test = replace_once(
    test,
    "  assert.strictEqual((metrics.match(new RegExp(`id=\"${DASHBOARD_OPEN_PNL_ID}\"`, 'g')) || []).length, 1);\n  const closedTodayIndex",
    "  assert.strictEqual((metrics.match(new RegExp(`id=\"${DASHBOARD_OPEN_PNL_ID}\"`, 'g')) || []).length, 1);\n  assert.ok(metrics.includes('-$54.90'), 'Live Open P&L must render the same valid server snapshot shown by the open row before polling starts');\n  const closedTodayIndex",
    'initial aggregate assertion',
)
test = replace_once(
    test,
    "  assert.ok(html.includes(\"fetch('/dashboard/live-pnl.json'\"));\n  assert.ok(html.includes(\"classList.remove('positive', 'negative', 'neutral')\"));",
    "  assert.strictEqual((html.match(/fetch\\('\\/dashboard\\/live-pnl\\.json'/g) || []).length, 1, 'Dashboard must use one live-P&L polling path');\n  assert.ok(html.includes(\"const aggregateCell = document.getElementById('vx-dashboard-open-live-pnl')\"));\n  assert.ok(!html.includes('setDashboardOpenPnlUnavailable'), 'a transient refresh failure must not erase a valid server-rendered P&L snapshot');\n  assert.ok(html.includes(\"classList.remove('positive', 'negative', 'neutral')\"));",
    'single polling assertion',
)
insert_anchor = "  assert.ok(!html.includes('leafByExactText'), 'dashboard layout must not depend on exact runtime text selectors');\n\n"
open_assertions = """  const openSectionStart = html.indexOf('<h2>Open Positions</h2>');
  const openSectionEnd = html.indexOf('<h2>Pending / Working Orders</h2>');
  assert.ok(openSectionStart >= 0 && openSectionEnd > openSectionStart, 'Open Positions section must be present');
  const openSection = html.slice(openSectionStart, openSectionEnd);
  assert.ok(openSection.includes('<th>Target</th>'));
  assert.ok(openSection.includes('<th>Stop Ref</th>'));
  assert.ok(!openSection.includes('<th>Exit</th>'), 'open positions must show Stop Ref instead of a future Exit field');
  assert.ok(openSection.indexOf('<th>Entry</th>') < openSection.indexOf('<th>Target</th>'));
  assert.ok(openSection.indexOf('<th>Target</th>') < openSection.indexOf('<th>Stop Ref</th>'));
  assert.ok(openSection.indexOf('<th>Stop Ref</th>') < openSection.indexOf('<th>Qty</th>'));
  assert.ok(openSection.includes('68.25'), 'Target must mirror the authoritative open-position target');
  assert.ok(openSection.includes('64.10'), 'Stop Ref must mirror the authoritative open-position stop reference');
  assert.ok(openSection.includes('LIVE POSITION'));
  assert.ok(!openSection.includes('OPEN POSITION'));

"""
test = replace_once(test, insert_anchor, insert_anchor + open_assertions, 'open-position presentation assertions')
test_path.write_text(test)

public_test_path = Path('tests/test_public_dashboard_live_pnl.js')
public_test = public_test_path.read_text()
public_test = replace_once(
    public_test,
    "  assert.ok(html.includes(\"fetch('/dashboard/live-pnl.json'\"));\n  assert.ok(html.includes(\"document.addEventListener('visibilitychange'\"));",
    "  assert.ok(html.includes(\"fetch('/dashboard/live-pnl.json'\"));\n  assert.ok(html.includes('id=\"vx-dashboard-open-live-pnl\"'), 'Dashboard renderer must emit the aggregate Live Open P&L card natively');\n  assert.ok(html.includes('$0.00'), 'empty-position Dashboard snapshot must render a zero aggregate rather than depend on client insertion');\n  assert.ok(html.includes(\"document.addEventListener('visibilitychange'\"));",
    'native aggregate public-PnL test',
)
public_test_path.write_text(public_test)
