"use strict";

const Module = require("module");

const HOME_PATH = "/";
const ABOUT_PATH = "/about";
const STYLE_ID = "vx-about-refinement-style";
const HOME_MARKER = 'class="vx-home-credibility"';
const ABOUT_MARKER = 'class="vx-about-page"';
const PUBLIC_PATHS = new Set([
  HOME_PATH,
  ABOUT_PATH,
  "/trading-systems",
  "/trading-systems/day-trading",
  "/trading-systems/swing-trading",
  "/trading-systems/options",
  "/services",
  "/pricing",
  "/closed-trades",
  "/trading-guide",
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
    if (depth === 0) {
      return { start: openStart, end: tagPattern.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
    }
  }
  return null;
}

function insertAboutNavLink(html) {
  if (typeof html !== "string") return html;
  const navStart = html.search(/<nav\b/i);
  const navRange = findTagRangeFromOpen(html, "nav", navStart);
  if (!navRange) return html;
  let nav = html.slice(navRange.start, navRange.end);
  if (/>\s*About\s*<\/a>/i.test(nav) || /href=["']\/about["']/i.test(nav)) return html;

  const aboutLink = '<a href="/about">About</a>';
  if (/(<a\b[^>]*>\s*Services\s*<\/a>)/i.test(nav)) {
    nav = nav.replace(/(<a\b[^>]*>\s*Services\s*<\/a>)/i, `${aboutLink}$1`);
  } else if (/(<a\b[^>]*>\s*Watch System for Free\s*<\/a>)/i.test(nav)) {
    nav = nav.replace(/(<a\b[^>]*>\s*Watch System for Free\s*<\/a>)/i, `${aboutLink}$1`);
  } else if (/(<a\b[^>]*>\s*Live Dashboard\s*<\/a>)/i.test(nav)) {
    nav = nav.replace(/(<a\b[^>]*>\s*Live Dashboard\s*<\/a>)/i, `${aboutLink}$1`);
  } else {
    return html;
  }
  return html.slice(0, navRange.start) + nav + html.slice(navRange.end);
}

function updateTitle(html, title) {
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    : html;
}

function updateCanonical(html, path) {
  const pattern = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
  const match = html.match(pattern);
  if (!match) return html;
  const updated = /href=["'][^"']*["']/i.test(match[0])
    ? match[0].replace(/href=["'][^"']*["']/i, `href="https://www.vixale.com${path}"`)
    : match[0].replace(/>$/, ` href="https://www.vixale.com${path}">`);
  return html.replace(match[0], updated);
}

function updateDescription(html, description) {
  const pattern = /<meta\b[^>]*name=["']description["'][^>]*>/i;
  const match = html.match(pattern);
  if (!match) return html;
  const updated = /content=["'][^"']*["']/i.test(match[0])
    ? match[0].replace(/content=["'][^"']*["']/i, `content="${description}"`)
    : match[0].replace(/>$/, ` content="${description}">`);
  return html.replace(match[0], updated);
}

function replaceMainContents(html, innerHtml) {
  const mainStart = html.search(/<main\b/i);
  const range = findTagRangeFromOpen(html, "main", mainStart);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${innerHtml}\n` + html.slice(range.closeStart);
}

function renderHomeCredibility() {
  return `<section class="vx-home-credibility" aria-labelledby="vx-home-credibility-title"><div class="wrap"><div class="vx-home-credibility-grid">
    <div class="vx-home-credibility-copy"><span class="vx-about-kicker">Independent · Founder-operated</span><h2 id="vx-home-credibility-title">Built by a systematic trader and software developer.</h2><p>Vixale is an independent trading systems and software project built around rules-based research, automation, live system visibility, and documented performance.</p></div>
    <div class="vx-home-founder-card"><span>Founder &amp; Operator</span><strong>Systematic Trader &amp; Software Developer</strong><p>Vixale does not trade or manage customer brokerage accounts.</p><a href="${ABOUT_PATH}">About Vixale →</a></div>
  </div></div></section>`;
}

function insertHomeCredibility(html) {
  if (typeof html !== "string" || html.includes(HOME_MARKER)) return html;
  const mainStart = html.search(/<main\b/i);
  const range = findTagRangeFromOpen(html, "main", mainStart);
  if (!range) return html;
  return html.slice(0, range.closeStart) + renderHomeCredibility() + html.slice(range.closeStart);
}

function renderAboutContent() {
  return `<section class="vx-about-page"><div class="wrap">
    <header class="vx-about-hero"><span class="vx-about-kicker">Independent · Founder-operated</span><h1>About Vixale</h1><p>Vixale is an independent trading systems and software project focused on transparent, rules-based market research, automation, and live performance tracking.</p></header>

    <div class="vx-about-grid">
      <article class="vx-about-card vx-about-founder"><span class="vx-about-card-kicker">About the Founder</span><h2>Founder &amp; Operator</h2><h3>Systematic Trader &amp; Software Developer</h3><p>Vixale is built and operated by its founder. The work combines systematic trading research, software development, automation, monitoring, and the public presentation of system activity and results.</p></article>
      <article class="vx-about-card"><span class="vx-about-card-kicker">Why Vixale exists</span><h2>Make the system observable.</h2><p>Vixale was created around a simple principle: a trading system should be observable before someone decides whether it is useful. The project therefore emphasizes live system status, documented methodology, and a verifiable closed-trade history rather than relying only on marketing claims.</p></article>
    </div>

    <section class="vx-about-principles" aria-labelledby="vx-about-principles-title"><div class="vx-about-section-head"><span class="vx-about-card-kicker">How the project operates</span><h2 id="vx-about-principles-title">Independent, software-first, and transparent.</h2></div><div class="vx-about-principle-grid">
      <div><strong>Rules-based systems</strong><p>Strategies are presented as defined systems with documented workflows and methodology.</p></div>
      <div><strong>Software &amp; automation</strong><p>Vixale develops software that supports monitoring, automation, data presentation, and system operations.</p></div>
      <div><strong>Observable performance</strong><p>Live dashboards and closed-trade records are used to show how systems behave over time.</p></div>
      <div><strong>No customer account management</strong><p>Vixale does not trade or manage customer brokerage accounts.</p></div>
    </div></section>

    <section class="vx-about-cta"><div><span class="vx-about-card-kicker">Explore Vixale</span><h2>See the systems and the recorded results.</h2><p>Start with the trading systems, live dashboard, and closed-trade archive.</p></div><div class="vx-about-actions"><a class="primary" href="/trading-systems">Explore Trading Systems</a><a href="/dashboard">Live Dashboard</a><a href="/closed-trades">Closed Trades Archive</a></div></section>
  </div></section>`;
}

const styles = `
<style id="${STYLE_ID}">
  .vx-about-page,.vx-home-credibility{color:#17211d}
  .vx-about-page>.wrap,.vx-home-credibility>.wrap{width:min(1120px,calc(100% - 48px));margin:0 auto}
  .vx-about-kicker,.vx-about-card-kicker{color:#176442;font-size:10.5px;font-weight:750;letter-spacing:.085em;text-transform:uppercase}
  .vx-home-credibility{padding:34px 0 42px;border-top:1px solid #e3e9e5;background:#fbfdfc}
  .vx-home-credibility-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:18px;align-items:stretch}
  .vx-home-credibility-copy,.vx-home-founder-card{padding:26px 28px;border:1px solid #dce7e1;border-radius:24px;background:#fff;box-shadow:0 12px 34px rgba(31,67,51,.035)}
  .vx-home-credibility-copy h2{max-width:700px;margin:9px 0 0;font-size:clamp(24px,2.6vw,32px);font-weight:520;line-height:1.08;letter-spacing:-.03em}
  .vx-home-credibility-copy p{max-width:760px;margin:11px 0 0;color:#68736f;font-size:14px;line-height:1.55}
  .vx-home-founder-card{display:flex;flex-direction:column;justify-content:center}
  .vx-home-founder-card>span{color:#176442;font-size:10.5px;font-weight:750;letter-spacing:.07em;text-transform:uppercase}
  .vx-home-founder-card>strong{margin-top:8px;font-size:18px;font-weight:600;line-height:1.25}
  .vx-home-founder-card>p{margin:9px 0 0;color:#68736f;font-size:13px;line-height:1.5}
  .vx-home-founder-card>a{display:inline-flex;align-items:center;align-self:flex-start;min-height:38px;margin-top:15px;padding:0 15px;border:1px solid #cbdad2;border-radius:999px;background:#fff;color:#176442;text-decoration:none;font-size:12px;font-weight:700}
  .vx-about-page{padding:58px 0 76px;background:linear-gradient(180deg,#f5fbf7 0%,#fff 36%)}
  .vx-about-hero{max-width:900px;padding:22px 0 34px}
  .vx-about-hero h1{margin:10px 0 0;font-size:clamp(40px,5vw,58px);font-weight:520;line-height:1.02;letter-spacing:-.045em}
  .vx-about-hero p{max-width:780px;margin:16px 0 0;color:#68736f;font-size:17px;line-height:1.58}
  .vx-about-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .vx-about-card{padding:30px;border:1px solid #dce7e1;border-radius:26px;background:#fff;box-shadow:0 14px 38px rgba(31,67,51,.045)}
  .vx-about-card h2{margin:10px 0 0;font-size:27px;font-weight:550;line-height:1.08;letter-spacing:-.025em}
  .vx-about-card h3{margin:7px 0 0;color:#176442;font-size:14px;font-weight:650}
  .vx-about-card p{margin:14px 0 0;color:#68736f;font-size:14px;line-height:1.62}
  .vx-about-principles{margin-top:22px;padding:30px;border:1px solid #dce7e1;border-radius:26px;background:#fbfdfc}
  .vx-about-section-head h2{max-width:720px;margin:9px 0 0;font-size:30px;font-weight:540;line-height:1.08;letter-spacing:-.03em}
  .vx-about-principle-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px}
  .vx-about-principle-grid>div{padding:18px;border:1px solid #e0e9e4;border-radius:18px;background:#fff}
  .vx-about-principle-grid strong{font-size:13.5px;font-weight:700}
  .vx-about-principle-grid p{margin:7px 0 0;color:#68736f;font-size:12.5px;line-height:1.5}
  .vx-about-cta{display:flex;align-items:center;justify-content:space-between;gap:26px;margin-top:22px;padding:28px 30px;border:1px solid #dce7e1;border-radius:26px;background:#fff}
  .vx-about-cta h2{margin:9px 0 0;font-size:26px;font-weight:550;line-height:1.1;letter-spacing:-.025em}
  .vx-about-cta p{margin:8px 0 0;color:#68736f;font-size:13.5px;line-height:1.5}
  .vx-about-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
  .vx-about-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border:1px solid #cbdad2;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:12px;font-weight:700;white-space:nowrap}
  .vx-about-actions a.primary{border-color:#078f51;background:#078f51;color:#fff}
  @media(max-width:900px){.vx-home-credibility-grid,.vx-about-grid{grid-template-columns:1fr}.vx-about-principle-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-about-cta{align-items:flex-start;flex-direction:column}.vx-about-actions{justify-content:flex-start}}
  @media(max-width:620px){.vx-about-page>.wrap,.vx-home-credibility>.wrap{width:min(100% - 32px,1120px)}.vx-home-credibility{padding:26px 0 32px}.vx-home-credibility-copy,.vx-home-founder-card,.vx-about-card,.vx-about-principles,.vx-about-cta{padding:22px;border-radius:22px}.vx-about-page{padding:42px 0 58px}.vx-about-hero{padding:10px 0 28px}.vx-about-hero h1{font-size:40px}.vx-about-hero p{font-size:15.5px}.vx-about-principle-grid{grid-template-columns:1fr}.vx-about-actions{width:100%;flex-direction:column}.vx-about-actions a{width:100%;box-sizing:border-box}}
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function renderAboutPage(html) {
  if (typeof html !== "string") return html;
  let result = insertAboutNavLink(html);
  result = replaceMainContents(result, renderAboutContent());
  result = updateTitle(result, "Vixale | About");
  result = updateCanonical(result, ABOUT_PATH);
  result = updateDescription(result, "About Vixale, an independent founder-operated trading systems and software project focused on transparent system research, automation, and live performance tracking.");
  return injectStyles(result);
}

function refineAboutExperience(html, path) {
  if (typeof html !== "string" || !PUBLIC_PATHS.has(path)) return html;
  if (path === ABOUT_PATH) return renderAboutPage(html);
  let result = insertAboutNavLink(html);
  if (path === HOME_PATH) {
    result = insertHomeCredibility(result);
    result = injectStyles(result);
  }
  return result;
}

function installAboutRefinement(app) {
  app.use((req, res, next) => {
    const originalPath = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || !PUBLIC_PATHS.has(originalPath)) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithAboutRefinement(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refineAboutExperience(body, originalPath);
      }
      return originalSend(body);
    };

    if (originalPath === ABOUT_PATH) {
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleAboutRefinementWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installAboutRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleAboutRefinementWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleAboutRefinementModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  ABOUT_PATH,
  STYLE_ID,
  HOME_MARKER,
  ABOUT_MARKER,
  PUBLIC_PATHS,
  findTagRangeFromOpen,
  insertAboutNavLink,
  updateTitle,
  updateCanonical,
  updateDescription,
  replaceMainContents,
  renderHomeCredibility,
  insertHomeCredibility,
  renderAboutContent,
  injectStyles,
  renderAboutPage,
  refineAboutExperience,
  installAboutRefinement,
  wrapExpress,
};
