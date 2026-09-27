"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const NAV_CLASS = "vx-strategy-family-nav";
const STYLE_ID = "vx-swing-strategy-nav-position-style";
const PAGE_MARKER = 'data-vx-swing-strategy-nav-position="1"';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const openEnd = html.indexOf(">", openStart);
  if (openEnd < 0) return null;
  const pattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  pattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = pattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, openEnd: openEnd + 1, closeStart: match.index, end: pattern.lastIndex };
  }
  return null;
}

function findTagByClass(html, tagName, className, from = 0, to = html.length) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "gi");
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (!match || match.index >= to) return null;
  const range = findTagRangeFromOpen(html, tagName, match.index);
  return range && range.end <= to ? range : null;
}

const styles = `<style id="${STYLE_ID}">
main[data-vx-conversion-system-page="swing"] .hero>.${NAV_CLASS}{margin:0 0 18px}
@media(max-width:620px){main[data-vx-conversion-system-page="swing"] .hero>.${NAV_CLASS}{margin-bottom:16px}}
</style>`;

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function moveFamilyNavAboveEyebrow(html) {
  if (typeof html !== "string") return html;
  const nav = findTagByClass(html, "nav", NAV_CLASS);
  if (!nav) return html;

  const hero = findTagByClass(html, "section", "hero");
  if (!hero) return html;
  const eyebrow = findTagByClass(html, "div", "eyebrow", hero.openEnd, hero.closeStart);
  if (!eyebrow) return html;

  if (nav.start >= hero.openEnd && nav.end <= hero.closeStart && nav.end <= eyebrow.start) return html;

  const navHtml = html.slice(nav.start, nav.end);
  const withoutNav = html.slice(0, nav.start) + html.slice(nav.end);
  const heroAfter = findTagByClass(withoutNav, "section", "hero");
  if (!heroAfter) return html;
  const eyebrowAfter = findTagByClass(withoutNav, "div", "eyebrow", heroAfter.openEnd, heroAfter.closeStart);
  if (!eyebrowAfter) return html;

  return withoutNav.slice(0, eyebrowAfter.start) + `${navHtml}\n` + withoutNav.slice(eyebrowAfter.start);
}

function refineSwingStrategyNavPosition(html, path) {
  if (typeof html !== "string" || path !== SWING_PATH) return html;
  let out = moveFamilyNavAboveEyebrow(html);
  out = injectStyles(out);
  if (!out.includes(PAGE_MARKER)) {
    out = out.replace(/<body(\s[^>]*)?>/i, match => match.replace("<body", `<body ${PAGE_MARKER}`));
  }
  return out;
}

function installSwingStrategyNavPositionRefinement(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const path = String(req.path || req.url || "/").split("?")[0];
    if ((method !== "GET" && method !== "HEAD") || path !== SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendWithSwingStrategyNavPosition(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html")) && res.statusCode < 300) {
        body = refineSwingStrategyNavPosition(body, path);
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
    if (descriptor) try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleSwingStrategyNavPositionWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installSwingStrategyNavPositionRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleSwingStrategyNavPositionWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingStrategyNavPositionModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  NAV_CLASS,
  STYLE_ID,
  PAGE_MARKER,
  findTagRangeFromOpen,
  findTagByClass,
  injectStyles,
  moveFamilyNavAboveEyebrow,
  refineSwingStrategyNavPosition,
  installSwingStrategyNavPositionRefinement,
  wrapExpress,
};
