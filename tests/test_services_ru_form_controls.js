"use strict";

const assert = require("assert");
const { localizeRussianHtml } = require("../website_russian_localization");

const source = `<!doctype html><html lang="en"><head><title>Services form controls</title></head><body>
<form method="POST" action="/appointment-request">
  <select id="appointment-type" name="appointmentType" required>
    <option value="" disabled selected>Select a topic…</option>
    <option value="automation">Automate trades with TWS / IBKR</option>
    <option value="setup">Set up TWS / API</option>
    <option value="other">Something else</option>
  </select>
  <input name="name" placeholder="John">
  <input name="contact" placeholder="Enter email or @telegram">
  <textarea name="notes" placeholder="Example: “I want to auto-trade my TradingView alerts with IBKR.”"></textarea>
</form>
<form method="POST" action="/strategy-review">
  <input type="hidden" name="source" value="landing_strategy_form">
  <textarea name="rules" placeholder="Example: “Enter when RSI crosses above 50, stop 2%, target 5%.”"></textarea>
</form>
<form method="POST" action="/bot-request">
  <input type="hidden" name="source" value="landing_bot_form">
  <textarea name="bot" placeholder="Example: “Watch 50 stocks, alert me in Telegram, and place orders through IBKR.”"></textarea>
</form>
</body></html>`;

const localized = localizeRussianHtml(source, "/services");
// The runtime localizer intentionally embeds English source keys in <script>.
// Form-copy assertions must inspect rendered presentation markup, not those keys.
const presentationHtml = localized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

const expectedRussian = [
  "Выберите тему…",
  "Автоматизировать сделки через TWS / IBKR",
  "Настроить TWS / API",
  "Другое",
  "placeholder=\"Имя\"",
  "placeholder=\"Введите email или @telegram\"",
  "Пример: «Я хочу автоматически торговать сигналами TradingView через IBKR.»",
  "Пример: «Вход при пересечении RSI уровня 50 снизу вверх, стоп 2%, цель 5%.»",
  "Пример: «Отслеживать 50 акций, присылать уведомления в Telegram и размещать ордера через IBKR.»",
];
for (const expected of expectedRussian) {
  assert(presentationHtml.includes(expected), `localized Services form controls must contain: ${expected}`);
}

const forbiddenEnglish = [
  "Select a topic…",
  "Automate trades with TWS / IBKR",
  "Set up TWS / API",
  ">Something else<",
  "placeholder=\"John\"",
  "placeholder=\"Enter email or @telegram\"",
  "Example: “I want to auto-trade my TradingView alerts with IBKR.”",
  "Example: “Enter when RSI crosses above 50, stop 2%, target 5%.”",
  "Example: “Watch 50 stocks, alert me in Telegram, and place orders through IBKR.”",
];
for (const sourceText of forbiddenEnglish) {
  assert(!presentationHtml.includes(sourceText), `localized Services form controls must not retain: ${sourceText}`);
}

for (const route of ["/appointment-request", "/strategy-review", "/bot-request"]) {
  assert(presentationHtml.includes(`action=\"${route}\"`), `form action must remain unchanged: ${route}`);
}
for (const semanticValue of [
  'value="automation"',
  'value="setup"',
  'value="other"',
  'value="landing_strategy_form"',
  'value="landing_bot_form"',
]) {
  assert(presentationHtml.includes(semanticValue), `form semantic value must remain unchanged: ${semanticValue}`);
}

console.log("Services RU form-control localization checks: PASS");
