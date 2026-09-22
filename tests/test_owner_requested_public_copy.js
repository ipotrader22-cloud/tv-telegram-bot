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

const swing = `<!doctype html><html><head></head><body><p class="hero-copy">${OLD_SWING_COPY}</p></body></html>`;
const swingOut = refineOwnerCopy(swing, SWING_PATH);
assert(swingOut.includes("Active Portfolio based on Vixale's proprietary ranking system."));
assert(swingOut.includes("Positions are added and closed daily. Updated every morning around 10:00 am."));
assert(swingOut.includes(`href="${GUIDE_URL}"`));
assert(swingOut.includes(">trading guide</a>."));
assert(!swingOut.includes(OLD_SWING_COPY));
assert.strictEqual(refineOwnerCopy(swingOut, SWING_PATH), swingOut, "Swing owner-copy refinement must be idempotent");

const swingRu = localizeRussianHtml(swingOut, SWING_PATH);
assert(swingRu.includes("Активный портфель на основе фирменной системы ранжирования Vixale."));
assert(swingRu.includes("Позиции добавляются и закрываются ежедневно. Обновляется каждое утро около 10:00."));
assert(swingRu.includes("См. "));
assert(swingRu.includes(">руководство по торговле</a>."));
assert(swingRu.includes('href="https://ru.vixale.com/trading-guide#swing-trading"'));

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
