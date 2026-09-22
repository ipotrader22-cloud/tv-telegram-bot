"use strict";

const assert = require("assert");
const packageJson = require("../package.json");
const { localizeRussianHtml } = require("../website_russian_localization");
const { localizeServicesFormPresentation } = require("../website_russian_services_form_copy_refinement");

const startCommand = String(packageJson?.scripts?.start || "");
assert(
  startCommand.startsWith("node -r ./website_russian_localization.js -r ./website_russian_services_form_copy_refinement.js "),
  "general RU localization must remain first and the Services form-copy safety pass must be second"
);

const currentOptionPairs = Object.freeze([
  Object.freeze(["Automate trades with TWS / IBKR", "Автоматизировать сделки через TWS / IBKR"]),
  Object.freeze(["Help me set everything up", "Помогите мне всё настроить"]),
  Object.freeze(["New to trading systems", "Новичок в торговых системах"]),
  Object.freeze(["I trade manually", "Я торгую вручную"]),
  Object.freeze(["I already have alerts or code", "У меня уже есть алерты или код"]),
  Object.freeze(["I manage a trading audience", "Я работаю с торговой аудиторией"]),
  Object.freeze(["Tell me if this strategy makes sense", "Скажите, имеет ли эта стратегия смысл"]),
  Object.freeze(["Backtest this strategy", "Провести бэктест стратегии"]),
  Object.freeze(["Code this strategy", "Реализовать стратегию в коде"]),
  Object.freeze(["Build a trading bot", "Создать торгового бота"]),
  Object.freeze(["Package this for my audience", "Подготовить решение для моей аудитории"]),
  Object.freeze(["Not sure yet", "Пока не знаю"]),
]);

// Mirror the current serialized Services form-control presentation strings and
// semantic option values captured by production Chromium. Values are backend
// contracts and must remain English/unchanged while labels localize.
const source = `<!doctype html><html lang="en"><head><title>Services form controls</title></head><body>
<form method="POST" action="/appointment-request">
  <select id="appointment-type" name="appointmentType" required>
    <option value="Automate trades with TWS / IBKR">Automate trades with TWS / IBKR</option>
    <option value="Help me set everything up">Help me set everything up</option>
    <option value="New to trading systems">New to trading systems</option>
    <option value="I trade manually">I trade manually</option>
    <option value="I already have alerts or code">I already have alerts or code</option>
    <option value="I manage a trading audience">I manage a trading audience</option>
  </select>
  <input name="name" placeholder="John">
  <input name="contact" placeholder="@username or email">
  <input name="best_time" placeholder="Tomorrow afternoon, NY time...">
  <textarea name="notes" placeholder="Example: I have IBKR and TWS installed. I use TradingView alerts. I want signals to place trades automatically..."></textarea>
</form>
<form method="POST" action="/strategy-review">
  <input type="hidden" name="source" value="landing_strategy_form">
  <input name="market" placeholder="Stocks, options, futures, crypto...">
  <textarea name="rules" placeholder="Example: I want to buy when price pulls back after a strong move, enter near..., target..., stop..., only during market hours..."></textarea>
  <select id="strategy-help" name="strategyHelp" required>
    <option value="Tell me if this strategy makes sense">Tell me if this strategy makes sense</option>
    <option value="Backtest this strategy">Backtest this strategy</option>
    <option value="Code this strategy">Code this strategy</option>
    <option value="Build a trading bot">Build a trading bot</option>
    <option value="Package this for my audience">Package this for my audience</option>
    <option value="Not sure yet">Not sure yet</option>
  </select>
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
  ...currentOptionPairs.map(([, label]) => label),
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
  ...currentOptionPairs.map(([value]) => `>${value}<`),
  'placeholder="John"',
  'placeholder="@username or email"',
  'placeholder="Enter email or @telegram"',
  "Example: I have IBKR and TWS installed. I use TradingView alerts. I want signals to place trades automatically...",
  "Stocks, options, futures, crypto...",
  "Example: I want to buy when price pulls back after a strong move, enter near..., target..., stop..., only during market hours...",
  "Example: I want to buy when price pulls back after a strong move, enter near... target..., stop..., only during market hours...",
  "Stocks, futures, options, crypto...",
  "Example: I want the bot to receive TradingView alerts, place trades in TWS, track positions, and send updates to Telegram...",
  "Example: I want to understand what Day Trading signal/research access is available and what evidence I can review.",
];
for (const sourceText of forbiddenEnglish) {
  assert(!presentationHtml.includes(sourceText), `localized Services form controls must not retain: ${sourceText}`);
}

// Keep historical option mappings safe even though current production no longer
// emits these labels.
const legacyOptions = localizeServicesFormPresentation('<select><option value="" disabled selected>Select a topic…</option><option value="setup">Set up TWS / API</option><option value="other">Something else</option></select>');
assert(legacyOptions.includes("Выберите тему…"));
assert(legacyOptions.includes("Настроить TWS / API"));
assert(legacyOptions.includes("Другое"));
assert(!legacyOptions.includes("Select a topic…"));
assert(!legacyOptions.includes(">Set up TWS / API<"));
assert(!legacyOptions.includes(">Something else<"));

// Brand/platform names are intentionally not forced into artificial translation.
assert(presentationHtml.includes('placeholder="TradingView, NinjaTrader, IBKR, ..."'));

for (const route of ["/appointment-request", "/strategy-review", "/bot-request"]) {
  assert(presentationHtml.includes(`action="${route}"`), `form action must remain unchanged: ${route}`);
}
for (const [value] of currentOptionPairs) {
  assert(presentationHtml.includes(`value="${value}"`), `current option semantic value must remain unchanged: ${value}`);
}
for (const semanticValue of [
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
