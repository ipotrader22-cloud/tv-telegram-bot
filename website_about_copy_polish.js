"use strict";

const Module = require("module");

const ABOUT_PATH = "/about";
const STYLE_ID = "vx-about-copy-polish-style";
const FOUNDER_SENTENCE = "Vixale is built and operated by its founder. ";

const styles = `
<style id="${STYLE_ID}">
  .vx-about-hero h1{font-size:clamp(28px,3.5vw,41px)}
</style>`;

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function removeFounderSentence(html) {
  if (typeof html !== "string") return html;
  return html.replace(FOUNDER_SENTENCE, "");
}

function refineAboutCopy(html, path) {
  if (typeof html !== "string" || path !== ABOUT_PATH) return html;
  let result = removeFounderSentence(html);
  result = injectStyles(result);
  return result;
}

function installAboutCopyPolish(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || path !== ABOUT_PATH) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithAboutCopyPolish(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refineAboutCopy(body, path);
      }
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleAboutCopyPolishWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installAboutCopyPolish(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleAboutCopyPolishWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleAboutCopyPolishModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  ABOUT_PATH,
  STYLE_ID,
  FOUNDER_SENTENCE,
  injectStyles,
  removeFounderSentence,
  refineAboutCopy,
  installAboutCopyPolish,
  wrapExpress,
};
