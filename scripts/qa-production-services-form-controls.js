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
  "Пример: «Я хочу автоматически торговать сигналами TradingView через IBKR.»",
  "Пример: «Вход при пересечении RSI уровня 50 снизу вверх, стоп 2%, цель 5%.»",
  "Пример: «Отслеживать 50 акций, присылать уведомления в Telegram и размещать ордера через IBKR.»",
]);

const EXPECTED_OPTIONS = Object.freeze([
  "Выберите тему…",
  "Автоматизировать сделки через TWS / IBKR",
  "Настроить TWS / API",
  "Другое",
]);

const FORBIDDEN_ENGLISH = Object.freeze([
  "John",
  "Enter email or @telegram",
  "Example: “I want to auto-trade my TradingView alerts with IBKR.”",
  "Example: “Enter when RSI crosses above 50, stop 2%, target 5%.”",
  "Example: “Watch 50 stocks, alert me in Telegram, and place orders through IBKR.”",
  "Select a topic…",
  "Automate trades with TWS / IBKR",
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
      assert.strictEqual(state.lang, "ru", `${viewport.name}: RU Services html lang must be ru`);

      for (const expected of EXPECTED_PLACEHOLDERS) {
        assert(state.placeholders.includes(expected), `${viewport.name}: missing RU placeholder: ${expected}`);
      }
      for (const expected of EXPECTED_OPTIONS) {
        assert(state.options.some(option => option.text === expected), `${viewport.name}: missing RU option label: ${expected}`);
      }

      const presentationText = [...state.placeholders, ...state.options.map(option => option.text)].join("\n");
      for (const forbidden of FORBIDDEN_ENGLISH) {
        assert(!presentationText.includes(forbidden), `${viewport.name}: residual English Services form copy: ${forbidden}`);
      }

      for (const action of ["/appointment-request", "/strategy-review", "/bot-request"]) {
        assert(state.actions.includes(action), `${viewport.name}: missing unchanged form action: ${action}`);
      }
      for (const [value, label] of [
        ["automation", "Автоматизировать сделки через TWS / IBKR"],
        ["setup", "Настроить TWS / API"],
        ["other", "Другое"],
      ]) {
        assert(state.options.some(option => option.value === value && option.text === label), `${viewport.name}: option value changed or label missing for ${value}`);
      }
      for (const hiddenValue of ["landing_strategy_form", "landing_bot_form"]) {
        assert(state.hiddenValues.includes(hiddenValue), `${viewport.name}: hidden semantic value changed or missing: ${hiddenValue}`);
      }

      console.log(`${viewport.name}: RU Services form controls PASS`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log("RU Services form-control production QA: PASS");
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
