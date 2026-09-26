"use strict";

const Module = require("module");

const DAY_PATH = "/trading-systems/day-trading";
const SWING_PATH = "/trading-systems/swing-trading";
const OPTIONS_PATH = "/trading-systems/options";
const SUPPORTED_PATHS = new Set([DAY_PATH, SWING_PATH, OPTIONS_PATH]);
const STYLE_ID = "vx-strategy-page-design-style";
const NAV_CLASS = "vx-strategy-family-nav";
const OPTIONS_UNIFIED_CLASS = "vx-options-unified-story";

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
    if (depth === 0) {
      return { start: openStart, openEnd: openEnd + 1, closeStart: match.index, end: pattern.lastIndex };
    }
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

function renderFamilyNav(activePath) {
  const links = [
    [DAY_PATH, "Day Trading"],
    [SWING_PATH, "Swing Trading"],
    [OPTIONS_PATH, "Options"],
  ];
  return `<nav class="${NAV_CLASS}" aria-label="Vixale trading systems">${links.map(([href, label]) => {
    const active = href === activePath;
    return `<a${active ? ' class="active" aria-current="page"' : ""} href="${href}">${label}</a>`;
  }).join("")}</nav>`;
}

function insertFamilyNav(html, path) {
  if (typeof html !== "string" || !SUPPORTED_PATHS.has(path)) return html;
  if (html.includes(`class="${NAV_CLASS}"`) || html.includes(` ${NAV_CLASS}`)) return html;

  if (path === OPTIONS_PATH) {
    return html.replace(
      /class=(["'])vx-options-family-nav\1/i,
      `class="vx-options-family-nav ${NAV_CLASS}"`
    );
  }

  const marker = `data-vx-conversion-system-page="${path === DAY_PATH ? "day" : "swing"}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return html;
  const openStart = html.lastIndexOf("<", markerIndex);
  const openEnd = html.indexOf(">", markerIndex);
  if (openStart < 0 || openEnd < 0) return html;
  return html.slice(0, openEnd + 1) + `\n${renderFamilyNav(path)}` + html.slice(openEnd + 1);
}

function firstChildDivRange(html, sectionRange) {
  if (!sectionRange) return null;
  const match = /<div\b[^>]*>/gi;
  match.lastIndex = sectionRange.openEnd;
  const found = match.exec(html);
  if (!found || found.index >= sectionRange.closeStart) return null;
  const range = findTagRangeFromOpen(html, "div", found.index);
  return range && range.end <= sectionRange.closeStart ? range : null;
}

function consolidateOptionsStory(html) {
  if (typeof html !== "string" || html.includes(`class="${OPTIONS_UNIFIED_CLASS}"`)) return html;
  const sales = findTagByClass(html, "div", "vx-options-sales");
  if (!sales) return html;

  const hero = findTagByClass(html, "section", "vx-options-hero", sales.openEnd, sales.closeStart);
  const preview = findTagByClass(html, "section", "vx-options-preview-section", sales.openEnd, sales.closeStart);
  const results = findTagByClass(html, "section", "vx-options-results", sales.openEnd, sales.closeStart);
  if (!hero || !preview || !results || !(hero.start < preview.start && preview.start < results.start)) return html;

  const heroCopy = findTagByClass(html, "div", "vx-options-hero-copy", hero.openEnd, hero.closeStart);
  const previewCopy = findTagByClass(html, "div", "vx-options-section-copy", preview.openEnd, preview.closeStart);
  const previewCard = findTagByClass(html, "div", "vx-options-dashboard-shot", preview.openEnd, preview.closeStart)
    || findTagByClass(html, "div", "vx-options-preview-empty", preview.openEnd, preview.closeStart);
  const resultsCopy = firstChildDivRange(html, results);
  if (!heroCopy || !previewCopy || !previewCard || !resultsCopy) return html;

  let heroCopyHtml = html.slice(heroCopy.start, heroCopy.end)
    .replace('href="#options-dashboard-preview"', 'href="#options-preview-card"');
  let previewCopyHtml = html.slice(previewCopy.start, previewCopy.end);
  let resultsCopyHtml = html.slice(resultsCopy.start, resultsCopy.end)
    .replace(/^<div>/, '<div class="vx-options-unified-results-copy">');
  const previewCardHtml = html.slice(previewCard.start, previewCard.end);

  heroCopyHtml = heroCopyHtml.replace(
    /class=(["'])vx-options-hero-copy\1/,
    'class="vx-options-hero-copy vx-options-unified-hero-copy"'
  );
  previewCopyHtml = previewCopyHtml.replace(
    /class=(["'])vx-options-section-copy\1/,
    'class="vx-options-section-copy vx-options-unified-preview-copy"'
  );

  const unified = `<section class="${OPTIONS_UNIFIED_CLASS}" id="options-dashboard-preview" aria-label="Options service overview">
    <div class="vx-options-unified-copy">${heroCopyHtml}${previewCopyHtml}${resultsCopyHtml}</div>
    <div class="vx-options-unified-preview">${previewCardHtml}</div>
  </section>`;

  let out = html.slice(0, results.start) + html.slice(results.end);
  out = out.slice(0, preview.start) + out.slice(preview.end);
  out = out.slice(0, hero.start) + unified + out.slice(hero.end);
  return out;
}

const styles = `<style id="${STYLE_ID}">
.vx-strategy-family-nav{display:flex;gap:7px;flex-wrap:wrap;margin:26px 0 28px}.vx-strategy-family-nav a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 13px;border:1px solid #d7e4dd;border-radius:999px;background:rgba(255,255,255,.66);color:#53615b;text-decoration:none;font-size:12px;font-weight:700}.vx-strategy-family-nav a.active{border-color:#0a9658;background:#edf9f2;color:#176442}.vx-strategy-family-nav a:focus-visible{outline:3px solid rgba(10,150,88,.22);outline-offset:2px}
.vx-options-family-nav.${NAV_CLASS}{margin:0 0 28px}.vx-options-family-nav.${NAV_CLASS} a{min-height:36px;padding:0 13px}
[data-vx-conversion-system-page="day"] h1,[data-vx-conversion-system-page="day"] h2,main[data-vx-conversion-system-page="swing"] h1,main[data-vx-conversion-system-page="swing"] h2{font-size:var(--vx-canonical-section-heading-size,24px)!important;line-height:1.15!important;letter-spacing:-.03em!important;font-weight:600!important}
.vx-options-unified-story{display:grid;grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr);gap:30px;align-items:center;margin:4px 0 38px;padding:28px;border:1px solid #d7e4dd;border-radius:26px;background:linear-gradient(145deg,#f4faf6,#fff 72%);box-shadow:0 16px 44px rgba(24,54,42,.07)}.vx-options-unified-copy{min-width:0}.vx-options-unified-story h1,.vx-options-unified-story h2,.vx-options-benefits h2{font-size:var(--vx-canonical-section-heading-size,24px)!important;line-height:1.15!important;letter-spacing:-.03em!important;font-weight:600!important}.vx-options-unified-story .vx-options-hero-copy>p,.vx-options-unified-story .vx-options-section-copy>p,.vx-options-unified-story .vx-options-unified-results-copy p{font-size:14px;line-height:1.58}.vx-options-unified-preview-copy,.vx-options-unified-results-copy{margin-top:22px;padding-top:20px;border-top:1px solid #dfe8e3}.vx-options-unified-results-copy>strong{display:block;margin-top:14px;font-size:14px}.vx-options-unified-results-copy>small{display:block;margin-top:9px;color:#6f7b75;font-size:11.5px}.vx-options-unified-preview{min-width:0}.vx-options-unified-preview .vx-options-dashboard-shot{box-shadow:none}.vx-options-unified-preview .vx-options-preview-empty{min-height:300px}.vx-options-unified-story .vx-options-actions{margin-top:18px}.vx-options-unified-story .vx-options-daily{margin-top:11px}.vx-options-unified-story .vx-options-inline-cta{margin-top:14px}
@media(max-width:900px){.vx-options-unified-story{grid-template-columns:1fr;align-items:start}.vx-options-unified-preview{max-width:720px}}
@media(max-width:620px){.vx-strategy-family-nav{margin:18px 0 22px}.vx-options-family-nav.${NAV_CLASS}{margin-bottom:22px}.vx-options-unified-story{margin-bottom:30px;padding:18px;border-radius:21px;gap:22px}.vx-options-unified-story .vx-options-actions a{width:100%;box-sizing:border-box}}
</style>`;

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function refineStrategyPageDesign(html, path) {
  if (typeof html !== "string" || !SUPPORTED_PATHS.has(path)) return html;
  let out = insertFamilyNav(html, path);
  if (path === OPTIONS_PATH) out = consolidateOptionsStory(out);
  return injectStyles(out);
}

function installStrategyPageDesignRefinement(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const path = String(req.path || req.url || "/").split("?")[0];
    if ((method !== "GET" && method !== "HEAD") || !SUPPORTED_PATHS.has(path)) return next();
    const send = res.send.bind(res);
    res.send = function sendWithStrategyPageDesign(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html")) && res.statusCode < 300) {
        body = refineStrategyPageDesign(body, path);
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
  if (typeof factory !== "function" || factory.__vixaleStrategyPageDesignWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installStrategyPageDesignRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleStrategyPageDesignWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleStrategyPageDesignModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  DAY_PATH,
  SWING_PATH,
  OPTIONS_PATH,
  SUPPORTED_PATHS,
  STYLE_ID,
  NAV_CLASS,
  OPTIONS_UNIFIED_CLASS,
  findTagRangeFromOpen,
  findTagByClass,
  renderFamilyNav,
  insertFamilyNav,
  consolidateOptionsStory,
  injectStyles,
  refineStrategyPageDesign,
  installStrategyPageDesignRefinement,
  wrapExpress,
};
