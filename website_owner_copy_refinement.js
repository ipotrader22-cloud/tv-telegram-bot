"use strict";

const Module = require("module");
const { TRANSLATION_MAP } = require("./website_russian_localization");

const HOME_PATH = "/";
const SWING_PATH = "/trading-systems/swing-trading";
const GUIDE_URL = "https://www.vixale.com/trading-guide#swing-trading";
const OLD_SWING_COPY = "A public research/model portfolio built around Vixale's proprietary ranking system. Review open positions, potential candidates, completed trades and model equity history from the latest published update.";
const NEW_SWING_COPY = `Active Portfolio based on Vixale's proprietary ranking system.<br>Positions are added and closed daily. Updated every morning around 10:00 am.<br><span>Refer to the </span><a class="vx-swing-guide-link" href="${GUIDE_URL}">trading guide</a>.`;
const STYLE_ID = "vx-owner-copy-refinement-style";

for (const [source, translated] of [
  ["Active Portfolio based on Vixale's proprietary ranking system.", "Активный портфель на основе фирменной системы ранжирования Vixale."],
  ["Positions are added and closed daily.", "Позиции добавляются и закрываются ежедневно."],
  ["Updated every morning around 10:00 am. Refer to the", "Обновляется каждое утро около 10:00. См."],
  ["trading guide", "руководство по торговле"],
  ["Closed Trades P&L", "P&L закрытых сделок"],
  ["Closed Trades P&amp;L", "P&L закрытых сделок"],
  ["Stocks that are currently in the Active portfolio. Positions are monitored for Profit target/Stop Loss/or Removal due to ratings change. Check every morning around 10:06 for updates.", "Акции, которые в настоящее время находятся в Активном портфеле. Позиции отслеживаются по цели прибыли/стоп-лоссу/исключению из-за изменения рейтинга. Проверяйте обновления каждое утро около 10:06."],
  ["Closed positions due to Profit Target/Stop/Removal from the Active Portfolio.", "Закрытые позиции вследствие достижения цели прибыли/стопа/исключения из Активного портфеля."],
  ["Each position uses a fixed $10,000 allocation.", "Для каждой позиции используется фиксированный размер $10,000."],
  ["Profit Target:", "Цель прибыли:"],
  ["A +10% target may fill during the day.", "Цель +10% может быть исполнена в течение дня."],
  ["Stop:", "Стоп:"],
  ["The 5% stop reference triggers only on daily close and checked during the scheduled morning review.", "Уровень стопа 5% срабатывает только по закрытию дня и проверяется во время запланированного утреннего обзора."],
  ["Position can also be removed from Active Portfolio if ranking goes below 70.", "Позиция также может быть исключена из Активного портфеля, если рейтинг опустится ниже 70."],
]) TRANSLATION_MAP.set(source, translated);

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function injectSwingGuideStyle(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  const style = `<style id="${STYLE_ID}">.vx-swing-copy-row{display:block}.vx-swing-copy-row+.vx-swing-copy-row{margin-top:6px}.vx-swing-guide-link{color:#176442;font-weight:700;text-decoration:underline;text-underline-offset:2px}.vx-swing-guide-link:hover{color:#103f2d}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}\n</head>`) : html;
}

function refineSwingOwnerCopy(html) {
  if (typeof html !== "string") return html;
  let out = html;
  const oldParagraph = `<p class="hero-copy">${OLD_SWING_COPY}</p>`;
  const newParagraph = `<p class="hero-copy">${NEW_SWING_COPY}</p>`;
  if (out.includes(oldParagraph)) out = out.replace(oldParagraph, newParagraph);
  out = out.replace(/<h1>Follow a portfolio reviewed every day\.<\/h1>/i, "<h1>Active Portfolio</h1>");
  if (out.includes(newParagraph)) out = injectSwingGuideStyle(out);
  return out;
}

function refineHomeOwnerCopy(html) {
  if (typeof html !== "string") return html;
  let out = html;
  for (const oldText of [
    "Closed Trades ledger · realized P&amp;L source",
    "Closed Trades ledger · realized P&amp;amp;L source",
    "Closed Trades ledger · realized P&L source",
    "Verified · Closed Trades ledger",
  ]) {
    out = out.split(oldText).join("Closed Trades P&L");
  }
  return out;
}

function refineOwnerCopy(html, pathname) {
  if (pathname === SWING_PATH) return refineSwingOwnerCopy(html);
  if (pathname === HOME_PATH) return refineHomeOwnerCopy(html);
  return html;
}

function installOwnerCopyRefinement(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || ![HOME_PATH, SWING_PATH].includes(pathname)) return next();

    const send = res.send.bind(res);
    res.send = function sendOwnerCopy(body) {
      const type = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (typeof body === "string" && (!type || type.includes("html"))) {
        body = refineOwnerCopy(body, pathname);
      }
      return send(body);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleOwnerCopyWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installOwnerCopyRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleOwnerCopyWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleOwnerCopyModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  SWING_PATH,
  GUIDE_URL,
  OLD_SWING_COPY,
  NEW_SWING_COPY,
  STYLE_ID,
  requestPath,
  injectSwingGuideStyle,
  refineSwingOwnerCopy,
  refineHomeOwnerCopy,
  refineOwnerCopy,
  installOwnerCopyRefinement,
  wrapExpress,
};
