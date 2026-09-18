"use strict";

const Module = require("module");
const { SYSTEMS, DAY_TRIAL_REQUEST_TEXT, DAY_TRIAL_URL } = require("./lib/website-commercial-offer");

const STYLE_ID = "vx-conversion-direct-nav-style";
const DAY_PATH = SYSTEMS[0].path;
const SWING_PATH = SYSTEMS[1].path;
const OPTIONS_PATH = SYSTEMS[2].path;
const RESULTS_PATH = "/results";
const PRICING_PATH = "/pricing";
const LOGIN_PATH = "/dashboard";
const DAY_TRIAL_TEXT = DAY_TRIAL_REQUEST_TEXT;

const PUBLIC_PATHS = new Set([
  "/",
  "/trading-systems",
  DAY_PATH,
  SWING_PATH,
  OPTIONS_PATH,
  RESULTS_PATH,
  PRICING_PATH,
  "/services",
  "/access",
  "/about",
  "/trading-guide",
  "/closed-trades",
  "/risk-management",
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const openEnd = html.indexOf(">", openStart);
  if (openEnd < 0) return null;
  const tagPattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, end: tagPattern.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
  }
  return null;
}

function findTagByClass(html, tagName, className) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "i");
  const match = pattern.exec(String(html || ""));
  return match ? findTagRangeFromOpen(html, tagName, match.index) : null;
}

function replaceInnerHtml(html, range, inner) {
  if (!range) return html;
  return html.slice(0, range.openEnd) + inner + html.slice(range.closeStart);
}

