"use strict";

const Module = require("module");
const { injectFunnelAccessScript } = require("./lib/website-funnel-client");

const HOME_PATH = "/";
const SYSTEMS_PATH = "/trading-systems";
const GUIDE_PATH = "/trading-guide";
const RESULTS_PATH = "/results";
const GUIDE_BLOCK_HREF = `${SYSTEMS_PATH}#vx-how-to-trade-title`;
const GUIDE_NAV_TEXT = "How to Trade Vixale";
const NFA_TEXT = "NFA — Not Financial Advice.";
const STYLE_ID = "vx-public-navigation-accessibility-style";
const PUBLIC_NAV_PATHS = new Set([
  HOME_PATH,
  SYSTEMS_PATH,
  `${SYSTEMS_PATH}/day-trading`,
  `${SYSTEMS_PATH}/swing-trading`,
  `${SYSTEMS_PATH}/options`,
  RESULTS_PATH,
  "/access",
  "/services",
  "/about",
  "/pricing",
  "/closed-trades",
  GUIDE_PATH,
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
  const match = html.match(pattern);
  if (!match) return null;
  return findTagRangeFromOpen(html, tagName, match.index);
}

function accessHrefForPath(path) {
  if (path === "/trading-systems/day-trading") return "/access?system=day-trading";
  if (path === "/trading-systems/swing-trading") return "/access?system=swing-trading";
  if (path === "/trading-systems/options") return "/access?system=options";
  return "/access";
}

function renderPublicNavLinks(path = HOME_PATH) {
  return `<a href="${GUIDE_BLOCK_HREF}">How It Works</a><a href="/trading-systems">Trading Systems</a><a href="${RESULTS_PATH}">Results</a><a href="/services">Services</a><a href="/trading-guide">Help</a><a class="vx-public-nav-login" href="/dashboard">Log In</a><a class="vx-public-nav-cta" href="${accessHrefForPath(path)}">Request Free Access</a>`;
}

function replaceInnerHtml(html, range, inner) {
  if (!range || !Number.isFinite(range.openEnd) || !Number.isFinite(range.closeStart)) return html;
  return html.slice(0, range.openEnd) + inner + html.slice(range.closeStart);
}

function findFirstTag(html, tagName) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>`, "i");
  const match = pattern.exec(html);
  return match ? findTagRangeFromOpen(html, tagName, match.index) : null;
}

function findBrandAnchor(html) {
  const anchors = String(html).match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  return anchors.find(anchor => /href=["']\/["']/i.test(anchor) && /VIXALE/i.test(anchor)) || "";
}

function normalizePublicNavigation(html, path = HOME_PATH) {
  if (typeof html !== "string") return html;
  const standard = findTagByClass(html, "div", "nav-links");
  if (standard) return replaceInnerHtml(html, standard, renderPublicNavLinks(path));
  const guide = findTagByClass(html, "div", "navlinks");
  if (guide) return replaceInnerHtml(html, guide, renderPublicNavLinks(path));

  const nav = findFirstTag(html, "nav");
  if (!nav) return html;
  const inner = html.slice(nav.openEnd, nav.closeStart);
  const brand = findBrandAnchor(inner);
  const replacement = brand
    ? `${brand}<div class="nav-links">${renderPublicNavLinks(path)}</div>`
    : renderPublicNavLinks(path);
  return replaceInnerHtml(html, nav, replacement);
}

function ensureSecondaryAboutLink(html) {
  if (typeof html !== "string") return html;
  const footer = findFirstTag(html, "footer");
  if (!footer) return html;
  const block = html.slice(footer.start, footer.end);
  if (/href=["']\/about(?:["'#?])/i.test(block)) return html;
  const secondary = '<nav class="vx-public-secondary-nav" aria-label="Secondary navigation"><a href="/about">About</a></nav>';
  return html.slice(0, footer.closeStart) + secondary + html.slice(footer.closeStart);
}

function insertHomeGuideNavLink(html) {
  return normalizePublicNavigation(html, HOME_PATH);
}

function removeGeneralPerformanceStrip(html) {
  if (typeof html !== "string") return html;
  const range = findTagByClass(html, "section", "vx-performance-strip");
  if (!range) return html;
  return html.slice(0, range.start) + html.slice(range.end);
}

function addSystemsGuideButton(html) {
  if (typeof html !== "string" || html.includes(`href="${GUIDE_BLOCK_HREF}"`)) return html;
  const range = findTagByClass(html, "div", "vx-systems-actions");
  if (!range) return html;

  const block = html.slice(range.start, range.end);
  const liveButton = /(<a\b[^>]*href=["']\/dashboard["'][^>]*>\s*Live Dashboard\s*<\/a>)/i;
  if (!liveButton.test(block)) return html;
  const updated = block.replace(
    liveButton,
    `<a class="vx-systems-btn" href="${GUIDE_BLOCK_HREF}">${GUIDE_NAV_TEXT}</a>$1`
  );
  return html.slice(0, range.start) + updated + html.slice(range.end);
}

function moveGuideBeforeDisclosure(html) {
  if (typeof html !== "string") return html;
  const guideRange = findTagByClass(html, "section", "vx-guide-compact");
  const disclosureRange = findTagByClass(html, "div", "vx-detail-footer");
  if (!guideRange || !disclosureRange || guideRange.start < disclosureRange.start) return html;
  const guide = html.slice(guideRange.start, guideRange.end);
  let result = html.slice(0, guideRange.start) + html.slice(guideRange.end);
  const disclosureAfterRemoval = findTagByClass(result, "div", "vx-detail-footer");
  if (!disclosureAfterRemoval) return html;
  return result.slice(0, disclosureAfterRemoval.start) + guide + result.slice(disclosureAfterRemoval.start);
}

function prependNfaToClass(html, className) {
  const pattern = new RegExp(
    `<([a-z0-9]+)\\b([^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\3[^>]*)>([\\s\\S]*?)<\\/\\1>`,
    "gi"
  );
  return html.replace(pattern, (match, tag, attrs, _quote, body) => {
    if (/Not Financial Advice/i.test(body)) return match;
    return `<${tag}${attrs}>${NFA_TEXT} ${body}</${tag}>`;
  });
}

function addNfaToDisclaimers(html) {
  if (typeof html !== "string") return html;
  let result = html;

  if (!result.includes('class="vx-nfa-disclosure"')) {
    result = result.replace(
      /(<strong>\s*Important disclosure:\s*<\/strong>)/i,
      `$1 <span class="vx-nfa-disclosure">${NFA_TEXT}</span>`
    );
  }

  for (const className of ["vx-detail-footer", "vx-watch-risk", "vx-trial-disclosure"]) {
    result = prependNfaToClass(result, className);
  }
  return result;
}

const styles = `
<style id="${STYLE_ID}">
  .nav-links,.navlinks{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .nav-links a,.navlinks a{font-size:12.5px}
  .vx-public-nav-login{color:#425049!important;font-weight:650!important}
  .vx-public-nav-cta{display:inline-flex!important;align-items:center;justify-content:center;min-height:38px;padding:0 14px!important;border:1px solid #078f51!important;border-radius:999px;background:#078f51!important;color:#fff!important;text-decoration:none!important;font-weight:700!important;white-space:nowrap}
  .vx-public-secondary-nav{display:flex;justify-content:center;margin-top:12px}.vx-public-secondary-nav a{color:#5f6d67;font-size:12px;text-decoration:none}.vx-public-secondary-nav a:hover{text-decoration:underline;text-underline-offset:3px}
  a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #0a7f4b!important;outline-offset:3px!important}
  .vx-home-hero-lead,.vx-home-hero-proof,.vx-home-hero-login,.vx-home-day-head p,.vx-home-system-card>p,.vx-systems-lead,.vx-category-card p,.vx-detail-card p,.vx-detail-list li,.vx-watch-lead,.vx-trial-review,.vx-guide-copy,.vx-guide-step span,.guide-step p,.section-head p,.quick-item span{color:#56645e!important}
  .vx-home-day-details-link,.vx-home-day-scope,.vx-home-equity-foot,.vx-home-day-freshness,.vx-home-equity-coverage,.vx-detail-footer,.vx-watch-risk,.vx-trial-disclosure,.footer{color:#5f6d67!important}
  .vx-home-day-details-link{font-size:12px!important}.vx-home-day-scope,.vx-home-equity-foot,.vx-home-day-freshness,.vx-home-equity-coverage{font-size:12px!important}
  .vx-home-live-label{color:#5f6d67!important;font-size:11.5px!important}.vx-home-equity-svg text{fill:#5f6d67!important;font-size:11px!important}
  .vx-guide-compact .vx-guide-grid .vx-guide-title{font-size:18px!important;line-height:1.25!important;white-space:normal!important}
  .vx-systems-hero h1{font-size:clamp(42px,4.8vw,58px)!important;line-height:1.04!important;letter-spacing:-.038em!important}
  .vx-watch-hero h1{font-size:clamp(36px,4.4vw,50px)!important;line-height:1.06!important}
  @media(max-width:900px){.nav-links,.navlinks{gap:8px;flex-wrap:nowrap;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin}.nav-links>a,.navlinks>a{flex:0 0 auto}.vx-public-nav-login,.vx-public-nav-cta{display:inline-flex!important}}
  @media(max-width:700px){.vx-systems-hero h1{font-size:clamp(34px,9vw,44px)!important}.vx-watch-hero h1{font-size:clamp(32px,9vw,40px)!important}.vx-home-live-label{font-size:11px!important}.vx-home-equity-svg text{font-size:10.5px!important}.vx-public-nav-cta{min-height:40px}}
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function refineNavigationAndDisclosure(html, path) {
  if (typeof html !== "string") return html;
  let result = addNfaToDisclaimers(html);
  if (PUBLIC_NAV_PATHS.has(path)) {
    result = normalizePublicNavigation(result, path);
    result = ensureSecondaryAboutLink(result);
  }
  if (path === SYSTEMS_PATH) {
    result = removeGeneralPerformanceStrip(result);
    result = addSystemsGuideButton(result);
    result = moveGuideBeforeDisclosure(result);
  }
  if (PUBLIC_NAV_PATHS.has(path)) {
    result = injectStyles(result);
    result = injectFunnelAccessScript(result);
  }
  return result;
}

function installNavigationDisclosureRefinement(app) {
  app.use((req, res, next) => {
    const path = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithNavigationDisclosure(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refineNavigationAndDisclosure(body, path);
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
    try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(expressFactory) {
  if (typeof expressFactory !== "function" || expressFactory.__vixaleNavigationDisclosureWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installNavigationDisclosureRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleNavigationDisclosureWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleNavigationDisclosureModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  SYSTEMS_PATH,
  GUIDE_PATH,
  RESULTS_PATH,
  GUIDE_BLOCK_HREF,
  GUIDE_NAV_TEXT,
  NFA_TEXT,
  STYLE_ID,
  PUBLIC_NAV_PATHS,
  findTagRangeFromOpen,
  findTagByClass,
  findFirstTag,
  findBrandAnchor,
  accessHrefForPath,
  renderPublicNavLinks,
  normalizePublicNavigation,
  ensureSecondaryAboutLink,
  insertHomeGuideNavLink,
  removeGeneralPerformanceStrip,
  addSystemsGuideButton,
  moveGuideBeforeDisclosure,
  prependNfaToClass,
  addNfaToDisclaimers,
  injectStyles,
  refineNavigationAndDisclosure,
  installNavigationDisclosureRefinement,
  wrapExpress,
};
