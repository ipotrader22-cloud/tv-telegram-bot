"use strict";

const Module = require("module");

const CANONICAL_SWING_PATH = "/trading-systems/swing-trading";
const LEGACY_SWING_PATH = "/swing-leaders";
const CANONICAL_SWING_URL = "https://www.vixale.com/trading-systems/swing-trading";
const PAGE_MARKER = 'data-vx-swing-canonical="1"';
const ACCESS_STYLE_ID = "vx-swing-access-style";
const ACCESS_MARKER = 'class="vx-swing-access"';
const ACCESS_PATH = "/#password-access";

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

const swingAccessStyles = `<style id="${ACCESS_STYLE_ID}">
  .vx-swing-access{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;margin-top:20px}
  .vx-swing-access-primary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border:1px solid #078f51;border-radius:999px;background:#078f51;color:#fff;text-decoration:none;font-size:13px;font-weight:700;box-shadow:0 10px 24px rgba(7,143,81,.14);transition:transform .16s ease,box-shadow .16s ease}
  .vx-swing-access-primary:hover{transform:translateY(-1px);box-shadow:0 12px 28px rgba(7,143,81,.18)}
  .vx-swing-access-login{color:#4f5d57;font-size:12.5px;font-weight:650;text-decoration:none}
  .vx-swing-access-login:hover{text-decoration:underline;text-underline-offset:3px}
  .vx-swing-access-note{flex-basis:100%;color:#78837e;font-size:11.5px;line-height:1.45}
  @media(max-width:640px){.vx-swing-access{align-items:stretch;flex-direction:column}.vx-swing-access-primary{width:100%;min-height:48px;box-sizing:border-box}.vx-swing-access-login{text-align:center}.vx-swing-access-note{text-align:center}}
</style>`;

function injectSwingAccessStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${ACCESS_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${swingAccessStyles}\n</head>`) : html;
}

function insertSwingAccess(html) {
  if (typeof html !== "string" || html.includes(ACCESS_MARKER)) return html;
  const copy = "Swing Leaders research/model portfolio with actively monitored swing positions and potential future candidates from Vixale Trading Lab.";
  const copyIndex = html.indexOf(copy);
  if (copyIndex < 0) return html;
  const paragraphEnd = html.indexOf("</p>", copyIndex);
  if (paragraphEnd < 0) return html;
  const access = `<div class="vx-swing-access"><a class="vx-swing-access-primary" href="${ACCESS_PATH}">Watch Systems for Free</a><a class="vx-swing-access-login" href="/dashboard">Already have access? Open Dashboard →</a><span class="vx-swing-access-note">One viewer access · Day Trading · Swing Trading · Options</span></div>`;
  const insertAt = paragraphEnd + 4;
  return html.slice(0, insertAt) + access + html.slice(insertAt);
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
  out = insertSwingAccess(out);
  out = injectSwingAccessStyles(out);

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
  ACCESS_STYLE_ID,
  ACCESS_MARKER,
  ACCESS_PATH,
  requestPath,
  querySuffix,
  rewriteCanonicalRequest,
  injectSwingAccessStyles,
  insertSwingAccess,
  refineCanonicalSwingHtml,
  installSwingCanonicalRefinement,
  wrapExpress,
};
