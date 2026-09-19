"use strict";

const Module = require("module");

const HOME_PATH = "/";
const STYLE_ID = "vx-home-equity-empty-fix-style";

const styles = `
<style id="${STYLE_ID}">
  .vx-home-equity-empty[hidden]{display:none!important}
  .vx-home-equity-empty:not([hidden]){display:block!important;flex:none!important;min-height:0!important;margin:10px 0 0!important;border:0!important;border-radius:0!important;padding:0!important;background:transparent!important;text-align:left!important;color:#7b8781;font-size:12px}
</style>`;

function refineHomeEquityEmptyState(html, path) {
  if (typeof html !== "string" || path !== HOME_PATH || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", () => `${styles}\n</head>`) : `${styles}${html}`;
}

function installHomeEquityEmptyFix(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || path !== HOME_PATH) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithHomeEquityEmptyFix(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineHomeEquityEmptyState(body, path);
      return originalSend(body);
    };
    next();
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleHomeEquityEmptyFixWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installHomeEquityEmptyFix(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleHomeEquityEmptyFixWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleHomeEquityEmptyFixModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = { HOME_PATH, STYLE_ID, styles, refineHomeEquityEmptyState, installHomeEquityEmptyFix, wrapExpress };
