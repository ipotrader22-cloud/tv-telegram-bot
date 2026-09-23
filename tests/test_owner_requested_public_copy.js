"use strict";

const assert = require("assert");
const {
  HOME_PATH,
  SWING_PATH,
  GUIDE_URL,
  OLD_SWING_COPY,
  refineOwnerCopy,
} = require("../website_owner_copy_refinement");
const { localizeRussianHtml } = require("../website_russian_localization");
const { renderHowSummaryCard } = require("../website_swing_ui_refinement");
const {
  OPTIONS_PATH,
  buildPublicPreview,
  renderOptionsSalesMain,
  refineOptionsSalesPage,
} = require("../website_options_sales_page_refinement");

const swing = `<!doctype html><html><head></head><body><h1>Follow a portfolio reviewed every day.</h1><p class="hero-copy">${OLD_SWING_COPY}</p></body></html>`;
const swingOut = refineOwnerCopy(swing, SWING_PATH);
assert(swingOut.includes("Active Portfolio based on Vixale's proprietary ranking system."));
assert(swingOut.includes("<h1>Active Portfolio</h1>"));
assert(swingOut.includes('class="vx-swing-copy-row">Positions are added and closed daily.</span>'));
assert(swingOut.includes('class="vx-swing-copy-row">Updated every morning around 10:00 am. Refer to the <a'));
assert(swingOut.includes(`href="${GUIDE_URL}"`));
assert(swingOut.includes(">trading guide</a>."));
assert(!swingOut.includes(OLD_SWING_COPY));
assert.strictEqual(refineOwnerCopy(swingOut, SWING_PATH), swingOut, "Swing owner-copy refinement must be idempotent");

const swingRu = localizeRussianHtml(swingOut, SWING_PATH);
assert(swingRu.includes("Активный портфель на основе фирменной системы ранжирования Vixale."));
assert(swingRu.includes("Позиции добавляются и закрываются ежедневно."));
assert(swingRu.includes("Обновляется каждое утро около 10:00. См. "));
assert(swingRu.includes(">руководство по торговле</a>."));
assert(swingRu.includes('href="https://ru.vixale.com/trading-guide#swing-trading"'));

const cards = renderHowSummaryCard();
assert(cards.includes("Stocks that are currently in the Active portfolio. Positions are monitored for Profit target/Stop Loss/or Removal due to ratings change. Check every morning around 10:06 for updates."));
assert(cards.includes("Closed positions due to Profit Target/Stop/Removal from the Active Portfolio."));
assert(cards.includes("<strong>Profit Target:</strong> A +10% target may fill during the day."));
assert(cards.includes("<strong>Stop:</strong> The 5% stop reference triggers only on daily close and checked during the scheduled morning review."));
assert(cards.includes("Position can also be removed from Active Portfolio if ranking goes below 70."));
const cardsRu = localizeRussianHtml(`<!doctype html><html><body>${cards}</body></html>`, SWING_PATH);
assert(cardsRu.includes("Акции, которые в настоящее время находятся в Активном портфеле."));
assert(cardsRu.includes("10:06"));
assert(cardsRu.includes("<strong>Цель прибыли:</strong> Цель +10% может быть исполнена в течение дня."));
assert(cardsRu.includes("<strong>Стоп:</strong> Уровень стопа 5% срабатывает только по закрытию дня"));
assert(cardsRu.includes("рейтинг опустится ниже 70"));
assert(cardsRu.includes("$10,000"));

for (const source of [
  "Closed Trades ledger · realized P&amp;L source",
  "Closed Trades ledger · realized P&amp;amp;L source",
  "Closed Trades ledger · realized P&L source",
  "Verified · Closed Trades ledger",
]) {
  const out = refineOwnerCopy(`<button>${source}</button>`, HOME_PATH);
  assert(out.includes("Closed Trades P&L"), `must normalize home label variant: ${source}`);
  assert(!out.includes("Closed Trades P&amp;L"), `must not pre-escape the final visible label: ${source}`);
  assert(!out.includes(source), `must remove old home label variant: ${source}`);
}

const homeRu = localizeRussianHtml(`<!doctype html><html><head></head><body>${refineOwnerCopy("<button>Closed Trades ledger · realized P&amp;L source</button>", HOME_PATH)}</body></html>`, HOME_PATH);
assert(homeRu.includes("P&L закрытых сделок"));

