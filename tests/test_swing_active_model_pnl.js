"use strict";

const assert = require("assert");
const {
  QUOTE_API_PATH,
  QUOTE_REFRESH_MS,
  MODEL_ALLOCATION_PER_POSITION,
  PAGE_MARKER,
  STYLE_ID,
  SCRIPT_ID,
  modelShares,
  modelOpenPnl,
  enhanceActivePortfolioTable,
} = require("../website_swing_active_model_pnl");
const { localizeRussianHtml } = require("../website_russian_localization");

assert.strictEqual(MODEL_ALLOCATION_PER_POSITION, 10000);
assert.strictEqual(QUOTE_API_PATH, "/api/swing-leaders");
assert.strictEqual(QUOTE_REFRESH_MS, 60000);
assert(Math.abs(modelShares(193.23) - 51.751798374993534) < 1e-12);
assert(Math.abs(modelOpenPnl(193.23, 203.60) - 536.6661491486832) < 1e-10);

const fixture = `<!doctype html><html><head></head><body>
<section class="section">
  <div class="section-head"><div><h2 id="active-portfolio">Active Portfolio</h2><p>Open model positions using delayed GOOGLEFINANCE quotes for current valuation.</p></div><div class="section-metric"><small>Unrealized Model P&amp;L</small><strong class="loss">-$34.00</strong></div></div>
  <div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Score</th><th>Entry</th><th>Current</th><th>Return</th><th>Research Note</th></tr></thead><tbody>
    <tr><td data-label="Ticker"><strong>ANET</strong><span>NYSE</span></td><td data-label="Score"><strong>80</strong><span>/ 100</span></td><td data-label="Entry">$193.23<span>2026-09-04</span></td><td data-label="Current">$203.60</td><td data-label="Return" class="gain">5.37%</td><td data-label="Research Note" class="note">AI/networking leadership.</td></tr>
    <tr><td data-label="Ticker"><strong>ARM</strong><span>NASDAQ</span></td><td data-label="Score"><strong>87</strong><span>/ 100</span></td><td data-label="Entry">$333.92<span>2026-09-24</span></td><td data-label="Current">$321.17</td><td data-label="Return" class="loss">-3.82%</td><td data-label="Research Note" class="note">AI CPU leadership.</td></tr>
  </tbody></table></div>
</section>
<section class="section"><div><h2>Closed Trades</h2></div><table><thead><tr><th>Current</th><th>Return</th></tr></thead></table></section>
</body></html>`;

const out = enhanceActivePortfolioTable(fixture);
assert(out.includes(PAGE_MARKER));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`), "quote refresh client must be injected");
assert(out.includes("<th>Current</th><th>Quantity</th><th>P&amp;L, $</th><th>Return</th>"));
assert(out.includes('data-vx-model-entry-price="193.23"'), "row must carry its public entry price for safe live P&L recalculation");
assert(out.includes('data-vx-model-entry-price="333.92"'));
assert(out.includes('data-label="Quantity" class="vx-model-shares">52</td>'));
assert(out.includes('data-label="P&L, $" class="vx-model-open-pnl gain">+$536.67</td>'));
assert(out.includes('data-label="Quantity" class="vx-model-shares">30</td>'));
assert(out.includes('data-label="P&L, $" class="vx-model-open-pnl loss">-$381.83</td>'));
assert(out.includes('<strong class="loss">-$34.00</strong>'), "server-rendered aggregate remains unchanged before the first client refresh");
assert(out.includes(`const API_PATH=${JSON.stringify(QUOTE_API_PATH)}`), "client must reuse the sanitized Swing API rather than another quote source");
assert(out.includes(`const REFRESH_MS=${QUOTE_REFRESH_MS}`), "client refresh cadence must be explicit");
assert(out.includes('fetch(API_PATH,{credentials:"same-origin",headers:{Accept:"application/json"}})'), "client must poll the existing same-origin Swing endpoint");
assert(out.includes('rows.length!==active.length||feed.size!==active.length'), "client must not mix quotes across changed portfolio membership");
assert(out.includes('sameEntry(item.entry,moneyNumber(quote.entry_price))'), "client must not apply quotes to a different entry instance");
assert(out.includes('td[data-label="Current"]'), "client must update Current cells");
assert(out.includes('td[data-label="Return"]'), "client must update Return cells");
assert(out.includes('td[data-label="P&L, $"]'), "client must update row dollar P&L");
assert(out.includes('section.querySelector(".section-metric strong")'), "client must update aggregate Unrealized Model P&L from the same API snapshot");
assert(out.includes('document.visibilityState==="hidden"'), "hidden tabs must not poll continuously");
assert(out.includes('<section class="section"><div><h2>Closed Trades</h2></div><table><thead><tr><th>Current</th><th>Return</th></tr></thead></table></section>'), "other tables must remain unchanged");
assert.strictEqual(enhanceActivePortfolioTable(out), out, "refinement must be idempotent");

const ru = localizeRussianHtml(out, "/trading-systems/swing-trading");
assert(ru.includes(`id="${SCRIPT_ID}"`), "RU page must retain the quote-refresh client");
assert(ru.includes(`const API_PATH=${JSON.stringify(QUOTE_API_PATH)}`), "RU page must keep the same sanitized quote endpoint");
assert(ru.includes('data-vx-model-entry-price="193.23"'), "RU localization must preserve quote-refresh row metadata");

console.log("Swing Active Portfolio Quantity/P&L + intraday GOOGLEFINANCE refresh: PASS");
