"use strict";

const assert = require("assert");
const { prepareServicesSourceForPublicIa, SOURCE_MARKER_PREFIX } = require("../website_services_source_parity_fix");
const { renderServicesFromLanding } = require("../website_public_ia_refinement");
const { localizeRussianHtml, translateChunk } = require("../website_russian_localization");

const localizedLandingSource = `<!doctype html><html lang="en"><head><title>Landing</title><link rel="canonical" href="https://www.vixale.com/"></head><body>
<header><nav><a href="#home">Live System</a></nav></header>
<main>
<section id="appointment"><div class="strategy-form-box"><h2>Быстрая консультация по настройке.</h2><p>If you want automation or help getting started, this is the easiest next step.</p><p>Tell us what you have now and we will reply with a simple plan.</p><form method="POST" action="/appointment-request"><label>Your name</label><label>Email or Telegram</label><button>Request Appointment</button></form></div></section>
<section id="strategy-rules"><div class="strategy-form-box"><h2>Отправьте правила вашей стратегии.</h2><p>You do not need to write a perfect technical document. Just describe the idea in your own words.</p><form method="POST" action="/strategy-review"><button>Send My Strategy</button></form></div></section>
<section id="bot-request"><div class="strategy-form-box"><h2>Опишите торгового бота.</h2><p>You do not need to know how to code. Write what the bot should watch, when it should enter, when it should exit, and what broker or platform you want to use.</p><form method="POST" action="/bot-request"><button>Send Bot Request</button></form></div></section>
</main><footer><strong>Important Risk Disclosure:</strong></footer></body></html>`;

const prepared = prepareServicesSourceForPublicIa(localizedLandingSource);
assert(prepared.includes(`${SOURCE_MARKER_PREFIX}:Book a quick setup call.`), "appointment source marker must be added by stable id");
assert(prepared.includes(`${SOURCE_MARKER_PREFIX}:Send us your trading rules.`), "strategy source marker must be added by stable id");
assert(prepared.includes(`${SOURCE_MARKER_PREFIX}:Describe the trading bot you want.`), "bot source marker must be added by stable id");
assert(prepared.includes('id="strategy-review"'), "legacy strategy-rules id must normalize to strategy-review");
assert(!prepared.includes('id="strategy-rules"'), "legacy strategy-rules id must not survive normalization");
assert.strictEqual(prepareServicesSourceForPublicIa(prepared), prepared, "source parity preparation must be idempotent");

const services = renderServicesFromLanding(prepared);
for (const id of ["research-request", "appointment", "strategy-review", "bot-request"]) {
  assert(services.includes(`id="${id}"`), `rendered Services must retain #${id}`);
}
for (const href of ["#research-request", "#appointment", "#strategy-review", "#bot-request"]) {
  assert(services.includes(`href="${href}"`), `Services offer must link to ${href}`);
}
assert(services.includes('action="/appointment-request"'), "Automation form backend route must be preserved");
assert(services.includes('action="/strategy-review"'), "Strategy form backend route must be preserved");
assert(services.includes('action="/bot-request"'), "Bot form backend route must be preserved");

const expectedPairs = [
  ["Need setup, automation, strategy work, or a custom bot?", "Нужна настройка, автоматизация, работа со стратегией или индивидуальный бот?"],
  ["Choose one service path.", "Выберите одно направление услуг."],
  ["Tell us what research or signals you need.", "Расскажите, какие исследования или сигналы вам нужны."],
  ["Automation / Setup consultation", "Консультация по автоматизации / настройке"],
  ["Strategy Review / Development request", "Запрос на анализ / разработку стратегии"],
  ["Describe your bot or integration.", "Опишите нужного бота или интеграцию."],
  ["Important Risk Disclosure:", "Важное раскрытие рисков:"],
];
for (const [source, expected] of expectedPairs) {
  assert.strictEqual(translateChunk(source), expected, `missing Services RU translation: ${source}`);
}

const localized = localizeRussianHtml(services, "/services");
const visibleLikeHtml = localized
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
const renderedPairs = expectedPairs.slice(1, 6);
for (const [, expected] of renderedPairs) {
  assert(visibleLikeHtml.includes(expected), `localized Services output must contain: ${expected}`);
}
for (const [source] of renderedPairs) {
  assert(!visibleLikeHtml.includes(source), `localized Services output must not retain visible source copy: ${source}`);
}
assert(visibleLikeHtml.includes('action="/appointment-request"'), "localization must not change Automation backend route");
assert(visibleLikeHtml.includes('action="/strategy-review"'), "localization must not change Strategy backend route");
assert(visibleLikeHtml.includes('action="/bot-request"'), "localization must not change Bot backend route");

console.log("Services RU source parity and localization checks: PASS");
