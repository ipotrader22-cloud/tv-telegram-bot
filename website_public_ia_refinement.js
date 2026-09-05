"use strict";

const Module = require("module");

const HOME_PATH = "/";
const SYSTEMS_PATH = "/trading-systems";
const SERVICES_PATH = "/services";
const PRICING_PATH = "/pricing";
const RISK_PATH = "/risk-management";
const RISK_NAV_MARKER = "vx-risk-management-nav-link";
const PRICING_STYLE_ID = "vx-pricing-access-style";

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
  .vx-trial-page{min-height:calc(100vh - 170px);padding:76px 0 96px;background:linear-gradient(180deg,#f5fbf7 0%,#fff 58%)}
  .vx-trial-hero{max-width:940px;margin:0 auto;text-align:center}
  .vx-trial-kicker{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border:1px solid #bfead5;border-radius:999px;background:#f4fbf7;color:#176442;font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
  .vx-trial-hero h1{max-width:820px;margin:18px auto 0;color:#17211d;font-size:clamp(42px,6vw,68px);line-height:1.02;letter-spacing:-.045em;font-weight:500}
  .vx-trial-lead{max-width:760px;margin:20px auto 0;color:#68736f;font-size:17px;line-height:1.65}
  .vx-trial-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px}
  .vx-trial-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #cbdad2;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:13px;font-weight:650}
  .vx-trial-btn.primary{border-color:#078f51;background:#078f51;color:#fff}
  .vx-trial-btn:hover{transform:translateY(-1px)}
  .vx-trial-review{max-width:720px;margin:16px auto 0;color:#7a8580;font-size:12.5px;line-height:1.55}
  .vx-trial-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;max-width:1000px;margin:52px auto 0}
  .vx-trial-card{padding:28px;border:1px solid #dbe7e0;border-radius:24px;background:rgba(255,255,255,.92);box-shadow:0 14px 38px rgba(24,54,42,.05)}
  .vx-trial-card-kicker{color:#2d7a58;font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
  .vx-trial-card h2{margin:10px 0 0;color:#17211d;font-size:25px;line-height:1.15;letter-spacing:-.025em;font-weight:500}
  .vx-trial-list{display:grid;gap:10px;margin:20px 0 0;padding:0;list-style:none}
  .vx-trial-list li{position:relative;padding-left:20px;color:#68736f;font-size:14px;line-height:1.5}
  .vx-trial-list li:before{content:"";position:absolute;left:0;top:.58em;width:7px;height:7px;border-radius:50%;background:#0bcf74}
  .vx-trial-steps{display:grid;gap:14px;margin-top:20px}
  .vx-trial-step{display:grid;grid-template-columns:32px 1fr;gap:12px;align-items:start}
  .vx-trial-step-number{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid #cce8d9;border-radius:50%;background:#f4fbf7;color:#176442;font-size:11px;font-weight:650}
  .vx-trial-step strong{display:block;color:#17211d;font-size:13.5px;font-weight:650}
  .vx-trial-step span{display:block;margin-top:4px;color:#68736f;font-size:13px;line-height:1.45}
  .vx-trial-disclosure{max-width:920px;margin:24px auto 0;padding-top:20px;border-top:1px solid #e3e9e5;color:#7a8580;text-align:center;font-size:12px;line-height:1.55}
  @media(max-width:760px){.vx-trial-page{padding:52px 0 72px}.vx-trial-grid{grid-template-columns:1fr;margin-top:38px}.vx-trial-card{padding:22px;border-radius:21px}.vx-trial-actions{flex-direction:column;align-items:stretch}.vx-trial-btn{width:100%}.vx-trial-hero h1{font-size:42px}}
</style>`;

function injectPricingStyles(html) {
  if (html.includes(`id="${PRICING_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${pricingStyles}\n</head>`) : `${pricingStyles}${html}`;
}

function renderPricingFromLanding(html) {
  if (typeof html !== "string") return html;
  const content = `<section class="vx-trial-page"><div class="wrap">
    <div class="vx-trial-hero">
      <div class="vx-trial-kicker">7 Days Free</div>
      <h1>Watch Vixale free for 7 days.</h1>
      <p class="vx-trial-lead">Start with the read-only live dashboard. See active trade ideas, open trades, closed trades, and tracked results before deciding whether Vixale is right for you.</p>
      <div class="vx-trial-actions"><a class="vx-trial-btn primary" href="/#access">Request 7-Day Access</a><a class="vx-trial-btn" href="${SYSTEMS_PATH}">Explore Trading Systems</a></div>
      <p class="vx-trial-review">Access requests are reviewed manually. Approved viewers receive an individual dashboard code by email.</p>
    </div>
    <div class="vx-trial-grid">
      <article class="vx-trial-card"><div class="vx-trial-card-kicker">What you can see</div><h2>Follow the system before you make a decision.</h2><ul class="vx-trial-list"><li>Active trade ideas the system is watching.</li><li>Open trades currently being tracked.</li><li>Closed trades and recorded results.</li><li>A clear read-only view of the trading process.</li></ul></article>
      <article class="vx-trial-card"><div class="vx-trial-card-kicker">How it works</div><h2>Three simple steps.</h2><div class="vx-trial-steps"><div class="vx-trial-step"><div class="vx-trial-step-number">1</div><div><strong>Request access</strong><span>Send the short dashboard access form.</span></div></div><div class="vx-trial-step"><div class="vx-trial-step-number">2</div><div><strong>Receive your code</strong><span>Approved viewers receive an individual login code by email.</span></div></div><div class="vx-trial-step"><div class="vx-trial-step-number">3</div><div><strong>Watch for 7 days</strong><span>Follow trade ideas, open positions, closes, and tracked results.</span></div></div></div></article>
    </div>
    <div class="vx-trial-disclosure">Dashboard access is read-only and provided for transparency, tracking, education, and research. Trading involves risk and results are not guaranteed.</div>
  </div></section>`;
  let result = transformPrimaryNav(html);
  result = normalizeHeaderHashLinksToHome(result);
  result = replaceMainContents(result, content);
  result = injectPricingStyles(result);
  result = updateTitle(result, "Vixale | 7 Days Free");
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
