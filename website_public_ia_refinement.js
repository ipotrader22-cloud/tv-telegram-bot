"use strict";

const Module = require("module");

const HOME_PATH = "/";
const SYSTEMS_PATH = "/trading-systems";
const SERVICES_PATH = "/services";
const PRICING_PATH = "/pricing";
const RISK_PATH = "/risk-management";
const RISK_NAV_MARKER = "vx-risk-management-nav-link";
const PRICING_STYLE_ID = "vx-pricing-coming-soon-style";

const SERVICE_SECTION_NEEDLES = [
  "What can we help you with?",
  "Book a quick setup call.",
  "Describe the trading bot you want.",
  "Send us your trading rules.",
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceDirectTextNavLink(html, oldText, href, newText) {
  const pattern = new RegExp(`<a\\b([^>]*)>\\s*${escapeRegex(oldText)}\\s*<\\/a>`, "g");
  return html.replace(pattern, `<a href="${href}">${newText}</a>`);
}

function removeDirectTextNavLink(html, text) {
  const pattern = new RegExp(`\\s*<a\\b[^>]*>\\s*${escapeRegex(text)}\\s*<\\/a>`, "g");
  return html.replace(pattern, "");
}

function transformPrimaryNav(html) {
  let result = html;
  result = removeDirectTextNavLink(result, "Risk Management");
  result = replaceDirectTextNavLink(result, "Why It Makes Sense", SERVICES_PATH, "Services");
  result = replaceDirectTextNavLink(result, "Creators", PRICING_PATH, "7 Days Free");
  return result;
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
    const token = match[0];
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(token);
    if (isClose) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return {
        start: openStart,
        end: tagPattern.lastIndex,
        openEnd: openEnd + 1,
        closeStart: match.index,
      };
    }
  }
  return null;
}

function findEnclosingTagRangeByText(html, tagName, text) {
  const textIndex = html.indexOf(text);
  if (textIndex < 0) return null;
  const openStart = html.lastIndexOf(`<${tagName}`, textIndex);
  if (openStart < 0) return null;
  const range = findTagRangeFromOpen(html, tagName, openStart);
  if (!range || range.end < textIndex) return null;
  return range;
}

function extractSectionByText(html, text) {
  const range = findEnclosingTagRangeByText(html, "section", text);
  return range ? html.slice(range.start, range.end) : "";
}

function removeSectionsByText(html, texts) {
  const ranges = [];
  const seen = new Set();
  for (const text of texts) {
    const range = findEnclosingTagRangeByText(html, "section", text);
    if (!range) continue;
    const key = `${range.start}:${range.end}`;
    if (!seen.has(key)) {
      seen.add(key);
      ranges.push(range);
    }
  }
  ranges.sort((a, b) => b.start - a.start);
  let result = html;
  for (const range of ranges) result = result.slice(0, range.start) + result.slice(range.end);
  return result;
}

