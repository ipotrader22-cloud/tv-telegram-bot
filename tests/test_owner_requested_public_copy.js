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

const unrelated = "<html><body>Unrelated page</body></html>";
assert.strictEqual(refineOwnerCopy(unrelated, "/pricing"), unrelated);
console.log("Owner-requested Swing copy and Closed Trades label EN/RU: PASS");
