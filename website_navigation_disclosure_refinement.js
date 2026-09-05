"use strict";

const Module = require("module");

const HOME_PATH = "/";
const SYSTEMS_PATH = "/trading-systems";
const GUIDE_BLOCK_HREF = `${SYSTEMS_PATH}#vx-how-to-trade-title`;
const GUIDE_NAV_TEXT = "How to Trade Vixale";
const NFA_TEXT = "NFA — Not Financial Advice.";

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
    if (depth === 0) return { start: openStart, end: tagPattern.lastIndex };
  }
  return null;
}

function findTagByClass(html, tagName, className) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "i");
  const match = html.match(pattern);
  if (!match) return null;
  return findTagRangeFromOpen(html, tagName, match.index);
}

function insertHomeGuideNavLink(html) {
  if (typeof html !== "string") return html;
  const navStart = html.search(/<nav\b/i);
  const navRange = findTagRangeFromOpen(html, "nav", navStart);
  if (!navRange) return html;

  let nav = html.slice(navRange.start, navRange.end);
  if (new RegExp(`>\\s*${escapeRegex(GUIDE_NAV_TEXT)}\\s*<\\/a>`, "i").test(nav)) return html;

  const systemsLink = /(<a\b[^>]*>\s*Trading Systems\s*<\/a>)/i;
  if (!systemsLink.test(nav)) return html;
  nav = nav.replace(systemsLink, `$1<a href="${GUIDE_BLOCK_HREF}">${GUIDE_NAV_TEXT}</a>`);
  return html.slice(0, navRange.start) + nav + html.slice(navRange.end);
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

function refineNavigationAndDisclosure(html, path) {
  if (typeof html !== "string") return html;
  let result = addNfaToDisclaimers(html);
  if (path === HOME_PATH) result = insertHomeGuideNavLink(result);
  if (path === SYSTEMS_PATH) {
    result = removeGeneralPerformanceStrip(result);
    result = addSystemsGuideButton(result);
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
  GUIDE_BLOCK_HREF,
  GUIDE_NAV_TEXT,
  NFA_TEXT,
  findTagRangeFromOpen,
  findTagByClass,
  insertHomeGuideNavLink,
  removeGeneralPerformanceStrip,
  addSystemsGuideButton,
  prependNfaToClass,
  addNfaToDisclaimers,
  refineNavigationAndDisclosure,
  installNavigationDisclosureRefinement,
  wrapExpress,
};
