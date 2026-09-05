"use strict";

const Module = require("module");

const HOME_PATH = "/";
const HERO_NEEDLE = "Vixale live dashboard";
const HERO_REQUIRED_MARKER = "Request Dashboard Access";
const STYLE_ID = "vx-home-conversion-style";
const HOME_REMOVE_SECTION_NEEDLES = [
  "You can start without trading anything.",
  "See what the system is doing.",
  "Simple steps. Clear choices.",
  "Have an audience? Launch a trading product with Vixale.",
  "Start by watching the live system.",
];

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
    const token = match[0];
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(token);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, end: tagPattern.lastIndex };
  }
  return null;
}

function findSectionByText(html, text) {
  const textIndex = html.indexOf(text);
  if (textIndex < 0) return null;
  const openStart = html.lastIndexOf("<section", textIndex);
  if (openStart < 0) return null;
  const range = findTagRangeFromOpen(html, "section", openStart);
  if (!range || range.end < textIndex) return null;
  return range;
}

function findHomeHeroRange(html) {
  const range = findSectionByText(html, HERO_NEEDLE);
  if (!range) return null;

  const openEnd = html.indexOf(">", range.start);
  if (openEnd < 0 || openEnd >= range.end) return null;
  const openTag = html.slice(range.start, openEnd + 1);
  const classMatch = openTag.match(/\bclass=(["'])(.*?)\1/i);
  if (!classMatch) return null;
  const classes = new Set(classMatch[2].split(/\s+/).filter(Boolean));
  if (!classes.has("wrap") || !classes.has("hero")) return null;

  const sectionHtml = html.slice(range.start, range.end);
  if (!sectionHtml.includes(HERO_REQUIRED_MARKER)) return null;
  return range;
}

function removeHomepageSections(html) {
  const ranges = [];
  const seen = new Set();
  for (const text of HOME_REMOVE_SECTION_NEEDLES) {
    const range = findSectionByText(html, text);
    if (!range) continue;
    const key = `${range.start}:${range.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranges.push(range);
  }
  ranges.sort((a, b) => b.start - a.start);
  let result = html;
  for (const range of ranges) result = result.slice(0, range.start) + result.slice(range.end);
  return result;
}

const homeStyles = `
<style id="${STYLE_ID}">
  .vx-home-hero{padding:56px 0 52px;background:linear-gradient(180deg,#f5fbf7 0%,#fff 74%);border-bottom:1px solid #e3e9e5}
  .vx-home-hero .wrap{max-width:1180px;margin:0 auto;padding-left:24px;padding-right:24px;box-sizing:border-box}
  .vx-home-hero-copy{max-width:1040px;margin:0 auto;padding:0 8px;box-sizing:border-box;text-align:center}
  .vx-home-hero-kicker{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border:1px solid #bfead5;border-radius:999px;background:#f4fbf7;color:#176442;font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
  .vx-home-hero h1{max-width:960px;margin:16px auto 0;color:#101413;font-size:clamp(40px,4.8vw,60px);font-weight:500;line-height:1.04;letter-spacing:-.04em;white-space:normal !important;word-break:normal;overflow-wrap:normal;text-wrap:balance}
  .vx-home-hero-lead{max-width:720px;margin:18px auto 0;color:#68736f;font-size:17px;line-height:1.55}
  .vx-home-hero-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:24px}
  .vx-home-hero-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border:1px solid #cbdad2;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:13px;font-weight:650;transition:transform .16s ease,box-shadow .16s ease}
  .vx-home-hero-btn:hover{transform:translateY(-1px)}
  .vx-home-hero-btn.primary{border-color:#078f51;background:#078f51;color:#fff;box-shadow:0 10px 24px rgba(7,143,81,.14)}
  .vx-home-hero-proof{margin:14px auto 0;color:#78837e;font-size:12.5px;line-height:1.5}
  .vx-home-hero-login{margin:7px auto 0;color:#8b9691;font-size:12px;line-height:1.5}
  .vx-home-hero-login a{color:#4f5d57;text-underline-offset:3px}
  @media(max-width:700px){.vx-home-hero{padding:42px 0 46px}.vx-home-hero .wrap{padding-left:18px;padding-right:18px}.vx-home-hero-copy{padding:0}.vx-home-hero h1{font-size:clamp(36px,10vw,44px);line-height:1.06}.vx-home-hero-lead{font-size:16px}.vx-home-hero-actions{flex-direction:column;align-items:stretch;margin-top:22px}.vx-home-hero-btn{width:100%;box-sizing:border-box}}
</style>`;

function injectHomeStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${homeStyles}\n</head>`) : `${homeStyles}${html}`;
}

function renderHomeHero() {
  return `<section class="vx-home-hero"><div class="wrap"><div class="vx-home-hero-copy">
    <div class="vx-home-hero-kicker">Vixale live dashboard</div>
    <h1>Watch our trading systems live before you trade them.</h1>
    <p class="vx-home-hero-lead">See active trade ideas, open trades, closed trades, and recorded results in one read-only dashboard.</p>
    <div class="vx-home-hero-actions"><a class="vx-home-hero-btn primary" href="#password-access">Request 7-Day Access</a><a class="vx-home-hero-btn" href="/trading-systems">Explore Trading Systems</a></div>
    <p class="vx-home-hero-proof">Read-only dashboard · Manual approval · Individual access code</p>
    <p class="vx-home-hero-login">Already have access? <a href="/dashboard">Dashboard Login</a></p>
  </div></div></section>`;
}

function refineHomepage(html) {
  if (typeof html !== "string") return html;
  let result = html;
  const alreadyRefined = result.includes('class="vx-home-hero"');
  if (!alreadyRefined) {
    const range = findHomeHeroRange(result);
    if (!range) return html;
    result = result.slice(0, range.start) + renderHomeHero() + result.slice(range.end);
  }
  result = removeHomepageSections(result);
  result = injectHomeStyles(result);
  return result;
}

function installHomeConversionRefinement(app) {
  app.use((req, res, next) => {
    const path = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || path !== HOME_PATH) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithHomeConversion(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) body = refineHomepage(body);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleHomeConversionWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installHomeConversionRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleHomeConversionWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleHomeConversionModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  HERO_NEEDLE,
  HERO_REQUIRED_MARKER,
  HOME_REMOVE_SECTION_NEEDLES,
  STYLE_ID,
  findSectionByText,
  findHomeHeroRange,
  removeHomepageSections,
  injectHomeStyles,
  renderHomeHero,
  refineHomepage,
  installHomeConversionRefinement,
  wrapExpress,
};
