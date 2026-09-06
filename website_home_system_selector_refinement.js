"use strict";

const Module = require("module");

const HOME_PATH = "/";
const STYLE_ID = "vx-home-system-selector-style";
const TOP_MARKER = 'class="vx-home-top-systems"';
const DAY_SECTION_CLASS = "vx-home-day-trading";
const DAY_ANCHOR_ID = "live-day-trading";
const SWING_TRADING_PATH = "/trading-systems/swing-trading";
const OPTIONS_PATH = "/trading-systems/options";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const pattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  pattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = pattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, end: pattern.lastIndex };
  }
  return null;
}

function findTagByClass(html, tagName, className, from = 0, to = html.length) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "gi");
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (!match || match.index >= to) return null;
  const range = findTagRangeFromOpen(html, tagName, match.index);
  if (!range || range.end > to) return null;
  return range;
}

function renderSystemSelector() {
  return `<nav class="vx-home-system-stack" aria-label="Explore Vixale systems">
    <a class="vx-home-system-card" href="#${DAY_ANCHOR_ID}"><span>Live Day Trading</span><strong>Day Trading</strong><p>View current day-trading status and realized performance.</p><b>View Live Day Trading ↓</b></a>
    <a class="vx-home-system-card" href="${SWING_TRADING_PATH}"><span>Multi-session</span><strong>Swing Trading</strong><p>Explore the Vixale Swing System and Swing Leaders.</p><b>Explore Swing Trading →</b></a>
    <a class="vx-home-system-card" href="${OPTIONS_PATH}"><span>Options</span><strong>Options</strong><p>Explore Options Straddles and the options-focused workflow.</p><b>Explore Options →</b></a>
  </nav>`;
}

function removeLowerSystemCards(html) {
  const dayRange = findTagByClass(html, "section", DAY_SECTION_CLASS);
  if (!dayRange) return html;
  const otherRange = findTagByClass(html, "section", "vx-home-other-systems", dayRange.start, dayRange.end);
  if (!otherRange) return html;
  return html.slice(0, otherRange.start) + html.slice(otherRange.end);
}

