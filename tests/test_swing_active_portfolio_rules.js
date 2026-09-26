"use strict";

const assert = require("assert");
const {
  SWING_PATH,
  STYLE_ID,
  RULES_CLASS,
  requestLocale,
  renderRules,
  refineSwingActivePortfolioRules,
} = require("../website_swing_active_portfolio_rules_refinement");

assert.strictEqual(SWING_PATH, "/trading-systems/swing-trading");
assert.strictEqual(requestLocale({ headers: { host: "www.vixale.com" } }), "en");
assert.strictEqual(requestLocale({ headers: { host: "ru.vixale.com" } }), "ru");

const fixture = `<!doctype html><html><head><title>Swing</title></head><body><main data-vx-conversion-system-page="swing"><section class="section"><div class="section-head"><div><h2>Active Portfolio</h2><p>Open model positions using delayed GOOGLEFINANCE quotes for current valuation.</p></div><div class="section-metric"><small>Unrealized Model P&amp;L</small><strong>+$1,339.00</strong></div></div><div class="table-wrap">TABLE</div></section></main></body></html>`;

const en = refineSwingActivePortfolioRules(fixture, "en");
assert(en.includes(`id="${STYLE_ID}"`));
assert(en.includes(`class="${RULES_CLASS}"`));
assert(en.includes("Target +10%"));
assert(en.includes("May trigger intraday as soon as price reaches +10% from entry."));
assert(en.includes("Stop -5%"));
assert(en.includes("Evaluated on the daily close only; triggered when the closing price is more than 5% below entry."));
assert(en.includes("Open model positions using delayed GOOGLEFINANCE quotes for current valuation."));
assert(en.includes("Unrealized Model P&amp;L"));
assert(en.indexOf("Open model positions") < en.indexOf("Target +10%"));
assert(en.indexOf("Target +10%") < en.indexOf("Unrealized Model P&amp;L"));
assert.strictEqual(refineSwingActivePortfolioRules(en, "en"), en, "rule summary refinement must be idempotent");

const ru = refineSwingActivePortfolioRules(fixture, "ru");
assert(ru.includes("Цель +10%"));
assert(ru.includes("Может сработать внутри дня, как только цена достигнет +10% от цены входа."));
assert(ru.includes("Стоп -5%"));
assert(ru.includes("Оценивается только по дневному закрытию; срабатывает, если цена закрытия более чем на 5% ниже цены входа."));

const rules = renderRules("en");
assert(rules.includes('aria-label="Profit target and stop rules"'));

const unrelated = "<html><head></head><body><h2>Closed Trades</h2></body></html>";
assert.strictEqual(refineSwingActivePortfolioRules(unrelated, "en"), unrelated);

console.log("Swing Active Portfolio target/stop summary EN/RU: PASS");