function replaceMainContents(html, innerHtml) {
  const mainStart = html.search(/<main\b/i);
  if (mainStart < 0) return html;
  const range = findTagRangeFromOpen(html, "main", mainStart);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${innerHtml}\n` + html.slice(range.closeStart);
}

function updateTitle(html, title) {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  }
  return html;
}

function updateCanonical(html, path) {
  const linkPattern = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
  const match = html.match(linkPattern);
  if (!match) return html;
  const updated = match[0].replace(/href=["'][^"']*["']/i, `href="https://www.vixale.com${path}"`);
  return html.replace(match[0], updated);
}

function normalizeHeaderHashLinksToHome(html) {
  const navNeedle = "Live System";
  const navRange = findEnclosingTagRangeByText(html, "nav", navNeedle);
  if (!navRange) return html;
  const navHtml = html.slice(navRange.start, navRange.end).replace(/href=["']#([^"']*)["']/g, 'href="/#$1"');
  return html.slice(0, navRange.start) + navHtml + html.slice(navRange.end);
}

function refineHomeHtml(html) {
  if (typeof html !== "string") return html;
  let result = transformPrimaryNav(html);
  result = removeSectionsByText(result, SERVICE_SECTION_NEEDLES);
  return result;
}

function renderServicesFromLanding(html) {
  if (typeof html !== "string") return html;
  const sections = SERVICE_SECTION_NEEDLES.map((needle) => extractSectionByText(html, needle)).filter(Boolean);
  let result = transformPrimaryNav(html);
  result = normalizeHeaderHashLinksToHome(result);
  if (sections.length) result = replaceMainContents(result, sections.join("\n\n"));
  result = updateTitle(result, "Vixale | Services");
  result = updateCanonical(result, SERVICES_PATH);
  return result;
}

const pricingStyles = `
<style id="${PRICING_STYLE_ID}">
  .vx-pricing-coming-soon{min-height:calc(100vh - 170px);display:flex;align-items:center;padding:72px 0 96px;background:linear-gradient(180deg,#f7fbf9 0%,#fff 100%)}
  .vx-pricing-card{max-width:920px;margin:0 auto;padding:54px 48px;border:1px solid #dbe7e0;border-radius:30px;background:rgba(255,255,255,.88);box-shadow:0 14px 38px rgba(24,54,42,.055);text-align:center}
  .vx-pricing-kicker{margin-bottom:10px;color:#2d7a58;font-size:12px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
  .vx-pricing-card h1{margin:0;color:#17211d;font-size:clamp(40px,6vw,64px);line-height:1.04;letter-spacing:-.04em;font-weight:500}
  .vx-pricing-card p{margin:18px 0 0;color:#6a7771;font-size:17px;line-height:1.6}
  @media(max-width:640px){.vx-pricing-coming-soon{padding:48px 0 72px}.vx-pricing-card{padding:38px 24px;border-radius:24px}.vx-pricing-card h1{font-size:40px}}
</style>`;

function injectPricingStyles(html) {
  if (html.includes(`id="${PRICING_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${pricingStyles}\n</head>`) : `${pricingStyles}${html}`;
}

function renderPricingFromLanding(html) {
  if (typeof html !== "string") return html;
  const content = `<section class="vx-pricing-coming-soon"><div class="wrap"><div class="vx-pricing-card"><div class="vx-pricing-kicker">Pricing</div><h1>7 Days Free</h1><p>Coming Soon</p></div></div></section>`;
  let result = transformPrimaryNav(html);
  result = normalizeHeaderHashLinksToHome(result);
  result = replaceMainContents(result, content);
  result = injectPricingStyles(result);
  result = updateTitle(result, "Vixale | Pricing");
  result = updateCanonical(result, PRICING_PATH);
  return result;
}

function injectRiskManagementNav(html) {
  if (typeof html !== "string" || html.includes(`class="${RISK_NAV_MARKER}"`)) return html;
  const navAnchor = '<div class="nav-links">';
  if (!html.includes(navAnchor)) return html;
  return html.replace(navAnchor, `${navAnchor}<a class="${RISK_NAV_MARKER}" href="${RISK_PATH}">Risk Management</a>`);
}

function installPublicIaRefinement(app) {
  app.use((req, res, next) => {
    const originalPath = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();

    let mode = null;
    if (originalPath === HOME_PATH) mode = "home";
    else if (originalPath === SYSTEMS_PATH) mode = "systems";
    else if (originalPath === SERVICES_PATH) mode = "services";
    else if (originalPath === PRICING_PATH) mode = "pricing";
    if (!mode) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithPublicIa(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        if (mode === "home") body = refineHomeHtml(body);
        else if (mode === "systems") body = injectRiskManagementNav(body);
        else if (mode === "services") body = renderServicesFromLanding(body);
        else if (mode === "pricing") body = renderPricingFromLanding(body);
      }
      return originalSend(body);
    };

    if (mode === "services" || mode === "pricing") {
      const queryIndex = req.url.indexOf("?");
      const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
      req.url = `/${query}`;
      if (Object.prototype.hasOwnProperty.call(req, "_parsedUrl")) delete req._parsedUrl;
    }

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
  if (typeof expressFactory !== "function" || expressFactory.__vixalePublicIaWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installPublicIaRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixalePublicIaWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixalePublicIaModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  SYSTEMS_PATH,
  SERVICES_PATH,
  PRICING_PATH,
  RISK_PATH,
  SERVICE_SECTION_NEEDLES,
  refineHomeHtml,
  renderServicesFromLanding,
  renderPricingFromLanding,
  injectRiskManagementNav,
  extractSectionByText,
  removeSectionsByText,
  replaceMainContents,
  installPublicIaRefinement,
  wrapExpress,
};
