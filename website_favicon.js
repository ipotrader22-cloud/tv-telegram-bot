"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const FAVICON_VERSION = "20260922";
const FAVICON_MARKER = 'data-vixale-favicon="1"';

function readAsset(fileName) {
  try {
    return fs.readFileSync(path.join(__dirname, fileName));
  } catch (_) {
    return null;
  }
}

const faviconAssets = new Map([
  ["/favicon.ico", { body: readAsset("favicon.ico"), contentType: "image/x-icon" }],
  ["/favicon.png", { body: readAsset("favicon.png"), contentType: "image/png" }],
  ["/apple-touch-icon.png", { body: readAsset("apple-touch-icon.png"), contentType: "image/png" }],
]);

const faviconLinks = [
  `<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=${FAVICON_VERSION}" ${FAVICON_MARKER}>`,
  `<link rel="shortcut icon" href="/favicon.ico?v=${FAVICON_VERSION}" ${FAVICON_MARKER}>`,
  `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${FAVICON_VERSION}" ${FAVICON_MARKER}>`,
].join("\n");

function injectFaviconLinks(html) {
  if (typeof html !== "string" || html.includes(FAVICON_MARKER)) return html;
  if (!/<\/head>/i.test(html)) return html;
  return html.replace(/<\/head>/i, `${faviconLinks}\n</head>`);
}

function serveFaviconAsset(req, res, next) {
  const method = String(req.method || "").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;

  const requestPath = req.path || String(req.url || "").split("?")[0];
  const asset = faviconAssets.get(requestPath);
  if (!asset || !asset.body) return false;

  res.statusCode = 200;
  res.setHeader("Content-Type", asset.contentType);
  res.setHeader("Content-Length", String(asset.body.length));
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  if (method === "HEAD") res.end();
  else res.end(asset.body);
  return true;
}

function installFavicon(app) {
  app.use((req, res, next) => {
    if (serveFaviconAsset(req, res, next)) return;

    const originalSend = res.send.bind(res);
    res.send = function sendWithFavicon(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = injectFaviconLinks(body);
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
    try {
      Object.defineProperty(target, key, descriptor);
    } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(expressFactory) {
  if (typeof expressFactory !== "function" || expressFactory.__vixaleFaviconWrapped) return expressFactory;

  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installFavicon(app);
    return app;
  }

  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleFaviconWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleFaviconModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  FAVICON_VERSION,
  FAVICON_MARKER,
  faviconAssets,
  injectFaviconLinks,
  installFavicon,
  serveFaviconAsset,
  wrapExpress,
};
