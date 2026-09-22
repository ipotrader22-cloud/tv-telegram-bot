"use strict";

const assert = require("assert");
const { chromium } = require("playwright");

const RU_ORIGIN = String(process.env.QA_RU_ORIGIN || "https://ru.vixale.com").replace(/\/$/, "");
const URL = `${RU_ORIGIN}/services`;

const VIEWPORTS = Object.freeze([
  Object.freeze({ name: "desktop", width: 1440, height: 1000 }),
  Object.freeze({ name: "mobile", width: 390, height: 844 }),
]);

const EXPECTED_PLACEHOLDERS = Object.freeze([
  "Имя",
  "Введите email или @telegram",
  "Завтра днём по времени Нью-Йорка...",
  "Пример: у меня установлены IBKR и TWS, я использую алерты TradingView и хочу автоматически размещать сделки по сигналам...",
  "Акции, опционы, фьючерсы, крипто...",
  "Пример: хочу покупать после отката вслед за сильным движением, входить около..., цель..., стоп..., только в часы рынка...",
  "Акции, фьючерсы, опционы, крипто...",
  "Пример: хочу, чтобы бот получал алерты TradingView, размещал сделки в TWS, отслеживал позиции и отправлял обновления в Telegram...",
  "Пример: хочу понять, какой доступ к сигналам/исследованиям по дейтрейдингу доступен и какие подтверждающие данные можно изучить.",
]);

// Exact current production option values and their RU presentation labels.
// The semantic values must stay English/byte-equivalent; only visible labels localize.
const EXPECTED_OPTION_PAIRS = Object.freeze([
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

const FORBIDDEN_ENGLISH = Object.freeze([
  "John",
  "@username or email",
  "Enter email or @telegram",
  "Example: I have IBKR and TWS installed. I use TradingView alerts. I want signals to place trades automatically...",
  "Stocks, options, futures, crypto...",
  "Example: I want to buy when price pulls back after a strong move, enter near..., target..., stop..., only during market hours...",
  "Example: I want to buy when price pulls back after a strong move, enter near... target..., stop..., only during market hours...",
  "Stocks, futures, options, crypto...",
  "Example: I want the bot to receive TradingView alerts, place trades in TWS, track positions, and send updates to Telegram...",
  "Example: I want to understand what Day Trading signal/research access is available and what evidence I can review.",
  ...EXPECTED_OPTION_PAIRS.map(([value]) => value),
  // Historical labels should also never leak visibly if legacy markup returns.
  "Select a topic…",
  "Set up TWS / API",
  "Something else",
]);

async function inspect(page) {
  return page.evaluate(() => ({
    lang: document.documentElement.lang,
    placeholders: Array.from(document.querySelectorAll("[placeholder]"))
      .map(node => node.getAttribute("placeholder"))
      .filter(Boolean),
    options: Array.from(document.querySelectorAll("select option")).map(option => ({
      text: String(option.textContent || "").trim(),
      value: option.value,
    })),
    actions: Array.from(document.querySelectorAll("form[action]"))
      .map(form => form.getAttribute("action"))
      .filter(Boolean),
    hiddenValues: Array.from(document.querySelectorAll('input[type="hidden"][value]'))
      .map(input => input.getAttribute("value"))
      .filter(Boolean),
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const response = await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
      assert(response, `${viewport.name}: no response for ${URL}`);
      assert(response.status() < 400, `${viewport.name}: ${URL} returned ${response.status()}`);
      await page.waitForTimeout(750);

      const state = await inspect(page);
      const optionSummary = JSON.stringify(state.options);
      assert.strictEqual(state.lang, "ru", `${viewport.name}: RU Services html lang must be ru`);

      for (const expected of EXPECTED_PLACEHOLDERS) {
        assert(state.placeholders.includes(expected), `${viewport.name}: missing RU placeholder: ${expected}`);
      }
      for (const [value, label] of EXPECTED_OPTION_PAIRS) {
        assert(
          state.options.some(option => option.value === value && option.text === label),
          `${viewport.name}: option value/label mismatch for ${value}; expected=${label}; observed options=${optionSummary}`
        );
      }

      const presentationText = [...state.placeholders, ...state.options.map(option => option.text)].join("\n");
      for (const forbidden of FORBIDDEN_ENGLISH) {
        assert(
          !presentationText.includes(forbidden),
          `${viewport.name}: residual English Services form copy: ${forbidden}; observed options=${optionSummary}`
        );
      }

      for (const action of ["/appointment-request", "/strategy-review", "/bot-request"]) {
        assert(state.actions.includes(action), `${viewport.name}: missing unchanged form action: ${action}`);
      }
      for (const hiddenValue of ["landing_strategy_form", "landing_bot_form", "Signals & Research"]) {
        assert(state.hiddenValues.includes(hiddenValue), `${viewport.name}: hidden semantic value changed or missing: ${hiddenValue}`);
      }

      console.log(`${viewport.name}: RU Services live form controls PASS`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log("RU Services live form-control production QA: PASS");
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