function navAnchor(path, href, label, className = "") {
  const active = path === href;
  const classAttr = [className, active ? "is-active" : ""].filter(Boolean).join(" ");
  return `<a${classAttr ? ` class="${classAttr}"` : ""} href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
}

function renderPublicNavLinks(path = "/") {
  const systems = [
    navAnchor(path, DAY_PATH, "Day Trading", "vx-system-nav-link"),
    navAnchor(path, SWING_PATH, "Swing Trading", "vx-system-nav-link"),
    navAnchor(path, OPTIONS_PATH, "Options", "vx-system-nav-link"),
  ].join("");
  const pages = [
    navAnchor(path, RESULTS_PATH, "Results", "vx-page-nav-link"),
    navAnchor(path, PRICING_PATH, "Pricing", "vx-page-nav-link"),
  ].join("");
  return `<div class="vx-direct-system-nav" aria-label="Trading systems">${systems}</div><div class="vx-direct-page-nav" aria-label="Public pages">${pages}</div><div class="vx-direct-nav-actions"><a class="vx-public-nav-login" href="${LOGIN_PATH}">Log In</a><a class="vx-public-nav-cta" href="${DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer" aria-label="Get 30 Days Free Day Trading Telegram signals">Get 30 Days Free</a></div>`;
}

function normalizePublicNavigation(html, path = "/") {
  if (typeof html !== "string" || !PUBLIC_PATHS.has(path)) return html;
  const standard = findTagByClass(html, "div", "nav-links");
  if (standard) return replaceInnerHtml(html, standard, renderPublicNavLinks(path));
  const guide = findTagByClass(html, "div", "navlinks");
  if (guide) return replaceInnerHtml(html, guide, renderPublicNavLinks(path));
  return html;
}

function normalizeSecondaryNavigation(html) {
  if (typeof html !== "string") return html;
  const secondary = findTagByClass(html, "nav", "vx-public-secondary-nav");
  const links = '<a href="/about">About</a><a href="/services">Services</a><a href="/trading-guide">Help</a>';
  if (secondary) return replaceInnerHtml(html, secondary, links);
  const footerOpen = html.search(/<footer\b/i);
  if (footerOpen < 0) return html;
  const footer = findTagRangeFromOpen(html, "footer", footerOpen);
  if (!footer) return html;
  const block = `<nav class="vx-public-secondary-nav" aria-label="Secondary navigation">${links}</nav>`;
  return html.slice(0, footer.closeStart) + block + html.slice(footer.closeStart);
}

const styles = `
<style id="${STYLE_ID}">
  .nav-links,.navlinks{display:flex!important;align-items:center!important;gap:14px!important;flex:1 1 auto!important;min-width:0!important;overflow:visible!important}
  .vx-direct-system-nav,.vx-direct-page-nav,.vx-direct-nav-actions{display:flex;align-items:center;gap:10px}
  .vx-direct-nav-actions{margin-left:auto}
  .vx-direct-system-nav a,.vx-direct-page-nav a{display:inline-flex;align-items:center;min-height:38px;padding:0 8px;border-radius:10px;color:#33423b!important;font-size:13px!important;font-weight:650!important;text-decoration:none!important;white-space:nowrap}
  .vx-direct-system-nav a:hover,.vx-direct-page-nav a:hover{background:#f1f7f4}
  .vx-direct-system-nav a.is-active,.vx-direct-page-nav a.is-active{background:#e9f7ef;color:#075f39!important;box-shadow:inset 0 0 0 1px #b9dec9}
  .vx-direct-system-nav a[aria-current="page"]::after,.vx-direct-page-nav a[aria-current="page"]::after{content:"Current";position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .vx-direct-system-nav a,.vx-direct-page-nav a{position:relative}
  .vx-public-nav-login{display:inline-flex!important;align-items:center;justify-content:center;min-height:40px;padding:0 6px!important;color:#425049!important;font-size:13px!important;font-weight:650!important;text-decoration:none!important;white-space:nowrap}
  .vx-public-nav-cta{display:inline-flex!important;align-items:center;justify-content:center;min-height:42px;padding:0 16px!important;border:1px solid #078f51!important;border-radius:999px;background:#078f51!important;color:#fff!important;font-size:13px!important;font-weight:750!important;text-decoration:none!important;white-space:nowrap;box-shadow:0 8px 22px rgba(7,143,81,.14)}
  .vx-public-secondary-nav{display:flex!important;justify-content:center!important;gap:16px!important;flex-wrap:wrap!important;margin-top:12px!important}.vx-public-secondary-nav a{color:#5f6d67!important;font-size:12px!important;text-decoration:none!important}.vx-public-secondary-nav a:hover{text-decoration:underline!important;text-underline-offset:3px!important}
  @media(max-width:900px){
    .nav-links,.navlinks{gap:10px!important;flex-wrap:wrap!important}
    .vx-direct-system-nav{order:3;flex:1 1 100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding-top:4px}
    .vx-direct-system-nav a{justify-content:center;min-width:0;padding:0 8px;font-size:12.5px!important}
    .vx-direct-page-nav{display:none}
    .vx-direct-nav-actions{order:2;margin-left:auto;gap:8px}
  }
  @media(max-width:520px){
    .nav-links,.navlinks{flex-basis:100%!important;width:100%!important}
    .vx-direct-nav-actions{width:100%;justify-content:flex-end}
    .vx-public-nav-login{min-height:38px}.vx-public-nav-cta{min-height:40px;padding:0 13px!important;font-size:12.5px!important}
    .vx-direct-system-nav a{min-height:40px;font-size:12px!important;line-height:1.15;text-align:center;white-space:normal}
  }
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function refineConversionNavigation(html, path) {
  if (typeof html !== "string" || !PUBLIC_PATHS.has(path)) return html;
  let out = normalizePublicNavigation(html, path);
  out = normalizeSecondaryNavigation(out);
  out = injectStyles(out);
  return out;
}

function installConversionNavigationRefinement(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return next();
    const path = String(req.path || req.url || "/").split("?")[0];
    if (!PUBLIC_PATHS.has(path)) return next();
    const send = res.send.bind(res);
    res.send = function sendWithConversionNavigation(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineConversionNavigation(body, path);
      return send(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleConversionNavigationWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installConversionNavigationRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleConversionNavigationWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleConversionNavigationModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  STYLE_ID,
  DAY_PATH,
  SWING_PATH,
  OPTIONS_PATH,
  RESULTS_PATH,
  PRICING_PATH,
  LOGIN_PATH,
  DAY_TRIAL_TEXT,
  DAY_TRIAL_URL,
  PUBLIC_PATHS,
  findTagRangeFromOpen,
  findTagByClass,
  renderPublicNavLinks,
  normalizePublicNavigation,
  normalizeSecondaryNavigation,
  injectStyles,
  refineConversionNavigation,
  installConversionNavigationRefinement,
  wrapExpress,
};
