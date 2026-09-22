"use strict";

const Module = require("module");

const RU_HOST = "ru.vixale.com";
const SERVICES_PATH = "/services";

const PLACEHOLDER_TRANSLATIONS = Object.freeze([
  Object.freeze(["John", "Имя"]),
  Object.freeze(["@username or email", "Введите email или @telegram"]),
  Object.freeze(["Enter email or @telegram", "Введите email или @telegram"]),
  Object.freeze(["Tomorrow afternoon, NY time...", "Завтра днём по времени Нью-Йорка..."]),
  Object.freeze(["Example: “I want to auto-trade my TradingView alerts with IBKR.”", "Пример: «Я хочу автоматически торговать сигналами TradingView через IBKR.»"]),
  Object.freeze(["Example: I have IBKR and TWS installed. I use TradingView alerts. I want signals to place trades automatically...", "Пример: у меня установлены IBKR и TWS, я использую алерты TradingView и хочу автоматически размещать сделки по сигналам..."]),
  Object.freeze(["Stocks, options, futures, crypto...", "Акции, опционы, фьючерсы, крипто..."]),
  Object.freeze(["Stocks, futures, options, crypto...", "Акции, фьючерсы, опционы, крипто..."]),
  Object.freeze(["Example: “Enter when RSI crosses above 50, stop 2%, target 5%.”", "Пример: «Вход при пересечении RSI уровня 50 снизу вверх, стоп 2%, цель 5%.»"]),
  Object.freeze(["Example: I want to buy when price pulls back after a strong move, enter near..., target..., stop..., only during market hours...", "Пример: хочу покупать после отката вслед за сильным движением, входить около..., цель..., стоп..., только в часы рынка..."]),
  Object.freeze(["Example: I want to buy when price pulls back after a strong move, enter near... target..., stop..., only during market hours...", "Пример: хочу покупать после отката вслед за сильным движением, входить около..., цель..., стоп..., только в часы рынка..."]),
  Object.freeze(["Example: “Watch 50 stocks, alert me in Telegram, and place orders through IBKR.”", "Пример: «Отслеживать 50 акций, присылать уведомления в Telegram и размещать ордера через IBKR.»"]),
  Object.freeze(["Example: I want the bot to receive TradingView alerts, place trades in TWS, track positions, and send updates to Telegram...", "Пример: хочу, чтобы бот получал алерты TradingView, размещал сделки в TWS, отслеживал позиции и отправлял обновления в Telegram..."]),
  Object.freeze(["Example: I want to understand what Day Trading signal/research access is available and what evidence I can review.", "Пример: хочу понять, какой доступ к сигналам/исследованиям по дейтрейдингу доступен и какие подтверждающие данные можно изучить."]),
]);

const OPTION_TRANSLATIONS = Object.freeze([
  Object.freeze(["Select a topic…", "Выберите тему…"]),
  Object.freeze(["Automate trades with TWS / IBKR", "Автоматизировать сделки через TWS / IBKR"]),
  Object.freeze(["Set up TWS / API", "Настроить TWS / API"]),
  Object.freeze(["Something else", "Другое"]),
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHost(value) {
  return String(value || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function requestHost(req) {
  return req?.get?.("host") || req?.headers?.host || req?.headers?.["x-forwarded-host"] || "";
}

function replaceExactAttribute(html, attribute, source, translated) {
  const pattern = new RegExp(`\\b${escapeRegex(attribute)}=(['"])${escapeRegex(source)}\\1`, "g");
  return String(html).replace(pattern, (full, quote) => `${attribute}=${quote}${translated}${quote}`);
}

function replaceExactOptionLabel(html, source, translated) {
  const pattern = new RegExp(`(<option\\b[^>]*>\\s*)${escapeRegex(source)}(\\s*<\\/option>)`, "g");
  return String(html).replace(pattern, `$1${translated}$2`);
}

function localizeServicesFormPresentation(html) {
  if (typeof html !== "string" || !html) return html;
  let out = html;
  for (const [source, translated] of PLACEHOLDER_TRANSLATIONS) {
    out = replaceExactAttribute(out, "placeholder", source, translated);
  }
  for (const [source, translated] of OPTION_TRANSLATIONS) {
    out = replaceExactOptionLabel(out, source, translated);
  }
  return out;
}

function installRussianServicesFormCopy(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if (
      (method !== "GET" && method !== "HEAD") ||
      requestPath(req) !== SERVICES_PATH ||
      normalizeHost(requestHost(req)) !== RU_HOST
    ) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithRussianServicesFormCopy(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (
        typeof body === "string" &&
        res.statusCode < 300 &&
        (!contentType || contentType.includes("html"))
      ) {
        body = localizeServicesFormPresentation(body);
      }
      return originalSend(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;
    try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(expressFactory) {
  if (typeof expressFactory !== "function" || expressFactory.__vixaleRussianServicesFormCopyWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installRussianServicesFormCopy(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleRussianServicesFormCopyWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleRussianServicesFormCopyModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  RU_HOST,
  SERVICES_PATH,
  PLACEHOLDER_TRANSLATIONS,
  OPTION_TRANSLATIONS,
  normalizeHost,
  requestPath,
  requestHost,
  replaceExactAttribute,
  replaceExactOptionLabel,
  localizeServicesFormPresentation,
  installRussianServicesFormCopy,
  wrapExpress,
};
