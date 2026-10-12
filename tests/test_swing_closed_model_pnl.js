'use strict';

const assert = require('assert');
const fs = require('fs');
const { renderSwingLeadersHtml } = require('../lib/swing-leaders');
const { translateHtmlText } = require('../website_russian_localization');

const snapshot = {
  snapshot_date: '2026-10-12', snapshot_time_et: '13:55 ET', market_posture: 'Selective',
  active_count: 0, intern_count: 0, cash_pct: '100%', quote_source: 'GOOGLEFINANCE',
  quote_delay_notice: 'Delayed quotes.', research_disclaimer: 'Research model.',
  active_portfolio: [], interns: [], closed_trades: [],
};
const trade = (ticker, entry_price, exit_price, return_pct) => ({
  ticker, entry_price, exit_price, return_pct, entry_date: '2026-10-01',
  exit_date: '2026-10-12', last_score: 80, exit_reason: 'TARGET', shares: 999999,
});
snapshot.closed_trades = [
  trade('GAIN', '$228.68', '$234.65', '2.61%'),
  trade('LOSS', '$1,090.27', '$997.63', '-8.50%'),
  trade('FLAT', '$100', '$100', '0%'),
  trade('PRECISION', '$100.123456', '$110.1358016', '10.00%'),
  trade('TOTALLOSS', '$100', '$0', '-100%'),
  trade('BAD', 'unavailable', '$100', '0%'),
  trade('ZEROENTRY', '$0', '$100', '0%'),
];
const before = JSON.stringify(snapshot);
const html = renderSwingLeadersHtml(snapshot);
assert.strictEqual(JSON.stringify(snapshot), before, 'rendering must not mutate source data');
assert(html.includes('<th>Return</th><th>P&amp;L ($)</th><th>Entry Date</th>'));
const cells = [...html.matchAll(/<td data-label="P&amp;L \(\$\)" class="(\w+)">([^<]+)<\/td>/g)]
  .map(match => [match[1], match[2]]);
assert.deepStrictEqual(cells, [
  ['gain', '+$261.06'], ['loss', '-$849.70'], ['flat', '$0.00'],
  ['gain', '+$1,000.00'], ['loss', '-$10,000.00'], ['flat', '—'], ['flat', '—'],
]);
assert(html.includes('-$9,589.00'), 'existing total must still use feed return percentages');
const closedTable = html.split('<th>P&amp;L ($)</th>')[1].split('</table>')[0];
assert.strictEqual((closedTable.match(/<td /g) || []).length, 7 * 9);
assert(translateHtmlText(html).includes('+$261.06'), 'Russian output preserves dollar values');
assert(translateHtmlText(html).includes('data-label="P&amp;L ($)"'));
assert(renderSwingLeadersHtml({ ...snapshot, closed_trades: [] }).includes('colspan="9" class="empty">No closed trades'));
const source = fs.readFileSync(require.resolve('../website_swing_equity_live_refresh'), 'utf8');
assert(source.includes('reviewSignature(root)'), 'review-aware refresh remains intact');
console.log('Swing closed normalized P&L tests passed');
