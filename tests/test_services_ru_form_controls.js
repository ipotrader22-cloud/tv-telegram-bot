"use strict";

const assert = require("assert");
const { localizeRussianHtml } = require("../website_russian_localization");
const { localizeServicesFormPresentation } = require("../website_russian_services_form_copy_refinement");

// Mirror the current serialized Services form-control presentation strings.
// Backend actions and semantic values are included so localization regressions
// cannot accidentally translate submitted contracts while fixing visible copy.
const source = `<!doctype html><html lang="en"><head><title>Services form controls</title></head><body>
<form method="POST" action="/appointment-request">
  <select id="appointment-type" name="appointmentType" required>
    <option value="" disabled selected>Select a topic…</option>
    <option value="automation">Automate trades with TWS / IBKR</option>
    <option value="setup">Set up TWS / API</option>
    <option value="other">Something else</option>
  </select>
  <input name="name" placeholder="John">
  <input name="contact" placeholder="@username or email">
  <input name="best_time" placeholder="Tomorrow afternoon, NY time...">
  <textarea name="notes" placeholder="Example: I have IBKR and TWS installed. I use TradingView alerts. I want signals to place trades automatically..."></textarea>
</form>
<form method="POST" action="/strategy-review">
  <input type="hidden" name="source" value="landing_strategy_form">
  <input name="market" placeholder="Stocks, options, futures, crypto...">
  <textarea name="rules" placeholder="Example: I want to buy when price pulls back after a strong move, enter near... target..., stop..., only during market hours..."></textarea>
</form>
<form method="POST" action="/bot-request">
  <input type="hidden" name="source" value="landing_bot_form">
  <input name="market" placeholder="Stocks, futures, options, crypto...">
  <input name="platform" placeholder="TradingView, NinjaTrader, IBKR, ...">
  <textarea name="bot" placeholder="Example: I want the bot to receive TradingView alerts, place trades in TWS, track positions, and send updates to Telegram..."></textarea>
</form>
<form method="POST" action="/appointment-request">
  <input type="hidden" name="request_type" value="Signals & Research">
  <textarea name="research" placeholder="Example: I want to understand what Day Trading signal/research access is available and what evidence I can review."></textarea>
</form>
</body></html>`;

const localized = localizeServicesFormPresentation(localizeRussianHtml(source, "/services"));
// The runtime localizer intentionally embeds English source keys in <script>.
// Form-copy assertions inspect presentation markup only.
const presentationHtml = localized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

const expectedRussian = [
  "Выберите тему…",
  "Автоматизировать сделки через TWS / IBKR",
  "Настроить TWS / API",
  "Другое",
  'placeholder="Имя"',
  'placeholder="Введите email или @telegram"',
  'placeholder="Завтра днём по времени Нью-Йорка..."',
  "Пример: у меня установлены IBKR и TWS, я использую алерты TradingView и хочу автоматически размещать сделки по сигналам...",
  "Акции, опционы, фьючерсы, крипто...",
  "Пример: хочу покупать после отката вслед за сильным движением, входить около..., цель..., стоп..., только в часы рынка...",
  "Акции, фьючерсы, опционы, крипто...",
  "Пример: хочу, чтобы бот получал алерты TradingView, размещал сделки в TWS, отслеживал позиции и отправлял обновления в Telegram...",
  "Пример: хочу понять, какой доступ к сигналам/исследованиям по дейтрейдингу доступен и какие подтверждающие данные можно изучить.",
];
for (const expected of expectedRussian) {
  assert(presentationHtml.includes(expected), `localized Services form controls must contain: ${expected}`);
}

const forbiddenEnglish = [
  "Select a topic…",
  "Automate trades with TWS / IBKR",
  "Set up TWS / API",
  ">Something else<",
  'placeholder="John"',
  'placeholder="@username or email"',
  'placeholder="Enter email or @telegram"',
  "Example: I have IBKR and TWS installed. I use TradingView alerts. I want signals to place trades automatically...",
  "Stocks, options, futures, crypto...",
  "Example: I want to buy when price pulls back after a strong move, enter near... target..., stop..., only during market hours...",
  "Stocks, futures, options, crypto...",
  "Example: I want the bot to receive TradingView alerts, place trades in TWS, track positions, and send updates to Telegram...",
  "Example: I want to understand what Day Trading signal/research access is available and what evidence I can review.",
];
for (const sourceText of forbiddenEnglish) {
  assert(!presentationHtml.includes(sourceText), `localized Services form controls must not retain: ${sourceText}`);
}

// Brand/platform names are intentionally not forced into artificial translation.
assert(presentationHtml.includes('placeholder="TradingView, NinjaTrader, IBKR, ..."'));

for (const route of ["/appointment-request", "/strategy-review", "/bot-request"]) {
  assert(presentationHtml.includes(`action="${route}"`), `form action must remain unchanged: ${route}`);
}
for (const semanticValue of [
  'value="automation"',
  'value="setup"',
  'value="other"',
  'value="landing_strategy_form"',
  'value="landing_bot_form"',
  'value="Signals & Research"',
]) {
  assert(presentationHtml.includes(semanticValue), `form semantic value must remain unchanged: ${semanticValue}`);
}

assert.strictEqual(
  localizeServicesFormPresentation(localized),
  localized,
  "final Services form presentation pass must be idempotent"
);

console.log("Services RU live form-control localization checks: PASS");