const optionRows = [
  ["ID", "Trade Date", "Entry Time", "Symbol", "Strategy", "Legs", "Expiration", "Contracts", "Multiplier", "Trade Type", "Entry Price", "Exit Date", "Exit Time", "Exit Price", "Fees", "Status"],
  ["OPT-001", "2026-09-10", "10:15", "AAPL", "Iron Condor", "180/185C + 170/165P", "2026-10-16", "1", "100", "Credit", "2.50", "2026-09-15", "13:20", "1.10", "2.00", "Closed"],
  ["OPT-PRIVATE-OPEN", "2026-09-22", "11:00", "PRIVATE", "Open Strategy", "SHOULD NOT BE PUBLIC", "2026-11-20", "1", "100", "Debit", "1.00", "", "", "", "0", "Open"],
];
const optionPreview = buildPublicPreview(optionRows);
assert(optionPreview.available, "Options public preview should use an actual closed Option Journal row");
assert.strictEqual(optionPreview.trade.symbol, "AAPL");
assert.strictEqual(optionPreview.trade.pnl, 138);
const optionMain = renderOptionsSalesMain(optionPreview, "en");
assert(optionMain.includes("Follow our options trades, from entry to exit."));
assert(optionMain.includes("OPTIONS · $49/MONTH"));
assert(optionMain.includes("Request Options Access"));
assert(optionMain.includes("See How It Works ↓"));
assert(optionMain.includes("Updated daily on the website."));
assert(optionMain.includes("Take a look inside."));
assert(optionMain.includes("ACTUAL OPTIONS DASHBOARD EXAMPLE"));
assert(optionMain.includes("AAPL"));
assert(optionMain.includes("180/185C + 170/165P"));
assert(optionMain.includes("2026-09-10"));
assert(optionMain.includes("2026-09-15"));
assert(optionMain.includes("+$138.00"));
assert(!optionMain.includes("PRIVATE"), "public preview must not expose the current open trade");
assert(!optionMain.includes("SHOULD NOT BE PUBLIC"), "public preview must not expose current open-position details");
assert(optionMain.includes("See new positions"));
assert(optionMain.includes("Follow daily updates"));
assert(optionMain.includes("Review completed trades"));
assert(optionMain.includes("The results are part of the service."));
assert(optionMain.includes("Past performance does not guarantee future results."));
assert(optionMain.includes("Get Options access for $49/month."));
assert(optionMain.includes("Paid onboarding is currently handled manually through Vixale on Telegram."));
assert(optionMain.includes("Compare All Three Systems →"));
assert(optionMain.includes("Before you join"));
assert(optionMain.includes("Options updates are currently available on the website."));
assert(optionMain.includes("Options trading involves risk. A subscription does not guarantee profits."));
assert(optionMain.includes('href="/trading-systems/day-trading"'));
assert(optionMain.includes('href="/trading-systems/swing-trading"'));
assert(optionMain.includes('href="/pricing"'));
assert(!optionMain.includes("protected journal"));
assert(!optionMain.includes("evidence boundary"));
assert(!optionMain.includes("owner-entered records"));
assert(!optionMain.includes("existing viewer access"));
assert(!optionMain.includes("real-time Options Signals"));

const optionFixture = `<!doctype html><html><head><title>Old Options</title></head><body><main><div data-vx-conversion-system-page="options">protected journal evidence boundary owner-entered records</div></main></body></html>`;
const optionOut = refineOptionsSalesPage(optionFixture, optionPreview, "en");
assert(optionOut.includes('data-vx-options-sales-page="1"'));
assert(optionOut.includes('id="vx-options-sales-page-style"'));
assert(!optionOut.includes("protected journal evidence boundary owner-entered records"));
assert.strictEqual(refineOptionsSalesPage(optionOut, optionPreview, "en"), optionOut, "Options sales refinement must be idempotent");

const optionRu = renderOptionsSalesMain(optionPreview, "ru");
assert(optionRu.includes("Следите за нашими опционными сделками от входа до выхода."));
assert(optionRu.includes("Запросить доступ к опционам"));
assert(optionRu.includes("Обновляется ежедневно на сайте."));
assert(optionRu.includes("Результаты входят в сервис."));
assert(optionRu.includes("Торговля опционами связана с риском. Подписка не гарантирует прибыль."));
assert(!optionRu.includes("Follow our options trades"));

const unrelated = "<html><body>Unrelated page</body></html>";
assert.strictEqual(refineOwnerCopy(unrelated, "/pricing"), unrelated);
assert.strictEqual(refineOptionsSalesPage(unrelated, optionPreview, "/pricing"), unrelated);
console.log("Owner-requested Swing copy, Closed Trades label, and Options sales page EN/RU: PASS");
