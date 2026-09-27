"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const FAVICON_VERSION = "20260927";
const FAVICON_MARKER = 'data-vixale-favicon="1"';
const CANONICAL_FAVICON_HREFS = [
  `/favicon.ico?v=${FAVICON_VERSION}`,
  `/favicon.png?v=${FAVICON_VERSION}`,
  `/apple-touch-icon.png?v=${FAVICON_VERSION}`,
];

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
  `<link rel="icon" type="image/x-icon" sizes="any" href="${CANONICAL_FAVICON_HREFS[0]}" ${FAVICON_MARKER}>`,
  `<link rel="icon" type="image/png" sizes="64x64" href="${CANONICAL_FAVICON_HREFS[1]}" ${FAVICON_MARKER}>`,
  `<link rel="apple-touch-icon" sizes="180x180" href="${CANONICAL_FAVICON_HREFS[2]}" ${FAVICON_MARKER}>`,
].join("\n");

function faviconLinkTags(html) {
  const tags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  return tags.filter((tag) => {
    const relMatch = tag.match(/\brel\s*=\s*(["'])(.*?)\1/i);
    if (!relMatch) return false;
    const tokens = relMatch[2].toLowerCase().trim().split(/\s+/).filter(Boolean);
    return tokens.includes("icon")
      || tokens.includes("apple-touch-icon")
      || tokens.includes("apple-touch-icon-precomposed")
      || tokens.includes("mask-icon");
  });
}

function hasCanonicalFaviconLinks(html) {
  const tags = faviconLinkTags(html);
  if (tags.length !== 3) return false;
  if (!tags.every((tag) => tag.includes(FAVICON_MARKER))) return false;
  return CANONICAL_FAVICON_HREFS.every((href) => tags.some((tag) => tag.includes(`href="${href}"`) || tag.includes(`href='${href}'`)));
}

function stripFaviconLinks(html) {
  if (typeof html !== "string") return html;
  return html.replace(/<link\b[^>]*>/gi, (tag) => faviconLinkTags(tag).length ? "" : tag);
}

function injectFaviconLinks(html) {
  if (typeof html !== "string" || !/<\/head>/i.test(html)) return html;
  if (hasCanonicalFaviconLinks(html)) return html;
  const cleaned = stripFaviconLinks(html);
  return cleaned.replace(/<\/head>/i, `${faviconLinks}\n</head>`);
}

function isHtmlBody(contentType, body) {
  if (typeof body !== "string") return false;
  const type = String(contentType || "").toLowerCase();
  if (type.includes("html")) return true;
  return !type && /<head\b[\s>]/i.test(body) && /<\/head>/i.test(body);
}

function refineEndChunk(res, chunk) {
  if (typeof chunk !== "string" && !Buffer.isBuffer(chunk)) return chunk;
  const wasBuffer = Buffer.isBuffer(chunk);
  const text = wasBuffer ? chunk.toString("utf8") : chunk;
  if (!isHtmlBody(res.getHeader?.("Content-Type"), text)) return chunk;

  const refined = injectFaviconLinks(text);
  if (refined === text) return chunk;

  const nextChunk = wasBuffer ? Buffer.from(refined, "utf8") : refined;
  if (!res.headersSent) {
    try { res.removeHeader?.("ETag"); } catch (_) {}
    try { res.setHeader?.("Content-Length", String(Buffer.byteLength(refined, "utf8"))); } catch (_) {}
  }
  return nextChunk;
}

function serveFaviconAsset(req, res) {
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
    if (serveFaviconAsset(req, res)) return;

    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    res.send = function sendWithFavicon(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && isHtmlBody(contentType, body)) {
        body = injectFaviconLinks(body);
      }
      return originalSend(body);
    };

    res.end = function endWithFavicon(chunk, encoding, callback) {
      const refinedChunk = refineEndChunk(res, chunk);
      return originalEnd(refinedChunk, encoding, callback);
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
  CANONICAL_FAVICON_HREFS,
  faviconAssets,
  faviconLinks,
  faviconLinkTags,
  hasCanonicalFaviconLinks,
  stripFaviconLinks,
  injectFaviconLinks,
  isHtmlBody,
  refineEndChunk,
  installFavicon,
  serveFaviconAsset,
  wrapExpress,
};
