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
  ["Positions are added and closed daily. Updated every morning around 10:00 am.", "Позиции добавляются и закрываются ежедневно. Обновляется каждое утро около 10:00."],
  ["Refer to the", "См."],
  ["trading guide", "руководство по торговле"],
  ["Closed Trades P&L", "P&L закрытых сделок"],
  ["Closed Trades P&amp;L", "P&L закрытых сделок"],
]) TRANSLATION_MAP.set(source, translated);

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function injectSwingGuideStyle(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  const style = `<style id="${STYLE_ID}">.vx-swing-guide-link{color:#176442;font-weight:700;text-decoration:underline;text-underline-offset:2px}.vx-swing-guide-link:hover{color:#103f2d}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}\n</head>`) : html;
}

function refineSwingOwnerCopy(html) {
  if (typeof html !== "string") return html;
  let out = html;
  const oldParagraph = `<p class="hero-copy">${OLD_SWING_COPY}</p>`;
  const newParagraph = `<p class="hero-copy">${NEW_SWING_COPY}</p>`;
  if (out.includes(oldParagraph)) out = out.replace(oldParagraph, newParagraph);
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
    out = out.split(oldText).join("Closed Trades P&amp;L");
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
