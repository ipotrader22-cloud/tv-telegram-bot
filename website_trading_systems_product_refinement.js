"use strict";

const Module = require("module");

const SYSTEMS_PATH = "/trading-systems";
const STYLE_ID = "vx-trading-systems-product-style";
const PAGE_MARKER = 'class="vx-systems-page"';
const TELEGRAM_URL = "https://t.me/tradervip22";

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
    if (depth === 0) return { start: openStart, end: pattern.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
  }
  return null;
}

function replaceMainContents(html, innerHtml) {
  const mainStart = html.search(/<main\b/i);
  if (mainStart < 0) return html;
  const range = findTagRangeFromOpen(html, "main", mainStart);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${innerHtml}\n` + html.slice(range.closeStart);
}

function updateTitle(html) {
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, "<title>Vixale | Trading Systems</title>")
    : html;
}

function updateCanonical(html) {
  const pattern = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
  const match = html.match(pattern);
  if (!match) return html;
  const updated = match[0].replace(/href=["'][^"']*["']/i, `href="https://www.vixale.com${SYSTEMS_PATH}"`);
  return html.replace(match[0], updated);
}

function replaceDirectTextLink(html, oldText, href, newText) {
  const pattern = new RegExp(`<a\\b[^>]*>\\s*${escapeRegex(oldText)}\\s*<\\/a>`, "gi");
  return html.replace(pattern, `<a href="${href}">${newText}</a>`);
}

function normalizeSystemsNav(html) {
  const navStart = html.search(/<nav\b/i);
  if (navStart < 0) return html;
  const range = findTagRangeFromOpen(html, "nav", navStart);
  if (!range) return html;
  let nav = html.slice(range.start, range.end);
  nav = nav.replace(/\s*<a\b[^>]*class=["'][^"']*\bvx-beginner-nav-link\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
  nav = nav.replace(/\s*<a\b[^>]*class=["'][^"']*\bvx-risk-management-nav-link\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
  nav = replaceDirectTextLink(nav, "Risk Management", "/risk-management", "Risk Management").replace(/\s*<a href="\/risk-management">Risk Management<\/a>/gi, "");
  nav = replaceDirectTextLink(nav, "Live System", "/", "Home");
  nav = replaceDirectTextLink(nav, "Start Here", TELEGRAM_URL, "Telegram");
  nav = replaceDirectTextLink(nav, "Why It Makes Sense", "/services", "Services");
  nav = replaceDirectTextLink(nav, "7 Days Free", "/pricing", "Watch System for Free");
  nav = replaceDirectTextLink(nav, "Creators", "/pricing", "Watch System for Free");
  nav = replaceDirectTextLink(nav, "Request Access", "/pricing", "Watch System for Free");
  nav = replaceDirectTextLink(nav, "Open Dashboard", "/dashboard", "Live Dashboard");
  return html.slice(0, range.start) + nav + html.slice(range.end);
}

const styles = `
<style id="${STYLE_ID}">
  .vx-systems-page{padding:54px 0 82px;background:linear-gradient(180deg,#f5fbf7 0%,#fbfdfc 34%,#fff 78%);color:#17211d}
  .vx-systems-page .wrap{max-width:1180px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-systems-hero{max-width:940px;margin:0 auto;text-align:center}
  .vx-systems-kicker{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border:1px solid #bfe8d4;border-radius:999px;background:#f8fcfa;color:#176442;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .vx-systems-hero h1{max-width:900px;margin:18px auto 0;color:#101413;font-size:clamp(42px,5.3vw,66px);font-weight:520;line-height:1.02;letter-spacing:-.045em;text-wrap:balance}
  .vx-systems-lead{max-width:760px;margin:18px auto 0;color:#68736f;font-size:17px;line-height:1.58}
  .vx-systems-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:26px}
  .vx-systems-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border:1px solid #cadbd2;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:13px;font-weight:700;transition:transform .16s ease,box-shadow .16s ease}
  .vx-systems-btn:hover{transform:translateY(-1px)}.vx-systems-btn.primary{border-color:#078f51;background:#078f51;color:#fff;box-shadow:0 10px 26px rgba(7,143,81,.14)}
  .vx-systems-jump{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:28px auto 0}.vx-systems-jump a{display:inline-flex;align-items:center;min-height:34px;padding:0 13px;border:1px solid #d8e5de;border-radius:999px;background:rgba(255,255,255,.8);color:#53615b;text-decoration:none;font-size:12px;font-weight:650}
  .vx-systems-section{margin-top:58px}.vx-systems-section-head{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:18px}.vx-systems-section-head>div{max-width:760px}.vx-systems-eyebrow{color:#23704f;font-size:11px;font-weight:700;letter-spacing:.075em;text-transform:uppercase}.vx-systems-section h2{margin:8px 0 0;color:#17211d;font-size:clamp(30px,3.2vw,42px);font-weight:530;line-height:1.08;letter-spacing:-.035em}.vx-systems-section-head p{margin:10px 0 0;color:#6f7b76;font-size:14px;line-height:1.58}
  .vx-system-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  .vx-system-card{display:flex;min-height:290px;flex-direction:column;padding:25px;border:1px solid #dce7e1;border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 16px 44px rgba(31,67,51,.055);box-sizing:border-box}
  .vx-system-card.featured{background:linear-gradient(145deg,#fff 0%,#f3fbf6 100%);border-color:#cce5d7}.vx-system-card.swing{min-height:250px;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center}.vx-system-card.swing .vx-system-body{max-width:760px}
  .vx-system-meta{display:flex;align-items:center;justify-content:space-between;gap:12px}.vx-system-type{color:#287153;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.vx-system-status{display:inline-flex;align-items:center;gap:6px;color:#23704f;font-size:10.5px;font-weight:700}.vx-system-status:before{content:"";width:7px;height:7px;border-radius:50%;background:#0aa25f;box-shadow:0 0 0 4px rgba(10,162,95,.08)}
  .vx-system-card h3{margin:18px 0 0;color:#17211d;font-size:27px;font-weight:550;letter-spacing:-.03em}.vx-system-card p{margin:10px 0 0;color:#68736f;font-size:14px;line-height:1.58}
  .vx-system-facts{display:grid;gap:8px;margin:20px 0 0;padding:0;list-style:none}.vx-system-facts li{display:flex;gap:8px;color:#65716c;font-size:12.5px;line-height:1.45}.vx-system-facts li:before{content:"";flex:0 0 7px;width:7px;height:7px;margin-top:.48em;border-radius:50%;background:#11b86c}
  .vx-system-link{display:inline-flex;align-items:center;margin-top:auto;padding-top:22px;color:#176442;text-decoration:none;font-size:12.5px;font-weight:700}.vx-system-link:hover{text-decoration:underline;text-underline-offset:3px}
  .vx-swing-rule-pills{display:grid;grid-template-columns:repeat(2,minmax(132px,1fr));gap:9px;min-width:300px}.vx-swing-pill{padding:14px;border:1px solid #dce8e1;border-radius:17px;background:#fff}.vx-swing-pill strong{display:block;color:#17211d;font-size:11px;text-transform:uppercase;letter-spacing:.055em}.vx-swing-pill span{display:block;margin-top:5px;color:#6d7873;font-size:12px;line-height:1.35}
  .vx-compare-card{overflow:hidden;border:1px solid #dce7e1;border-radius:24px;background:#fff;box-shadow:0 16px 44px rgba(31,67,51,.045)}
  .vx-compare-scroll{overflow-x:auto}.vx-compare{width:100%;border-collapse:collapse;min-width:800px}.vx-compare th,.vx-compare td{padding:16px 18px;border-bottom:1px solid #edf2ef;text-align:left;vertical-align:top}.vx-compare th{background:#f7fbf8;color:#7b8781;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase}.vx-compare td{color:#5f6b66;font-size:12.5px;line-height:1.45}.vx-compare td:first-child{color:#17211d;font-weight:700}.vx-compare tr:last-child td{border-bottom:0}
  .vx-market-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.vx-market-card{padding:24px;border:1px solid #dce7e1;border-radius:23px;background:#fff}.vx-market-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.vx-market-card h3{margin:15px 0 0;font-size:24px;font-weight:550;letter-spacing:-.025em}.vx-market-card p{margin:9px 0 0;color:#68736f;font-size:13.5px;line-height:1.55}.vx-market-badge{padding:6px 9px;border-radius:999px;background:#f2f8f5;color:#23704f;font-size:10px;font-weight:700;letter-spacing:.055em;text-transform:uppercase}.vx-market-badge.dev{background:#f5f5f4;color:#777f7b}.vx-market-link{display:inline-flex;margin-top:17px;color:#176442;text-decoration:none;font-size:12.5px;font-weight:700}
  .vx-performance-cta{display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center;margin-top:58px;padding:30px;border:1px solid #cfe4d8;border-radius:28px;background:linear-gradient(110deg,#eef9f2,#fff);box-shadow:0 18px 48px rgba(31,67,51,.06)}.vx-performance-cta h2{margin:0;font-size:32px;font-weight:550;letter-spacing:-.035em}.vx-performance-cta p{max-width:650px;margin:9px 0 0;color:#68736f;font-size:14px;line-height:1.55}.vx-performance-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
  .vx-guide-strip{display:flex;justify-content:space-between;align-items:center;gap:22px;margin-top:22px;padding:20px 22px;border:1px solid #e0e8e4;border-radius:20px;background:#fff}.vx-guide-strip strong{display:block;font-size:14px}.vx-guide-strip span{display:block;margin-top:4px;color:#76817c;font-size:12.5px}.vx-guide-strip a{white-space:nowrap;color:#176442;font-size:12.5px;font-weight:700;text-decoration:none}
  .vx-research-risk{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}.vx-note-card{padding:20px 22px;border-top:1px solid #dfe8e3;color:#75807b;font-size:12px;line-height:1.55}.vx-note-card strong{display:block;margin-bottom:5px;color:#45534d;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
  @media(max-width:980px){.vx-system-grid,.vx-market-grid{grid-template-columns:1fr 1fr}.vx-system-card.swing{grid-template-columns:1fr}.vx-swing-rule-pills{min-width:0}.vx-performance-cta{grid-template-columns:1fr}.vx-performance-actions{justify-content:flex-start}}
  @media(max-width:700px){.vx-systems-page{padding:42px 0 64px}.vx-systems-page .wrap{padding:0 16px}.vx-systems-hero h1{font-size:clamp(38px,10vw,48px)}.vx-systems-actions{flex-direction:column}.vx-systems-btn{width:100%;box-sizing:border-box}.vx-systems-section{margin-top:44px}.vx-systems-section-head{align-items:flex-start;flex-direction:column}.vx-system-grid,.vx-market-grid,.vx-research-risk{grid-template-columns:1fr}.vx-system-card{min-height:0;padding:21px}.vx-system-card.swing{display:block}.vx-swing-rule-pills{grid-template-columns:1fr 1fr;margin-top:20px}.vx-performance-cta{padding:23px}.vx-performance-actions{flex-direction:column}.vx-performance-actions .vx-systems-btn{width:100%}.vx-guide-strip{align-items:flex-start;flex-direction:column}.vx-guide-strip a{white-space:normal}}
  @media(max-width:430px){.vx-swing-rule-pills{grid-template-columns:1fr}}
</style>`;

function renderSystemsPage() {
  return `<section class="vx-systems-page"><div class="wrap">
    <section class="vx-systems-hero">
      <div class="vx-systems-kicker">Vixale Trading Systems</div>
      <h1>Choose the Vixale system that fits your trading horizon.</h1>
      <p class="vx-systems-lead">Compare the systems first, then verify the results and watch the live dashboard before deciding what fits you.</p>
      <div class="vx-systems-actions"><a class="vx-systems-btn primary" href="/pricing">Watch System for Free</a><a class="vx-systems-btn" href="/dashboard">Live Dashboard</a></div>
      <nav class="vx-systems-jump" aria-label="Trading system categories"><a href="#day-trading">Day Trading</a><a href="#swing-trading">Swing Trading</a><a href="#market-coverage">Market Coverage</a></nav>
    </section>

    <section class="vx-systems-section" id="day-trading">
      <div class="vx-systems-section-head"><div><div class="vx-systems-eyebrow">Day Trading</div><h2>Three intraday approaches. One place to compare them.</h2><p>Prime, Edge, and Straddles remain grouped under Day Trading, with detailed execution instructions kept in the Trading Guide.</p></div></div>
      <div class="vx-system-grid">
        <article class="vx-system-card featured"><div class="vx-system-meta"><span class="vx-system-type">Stocks · Day Trading</span><span class="vx-system-status">Live</span></div><h3>Vixale Prime</h3><p>Confirmation-first intraday stock trading for traders who prefer to wait for a confirmed trend-change signal before entry.</p><ul class="vx-system-facts"><li>Market entry after signal confirmation</li><li>Higher-timeframe context</li><li>Tracked in the live dashboard</li></ul><a class="vx-system-link" href="#stocks">View stock systems →</a></article>
        <article class="vx-system-card"><div class="vx-system-meta"><span class="vx-system-type">Stocks · Day Trading</span><span class="vx-system-status">Live</span></div><h3>Vixale Edge</h3><p>Pullback-oriented intraday stock trading that uses a selected limit entry instead of entering immediately at market.</p><ul class="vx-system-facts"><li>Limit-order pullback entry</li><li>Trend-following context</li><li>Working orders can appear before fill</li></ul><a class="vx-system-link" href="#stocks">Compare Prime &amp; Edge →</a></article>
        <article class="vx-system-card"><div class="vx-system-meta"><span class="vx-system-type">Options · Day Trading</span><span class="vx-system-status">Live Desk</span></div><h3>Options Straddles</h3><p>Options-based intraday setups published with the position structure and follow-up instructions needed to track the trade lifecycle.</p><ul class="vx-system-facts"><li>Published options structure</li><li>Target and lifecycle updates</li><li>Documented in the Options Desk</li></ul><a class="vx-system-link" href="#options">View Options coverage →</a></article>
      </div>
    </section>

    <section class="vx-systems-section" id="swing-trading">
      <div class="vx-systems-section-head"><div><div class="vx-systems-eyebrow">Swing Trading</div><h2>One multi-session Vixale Swing System.</h2><p>Swing Trading stays as one product category rather than being split into Daily and Weekly systems.</p></div></div>
      <article class="vx-system-card swing featured"><div class="vx-system-body"><div class="vx-system-meta"><span class="vx-system-type">Multi-session portfolio</span><span class="vx-system-status">Active portfolio</span></div><h3>Vixale Swing System</h3><p>A systematic portfolio reviewed each trading morning. New qualifying symbols may be added, while holdings that no longer meet the selection criteria may be removed through the published portfolio update.</p><a class="vx-system-link" href="/swing-leaders">View Swing Leaders →</a></div><div class="vx-swing-rule-pills"><div class="vx-swing-pill"><strong>Target framework</strong><span>+10% from actual entry</span></div><div class="vx-swing-pill"><strong>Defined risk</strong><span>5% stop, daily-close evaluation</span></div><div class="vx-swing-pill"><strong>Review window</strong><span>9:45–10:00 AM ET</span></div><div class="vx-swing-pill"><strong>Workflow</strong><span>Full rules in Trading Guide</span></div></div></article>
    </section>

    <section class="vx-systems-section" id="compare">
      <div class="vx-systems-section-head"><div><div class="vx-systems-eyebrow">Compare</div><h2>Systems at a glance.</h2><p>Use this as the product-level comparison. The Trading Guide contains the detailed step-by-step execution workflows.</p></div></div>
      <div class="vx-compare-card"><div class="vx-compare-scroll"><table class="vx-compare"><thead><tr><th>System</th><th>Horizon</th><th>Entry style</th><th>Management</th><th>Where to watch</th></tr></thead><tbody>
        <tr><td>Prime</td><td>Day Trading</td><td>Market after confirmation</td><td>Published target / stop-reference workflow</td><td>Live Dashboard</td></tr>
        <tr><td>Edge</td><td>Day Trading</td><td>Selected pullback limit</td><td>Working order → fill → published management</td><td>Live Dashboard</td></tr>
        <tr><td>Options Straddles</td><td>Day Trading · Options</td><td>Published options structure</td><td>Follow published target and lifecycle updates</td><td>Options Desk / Telegram</td></tr>
        <tr><td>Swing System</td><td>Multi-session</td><td>Portfolio addition update</td><td>Defined target/risk framework with daily review</td><td>Swing Leaders</td></tr>
      </tbody></table></div></div>
    </section>

    <section class="vx-systems-section" id="market-coverage">
      <div class="vx-systems-section-head"><div><div class="vx-systems-eyebrow">Market Coverage</div><h2>Stocks, futures, and options stay clearly separated.</h2><p>Different markets use different workflows. Vixale does not force futures or options into the stock-system model.</p></div></div>
      <div class="vx-market-grid">
        <article class="vx-market-card" id="stocks"><div class="vx-market-top"><span class="vx-system-type">Stocks</span><span class="vx-market-badge">2 Live Systems</span></div><h3>Prime + Edge</h3><p>Two intraday execution styles tracked through the same live dashboard: confirmation-first Prime and pullback-oriented Edge.</p><a class="vx-market-link" href="/dashboard">Open Live Dashboard →</a></article>
        <article class="vx-market-card" id="futures"><div class="vx-market-top"><span class="vx-system-type">Futures</span><span class="vx-market-badge dev">In Development</span></div><h3>Vixale Futures</h3><p>A separate contract-aware framework for futures markets, including their distinct execution, session, margin, and risk requirements.</p><span class="vx-market-link">Development roadmap</span></article>
        <article class="vx-market-card" id="options"><div class="vx-market-top"><span class="vx-system-type">Options</span><span class="vx-market-badge">Live Desk</span></div><h3>Options Desk</h3><p>Human-directed options ideas are documented through a structured journal with position structure, lifecycle updates, recorded results, and selected proof.</p><a class="vx-market-link" href="/options">View Options Desk →</a></article>
      </div>
    </section>

    <section class="vx-performance-cta"><div><div class="vx-systems-eyebrow">Verified Performance</div><h2>See the results before you choose a system.</h2><p>Review the realized Equity Curve and Closed Trades archive, then use the read-only dashboard to watch how Vixale operates live.</p></div><div class="vx-performance-actions"><a class="vx-systems-btn primary" href="/pricing">View Verified Performance</a><a class="vx-systems-btn" href="/closed-trades">Closed Trades Archive</a><a class="vx-systems-btn" href="/#password-access">Request 7-Day Access</a></div></section>

    <section class="vx-guide-strip"><div><strong>Need the exact execution workflow?</strong><span>Signal → broker → target → stop-reference instructions belong in the Trading Guide, not in the product directory.</span></div><a href="/trading-guide">Open Trading Guide →</a></section>

    <section class="vx-research-risk"><div class="vx-note-card"><strong>Research &amp; transparency</strong>Automated systems are evaluated with tuning, optimization, walk-forward, out-of-sample, and live-forward tracking. Human-directed options are documented through their journal and trade lifecycle.</div><div class="vx-note-card"><strong>Risk disclosure</strong>Vixale provides software, alerts, dashboards, research tools, and educational information. Trading stocks, futures, and options involves risk, and past results do not guarantee future performance.</div></section>
  </div></section>`;
}

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", () => `${styles}\n</head>`) : `${styles}${html}`;
}

function refineTradingSystemsProductPage(html, path) {
  if (typeof html !== "string" || path !== SYSTEMS_PATH) return html;
  let result = normalizeSystemsNav(html);
  if (!result.includes(PAGE_MARKER)) result = replaceMainContents(result, renderSystemsPage());
  result = injectStyles(result);
  result = updateTitle(result);
  result = updateCanonical(result);
  return result;
}

function installTradingSystemsProductRefinement(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || path !== SYSTEMS_PATH) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithTradingSystemsProductRefinement(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineTradingSystemsProductPage(body, path);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleTradingSystemsProductWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installTradingSystemsProductRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleTradingSystemsProductWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleTradingSystemsProductModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SYSTEMS_PATH,
  STYLE_ID,
  PAGE_MARKER,
  TELEGRAM_URL,
  replaceMainContents,
  normalizeSystemsNav,
  renderSystemsPage,
  refineTradingSystemsProductPage,
  installTradingSystemsProductRefinement,
  wrapExpress,
};