function ensureDayAnchor(html) {
  const pattern = new RegExp(`<section\\b([^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(DAY_SECTION_CLASS)}\\b[^"']*\\2[^>]*)>`, "i");
  return html.replace(pattern, match => {
    if (/\bid=(["'])[^"']+\1/i.test(match)) return match;
    return match.replace(/^<section\b/i, `<section id="${DAY_ANCHOR_ID}"`);
  });
}

function composeTopBlock(html) {
  if (html.includes(TOP_MARKER)) return html;
  const heroRange = findTagByClass(html, "section", "vx-home-hero");
  if (!heroRange) return html;
  const heroHtml = html.slice(heroRange.start, heroRange.end);
  const top = `<section class="vx-home-top-systems"><div class="wrap"><div class="vx-home-top-grid">${renderSystemSelector()}${heroHtml}</div></div></section>`;
  return html.slice(0, heroRange.start) + top + html.slice(heroRange.end);
}

const styles = `
<style id="${STYLE_ID}">
  .vx-home-top-systems{padding:30px 0 34px;background:linear-gradient(180deg,#f5fbf7 0%,#fff 88%);border-bottom:1px solid #e3e9e5}
  .vx-home-top-systems>.wrap{max-width:1180px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-home-top-grid{display:grid;grid-template-columns:minmax(300px,.78fr) minmax(0,1.42fr);gap:18px;align-items:stretch}
  .vx-home-system-stack{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:12px;min-width:0}
  .vx-home-top-systems .vx-home-system-card{display:flex;min-height:0;flex-direction:column;padding:18px 20px;border:1px solid #dce7e1;border-radius:22px;background:#fff;color:#17211d;text-decoration:none;box-shadow:0 12px 34px rgba(31,67,51,.035);box-sizing:border-box;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
  .vx-home-top-systems .vx-home-system-card>span{color:#287153;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
  .vx-home-top-systems .vx-home-system-card>strong{margin-top:7px;font-size:20px;font-weight:560;letter-spacing:-.025em}
  .vx-home-top-systems .vx-home-system-card>p{margin:6px 0 0;color:#68736f;font-size:12px;line-height:1.4}
  .vx-home-top-systems .vx-home-system-card>b{margin-top:auto;padding-top:11px;color:#176442;font-size:11.5px;font-weight:700}
  .vx-home-top-systems .vx-home-system-card:hover{transform:translateY(-1px);border-color:#c9ded3;box-shadow:0 16px 40px rgba(31,67,51,.06)}
  .vx-home-top-systems .vx-home-hero{margin:0;padding:30px 30px 28px;border:1px solid #dce7e1;border-radius:28px;background:#fff;box-shadow:0 16px 44px rgba(31,67,51,.045);box-sizing:border-box}
  .vx-home-top-systems .vx-home-hero .wrap{max-width:none;margin:0;padding:0}
  .vx-home-top-systems .vx-home-hero-copy{max-width:620px;margin:0 auto;padding:0;text-align:center}
  .vx-home-top-systems .vx-home-hero h1{max-width:580px;margin:14px auto 0;font-size:clamp(28px,2.5vw,32px);font-weight:500;line-height:1.08;letter-spacing:-.03em;white-space:normal!important;text-wrap:balance}
  .vx-home-top-systems .vx-home-hero-lead{max-width:570px;margin:14px auto 0;font-size:15px;line-height:1.5}
  .vx-home-top-systems .vx-home-hero-actions{margin-top:19px}
  .vx-home-top-systems .vx-home-hero-proof{margin-top:11px}
  .vx-home-top-systems .vx-home-hero-login{margin-top:6px}
  #${DAY_ANCHOR_ID}{scroll-margin-top:92px}
  @media(max-width:900px){.vx-home-top-grid{grid-template-columns:1fr}.vx-home-top-systems .vx-home-hero{order:1}.vx-home-system-stack{order:2;grid-template-rows:none;grid-template-columns:repeat(3,minmax(0,1fr))}.vx-home-top-systems .vx-home-system-card{min-height:150px}.vx-home-top-systems .vx-home-hero h1{font-size:clamp(28px,4.5vw,32px)}}
  @media(max-width:700px){.vx-home-top-systems{padding:20px 0 26px}.vx-home-top-systems>.wrap{padding:0 16px}.vx-home-system-stack{grid-template-columns:1fr}.vx-home-top-systems .vx-home-system-card{min-height:126px}.vx-home-top-systems .vx-home-hero{padding:24px 18px 22px;border-radius:22px}.vx-home-top-systems .vx-home-hero h1{font-size:28px;line-height:1.1}.vx-home-top-systems .vx-home-hero-lead{font-size:14.5px}.vx-home-top-systems .vx-home-hero-actions{margin-top:17px}}
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function refineHomeSystemSelector(html, path) {
  if (typeof html !== "string" || path !== HOME_PATH) return html;
  let result = removeLowerSystemCards(html);
  result = ensureDayAnchor(result);
  result = composeTopBlock(result);
  if (result.includes(TOP_MARKER)) result = injectStyles(result);
  return result;
}

function installHomeSystemSelectorRefinement(app) {
  app.use((req, res, next) => {
    const originalPath = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || originalPath !== HOME_PATH) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithHomeSystemSelector(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineHomeSystemSelector(body, originalPath);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleHomeSystemSelectorWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installHomeSystemSelectorRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleHomeSystemSelectorWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleHomeSystemSelectorModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  STYLE_ID,
  TOP_MARKER,
  DAY_SECTION_CLASS,
  DAY_ANCHOR_ID,
  SWING_TRADING_PATH,
  OPTIONS_PATH,
  findTagRangeFromOpen,
  findTagByClass,
  renderSystemSelector,
  removeLowerSystemCards,
  ensureDayAnchor,
  composeTopBlock,
  injectStyles,
  refineHomeSystemSelector,
  installHomeSystemSelectorRefinement,
  wrapExpress,
};
