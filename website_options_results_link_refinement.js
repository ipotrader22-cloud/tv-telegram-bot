"use strict";

const Module = require("module");

const OPTIONS_PATH = "/trading-systems/options";
const VIEWER_HREF = "/trading-systems/options/viewer";
const PAGE_MARKER = 'data-vx-conversion-system-page="options"';
const BUTTON_TEXT = "View Options Results";
const LEGACY_HREF = "/results#options";
const BUTTON_PATTERN = /<a\s+href=(["'])\/results#options\1>View Options Results<\/a>/;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function updateOptionsResultsLink(html) {
  if (typeof html !== "string" || !html.includes(PAGE_MARKER) || !html.includes(BUTTON_TEXT)) return html;
  return html.replace(BUTTON_PATTERN, `<a href="${VIEWER_HREF}">${BUTTON_TEXT}</a>`);
}

function refineOptionsResultsLink(html, pathname = OPTIONS_PATH) {
  return pathname === OPTIONS_PATH ? updateOptionsResultsLink(html) : html;
}

function installOptionsResultsLinkRefinement(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const pathname = requestPath(req);
    if ((method !== "GET" && method !== "HEAD") || pathname !== OPTIONS_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendWithOptionsResultsViewerLink(body) {
      const type = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (typeof body === "string" && (!type || type.includes("html"))) {
        body = refineOptionsResultsLink(body, pathname);
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
    if (descriptor) {
      try { Object.defineProperty(target, key, descriptor); } catch (_) {}
    }
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleOptionsResultsLinkWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installOptionsResultsLinkRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleOptionsResultsLinkWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleOptionsResultsLinkModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  OPTIONS_PATH,
  VIEWER_HREF,
  PAGE_MARKER,
  BUTTON_TEXT,
  LEGACY_HREF,
  BUTTON_PATTERN,
  requestPath,
  updateOptionsResultsLink,
  refineOptionsResultsLink,
  installOptionsResultsLinkRefinement,
  wrapExpress,
};
