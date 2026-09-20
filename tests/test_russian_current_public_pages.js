"use strict";

const assert = require("assert");
const {
  RUNTIME_SCRIPT_ID,
  translateChunk,
  translateRuntimeChunk,
  localizeRussianHtml,
} = require("../website_russian_localization");

const representative = [
  ["Live stock signals and P&L.", "Сигналы по акциям и P&L в реальном времени."],
  ["Day Trading — Live Overview", "Дейтрейдинг — обзор в реальном времени"],
  ["Follow positions from open to close.", "Следите за позициями от открытия до закрытия."],
  ["Options — Daily Position Updates", "Опционы — ежедневные обновления позиций"],
  ["Trading results, by system.", "Результаты торговли по каждой системе."],
  ["Latest published Swing portfolio", "Последний опубликованный свинг-портфель"],
  ["Choose one system or follow all three.", "Выберите одну систему или следите за всеми тремя."],
  ["A request, not a fake checkout.", "Запрос на подключение, а не имитация оплаты."],
];

for (const [source, expected] of representative) {
  assert.strictEqual(translateChunk(source), expected, `missing current-page translation: ${source}`);
  assert.strictEqual(translateRuntimeChunk(source), expected, `missing runtime current-page translation: ${source}`);
}

assert.strictEqual(
  translateRuntimeChunk("Last updated: 9/20/2026, 7:35:00 PM"),
  "Последнее обновление: 9/20/2026, 7:35:00 PM"
);
assert.strictEqual(
  translateRuntimeChunk("Day Trading realized P&L history; latest +$23,390.02"),
  "История реализованного P&L дейтрейдинга; последнее значение: +$23,390.02"
);
assert.strictEqual(
  translateRuntimeChunk("Swing Trading model P&L equity history; latest +$1,234.56"),
  "История капитала модельного P&L свинг-трейдинга; последнее значение: +$1,234.56"
);
assert.strictEqual(translateRuntimeChunk("Score 91"), "Рейтинг 91");
assert.strictEqual(
  translateRuntimeChunk("Research/model portfolio · latest published update Sep 20, 2026"),
  "Исследовательский/модельный портфель · последнее опубликованное обновление Sep 20, 2026"
);
assert.strictEqual(
  translateRuntimeChunk("Research/model portfolio · latest published update Sep 20, 2026 · last validated snapshot"),
  "Исследовательский/модельный портфель · последнее опубликованное обновление Sep 20, 2026 · последний подтверждённый снимок"
);

// Server pass translates exact raw nodes when they match. Browser runtime pass
// is still required because generated HTML often encodes ampersands as &amp;
// and page scripts later replace visible text after the response has arrived.
const sample = `<!doctype html><html lang="en"><head><title>Vixale | Pricing</title></head><body>
<h1>Choose one system or follow all three.</h1>
<div>Open P&amp;L</div>
<div id="dynamic">Loading current public status…</div>
<script>document.getElementById('dynamic').textContent='Last updated: unavailable';</script>
</body></html>`;
const localized = localizeRussianHtml(sample, "/pricing");
assert.match(localized, /<html lang="ru">/);
assert.match(localized, /Vixale \| Тарифы/);
assert.match(localized, /Выберите одну систему или следите за всеми тремя\./);
assert.match(localized, new RegExp(`id="${RUNTIME_SCRIPT_ID}"`));
assert.match(localized, /Последнее обновление:/, "runtime pattern catalog must be embedded");
assert.match(localized, /Открытый P&L/, "decoded browser-visible Open P&L translation must be embedded");
assert.match(localized, /document\.getElementById\('dynamic'\)\.textContent='Last updated: unavailable'/, "page script must remain byte-for-byte unchanged");

const secondPass = localizeRussianHtml(localized, "/pricing");
assert.strictEqual(secondPass, localized, "runtime localizer injection must be idempotent");

const unknown = "Unknown future conversion copy with Open Positions inside it.";
assert.strictEqual(translateRuntimeChunk(unknown), unknown, "runtime pass must not perform fragment substitution");

console.log("Russian current public-page localization checks: PASS");
