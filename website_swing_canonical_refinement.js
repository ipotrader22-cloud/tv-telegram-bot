"use strict";

const Module = require("module");

const CANONICAL_SWING_PATH = "/trading-systems/swing-trading";
const LEGACY_SWING_PATH = "/swing-leaders";
const CANONICAL_SWING_URL = "https://www.vixale.com/trading-systems/swing-trading";
const PAGE_MARKER = 'data-vx-swing-canonical="1"';
const ACCESS_STYLE_ID = "vx-swing-access-style";
const ACCESS_MARKER = 'class="vx-swing-access"';
const ACCESS_PATH = "/#password-access";
const PORTFOLIO_ANCHOR_ID = "active-portfolio";
const PORTFOLIO_HREF = `${CANONICAL_SWING_PATH}#${PORTFOLIO_ANCHOR_ID}`;

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
  .vx-swing-sequence-label{margin-top:16px;color:#287153;font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
  .vx-swing-access{display:grid;gap:14px;margin-top:24px;padding:22px 0;border-top:1px solid #dfe8e3;border-bottom:1px solid #dfe8e3}
  .vx-swing-primer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .vx-swing-primer-card{padding:18px;border:1px solid #dfe8e3;border-radius:18px;background:#fff}
  .vx-swing-primer-card span{color:#287153;font-size:10.5px;font-weight:750;letter-spacing:.07em;text-transform:uppercase}
  .vx-swing-primer-card strong{display:block;margin-top:7px;color:#17211d;font-size:16px;font-weight:650}
  .vx-swing-primer-card p{margin:7px 0 0;color:#5f6d67;font-size:13.5px;line-height:1.55}
  .vx-swing-access-primary{display:inline-flex;width:max-content;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border:1px solid #078f51;border-radius:999px;background:#078f51;color:#fff;text-decoration:none;font-size:13px;font-weight:700;box-shadow:0 10px 24px rgba(7,143,81,.14);transition:transform .16s ease,box-shadow .16s ease}
  .vx-swing-access-primary:hover{transform:translateY(-1px);box-shadow:0 12px 28px rgba(7,143,81,.18)}
  .vx-swing-access-note{color:#65716c;font-size:12.5px;line-height:1.5}
  @media(max-width:760px){.vx-swing-primer-grid{grid-template-columns:1fr}}
  @media(max-width:640px){.vx-swing-access-primary{width:100%;min-height:48px;box-sizing:border-box}.vx-swing-access-note{text-align:left}}
</style>`;

function injectSwingAccessStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${ACCESS_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${swingAccessStyles}\n</head>`) : html;
}

function ensureSwingPortfolioAnchor(html) {
  if (typeof html !== "string" || html.includes(`id="${PORTFOLIO_ANCHOR_ID}"`)) return html;
  return html.replace(/<h2([^>]*)>\s*Active Portfolio\s*<\/h2>/i, `<h2 id="${PORTFOLIO_ANCHOR_ID}"$1>Active Portfolio</h2>`);
}

function insertSwingAccess(html) {
  if (typeof html !== "string" || html.includes(ACCESS_MARKER)) return html;
  const copy = "Use this public Swing Leaders research/model portfolio to review active positions, potential candidates, closed trades, and model equity history. Quotes may be delayed; this is not broker execution.";
  const copyIndex = html.indexOf(copy);
  if (copyIndex < 0) return html;
  const paragraphEnd = html.indexOf("</p>", copyIndex);
  if (paragraphEnd < 0) return html;
  const access = `<div class="vx-swing-access"><div class="vx-swing-primer-grid">
    <section class="vx-swing-primer-card"><span>How it differs</span><strong>Multi-session research/model portfolio</strong><p>Swing positions may remain active across sessions. This page is model-portfolio research, not Day Trading broker/execution evidence and not the owner-entered Options journal.</p></section>
    <section class="vx-swing-primer-card"><span>What you will see</span><strong>Portfolio status and model evidence</strong><p>Review Active Portfolio, potential candidates, closed trades, model P&amp;L, and the dedicated Swing equity history.</p></section>
    <section class="vx-swing-primer-card"><span>Available publicly now</span><strong>The Swing portfolio is already public</strong><p>You do not need viewer login to inspect the Swing model portfolio. Delayed-quote and model-portfolio disclosures remain visible with the evidence.</p></section>
    <section class="vx-swing-primer-card"><span>What viewer access adds</span><strong>No extra Swing portfolio unlock is required</strong><p>Viewer access is used for other protected Vixale areas; it is not a prerequisite for the Swing Active Portfolio on this page.</p></section>
    <section class="vx-swing-primer-card"><span>Evidence / results</span><strong>Swing Trading only</strong><p>The evidence below is the Swing research/model portfolio and equity history. It is not brokerage-account performance.</p></section>
  </div><a class="vx-swing-access-primary" href="${PORTFOLIO_HREF}">View Swing Portfolio</a><span class="vx-swing-access-note">One clear next step: review the public Active Portfolio below.</span></div>`;
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
    '<h1>Vixale Swing Trading</h1><div class="vx-swing-sequence-label">What this system is</div>'
  );
  out = out.replace(
    "A research/model portfolio focused on actively monitored swing positions and potential future candidates from Vixale Trading Lab.",
    "Use this public Swing Leaders research/model portfolio to review active positions, potential candidates, closed trades, and model equity history. Quotes may be delayed; this is not broker execution."
  );
  out = ensureSwingPortfolioAnchor(out);
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
  PORTFOLIO_ANCHOR_ID,
  PORTFOLIO_HREF,
  requestPath,
  querySuffix,
  rewriteCanonicalRequest,
  injectSwingAccessStyles,
  ensureSwingPortfolioAnchor,
  insertSwingAccess,
  refineCanonicalSwingHtml,
  installSwingCanonicalRefinement,
  wrapExpress,
};
