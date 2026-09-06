"use strict";

const Module = require("module");

const CANONICAL_SWING_PATH = "/trading-systems/swing-trading";
const LEGACY_SWING_PATH = "/swing-leaders";
const CANONICAL_SWING_URL = "https://www.vixale.com/trading-systems/swing-trading";
const PAGE_MARKER = 'data-vx-swing-canonical="1"';

function requestPath(req) {
  return String(req?.path || String(req?.url || "").split("?")[0] || "");
}

function querySuffix(url) {
  const text = String(url || "");
  const index = text.indexOf("?");
  return index >= 0 ? text.slice(index) : "";
}

function resetParsedUrl(req) {
  if (req && Object.prototype.hasOwnProperty.call(req, "_parsedUrl")) delete req._parsedUrl;
}

function rewriteCanonicalRequest(req) {
  const suffix = querySuffix(req?.url);
  req.url = `${LEGACY_SWING_PATH}${suffix}`;
  resetParsedUrl(req);
}

function refineCanonicalSwingHtml(html) {
  if (typeof html !== "string" || html.includes(PAGE_MARKER)) return html;

  let out = html;
  out = out.replace(
    /<title>\s*Vixale Swing Leaders\s*<\/title>/i,
    "<title>Vixale | Swing Trading</title>"
  );

  if (!/<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(out)) {
    out = out.includes("</head>")
      ? out.replace("</head>", `  <link rel="canonical" href="${CANONICAL_SWING_URL}" />\n</head>`)
      : out;
  }

  out = out.replace(
    '<div class="eyebrow">Swing Trading · Research</div>',
    '<div class="eyebrow">Swing Trading · Swing Leaders</div>'
  );
  out = out.replace(
    "<h1>Vixale Swing Leaders</h1>",
    "<h1>Vixale Swing Trading</h1>"
  );
  out = out.replace(
    "A research/model portfolio focused on actively monitored swing positions and potential future candidates from Vixale Trading Lab.",
    "Swing Leaders research/model portfolio with actively monitored swing positions and potential future candidates from Vixale Trading Lab."
  );

  return out.replace(/<body(\s[^>]*)?>/i, match => (
    match.includes(PAGE_MARKER)
      ? match
      : match.replace("<body", `<body ${PAGE_MARKER}`)
  ));
}

function installSwingCanonicalRefinement(app) {
  app.use((req, res, next) => {
    const path = requestPath(req);
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();

    if (path === LEGACY_SWING_PATH) {
      return res.redirect(301, `${CANONICAL_SWING_PATH}${querySuffix(req.url)}`);
    }

    if (path !== CANONICAL_SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendCanonicalSwing(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refineCanonicalSwingHtml(body);
      }
      return send(body);
    };

    rewriteCanonicalRequest(req);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleSwingCanonicalWrapped) return expressFactory;

  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installSwingCanonicalRefinement(app);
    return app;
  }

  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleSwingCanonicalWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingCanonicalModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  CANONICAL_SWING_PATH,
  LEGACY_SWING_PATH,
  CANONICAL_SWING_URL,
  PAGE_MARKER,
  requestPath,
  querySuffix,
  rewriteCanonicalRequest,
  refineCanonicalSwingHtml,
  installSwingCanonicalRefinement,
  wrapExpress,
};
