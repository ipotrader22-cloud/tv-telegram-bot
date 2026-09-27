"use strict";

const Module = require("module");
const offer = require("./lib/website-commercial-offer");
const { TRANSLATION_MAP } = require("./website_russian_localization");

const PREVIEW_FLAG = "VIXALE_WORK_REDESIGN_PREVIEW";
const STYLE_ID = "vx-work-redesign-preview-style";
const HOME_PATH = "/";
const SUPPORTED_PATHS = new Set([
  "/",
  "/trading-systems",
  "/trading-systems/day-trading",
  "/trading-systems/swing-trading",
  "/trading-systems/options",
  "/results",
  "/pricing",
  "/services",
  "/about",
  "/access",
  "/trading-guide",
  "/closed-trades",
  "/risk-management",
]);

const WORK_TRANSLATIONS = new Map([
  ["Day Trading", "Дейтрейдинг"],
  ["Swing Trading", "Свинг-трейдинг"],
  ["Options", "Опционы"],
  ["Results", "Результаты"],
  ["Pricing", "Тарифы"],
  ["Log In", "Войти"],
  ["Get 30 Days Free", "30 дней бесплатно"],
  ["Trading signals you can follow. Results you can inspect.", "Торговые сигналы, за которыми можно следить. Результаты, которые можно проверить."],
  ["View Trading Results", "Посмотреть результаты"],
  ["Choose the system that fits how you trade.", "Выберите систему под свой стиль торговли."],
  ["Follow the setup through the exit.", "Следите за сделкой от входа до выхода."],
  ["Give your portfolio a daily review.", "Проверяйте портфель каждый торговый день."],
  ["Keep track of the position as it develops.", "Следите за позицией по мере её развития."],
  ["Explore Day Trading", "Открыть Дейтрейдинг"],
  ["View Swing Portfolio", "Открыть Swing-портфель"],
  ["Explore Options", "Открыть Опционы"],
  ["An entry alert is only the beginning.", "Сигнал на вход — только начало."],
  ["Look beyond the winning trade.", "Смотрите шире одной прибыльной сделки."],
  ["Start with a clear view of the system.", "Начните с понятного обзора системы."],
  ["Choose one system. Or follow all three.", "Выберите одну систему или все три."],
  ["Built by a trader who also builds the software.", "Создано трейдером, который также разрабатывает программное обеспечение."],
  ["See how Vixale fits your trading routine.", "Посмотрите, как Vixale вписывается в ваш торговый процесс."],
]);
for (const [source, translated] of WORK_TRANSLATIONS) TRANSLATION_MAP.set(source, translated);

function enabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env[PREVIEW_FLAG] || ""));
}
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function tagRange(html, tag, start) {
  if (start < 0) return null;
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const re = new RegExp(`<\\/?${escapeRegex(tag)}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0, match;
  while ((match = re.exec(html))) {
    depth += new RegExp(`^<\\/${escapeRegex(tag)}\\b`, "i").test(match[0]) ? -1 : 1;
    if (depth === 0) return { start, end: re.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
  }
  return null;
}
function rangeByClass(html, tag, className, from = 0) {
  const re = new RegExp(`<${escapeRegex(tag)}\\b[^>]*class=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "gi");
  re.lastIndex = from;
  const match = re.exec(String(html || ""));
  return match ? tagRange(html, tag, match.index) : null;
}
function replaceRange(html, range, replacement) {
  return range ? html.slice(0, range.start) + replacement + html.slice(range.end) : html;
}
function replaceInner(html, range, inner) {
  return range ? html.slice(0, range.openEnd) + inner + html.slice(range.closeStart) : html;
}
function setTitle(html, title) {
  return /<title>[\s\S]*?<\/title>/i.test(html) ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`) : html;
}
function markPreview(html) {
  if (/data-vx-work-preview=/i.test(html)) return html;
  return html.replace(/<body\b([^>]*)>/i, '<body$1 data-vx-work-preview="true">');
}

function renderPrimaryNav(path) {
  const links = [
    [offer.SYSTEMS[0].path, "Day Trading"],
    [offer.SYSTEMS[1].path, "Swing Trading"],
    [offer.SYSTEMS[2].path, "Options"],
    ["/results", "Results"],
    ["/pricing", "Pricing"],
  ];
  const html = links.map(([href, label]) => `<a href="${href}"${path === href ? ' aria-current="page" class="is-active"' : ""}>${label}</a>`).join("");
  return `<div class="vx-unified-public-nav" aria-label="Primary navigation">${html}</div><div class="vx-direct-nav-actions"><a class="vx-public-nav-login" href="/dashboard">Log In</a><a class="vx-public-nav-cta" href="${offer.DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a></div>`;
}
function refineNavigation(html, path) {
  const navLinks = rangeByClass(html, "div", "nav-links") || rangeByClass(html, "div", "navlinks");
  if (navLinks) html = replaceInner(html, navLinks, renderPrimaryNav(path));
  const secondary = rangeByClass(html, "nav", "vx-public-secondary-nav");
  if (secondary) {
    html = replaceInner(html, secondary,
      '<a href="/about">About</a><a href="/services">Services</a><a href="/trading-guide">Trading Guide</a><a href="/access">Help / Access</a>');
  }
  return html;
}

function dayPreview() {
  return `<section id="vx-preview-day" class="vx-conversion-preview-panel is-active" role="tabpanel" aria-labelledby="vx-preview-tab-day" data-vx-preview-panel="day">
    <div class="vx-work-panel-head"><div><span>DAY TRADING · CURRENT ACTIVITY</span><strong>Follow the system while it works.</strong></div><a href="${offer.SYSTEMS[0].path}">Explore Day Trading →</a></div>
    <div class="vx-conversion-metrics">
      <div><span>Open Positions</span><strong data-vx-mirror="vx-home-live-0">—</strong></div>
      <div><span>Open P&amp;L</span><strong data-vx-mirror="vx-home-live-open-pnl">—</strong></div>
      <div><span>Closed P&amp;L Today</span><strong data-vx-mirror="vx-home-live-3">—</strong></div>
      <div><span>Total Realized P&amp;L</span><strong data-vx-mirror="vx-home-equity-total">—</strong></div>
    </div>
    <div class="vx-conversion-chart" id="vx-conversion-day-chart"><div class="vx-conversion-chart-loading">Loading recorded Day Trading results…</div></div>
    <div class="vx-conversion-status"><span data-vx-mirror-text="vx-home-day-badge">Checking market/session state…</span><span data-vx-mirror-text="vx-home-day-updated">Last updated: checking…</span></div>
  </section>`;
}
function swingPreview() {
  return `<section id="vx-preview-swing" class="vx-conversion-preview-panel" role="tabpanel" aria-labelledby="vx-preview-tab-swing" data-vx-preview-panel="swing" hidden>
    <div class="vx-work-panel-head"><div><span>SWING TRADING · DAILY REVIEW</span><strong>Review the latest published portfolio.</strong></div><a href="${offer.SYSTEMS[1].path}#active-portfolio">View Swing Portfolio →</a></div>
    <div class="vx-conversion-swing-state" data-vx-swing-state><div class="vx-conversion-skeleton-row" aria-hidden="true"><i></i><i></i><i></i></div><p>Loading the latest published portfolio update…</p></div>
  </section>`;
}
function optionsPreview() {
  return `<section id="vx-preview-options" class="vx-conversion-preview-panel" role="tabpanel" aria-labelledby="vx-preview-tab-options" data-vx-preview-panel="options" hidden>
    <div class="vx-work-panel-head"><div><span>OPTIONS · PUBLISHED UPDATES</span><strong>Keep the position in context.</strong></div><a href="${offer.SYSTEMS[2].path}">Explore Options →</a></div>
    <div class="vx-conversion-protected-state"><span>Latest permitted update</span><h3>Position details and supporting records require viewer access.</h3><p>Options updates are published on the website. Protected position history and available brokerage records keep their existing access rules.</p><div><a href="${offer.SYSTEMS[2].path}">Explore Options</a><a href="/access?system=options">Request Viewer Access</a></div></div>
  </section>`;
}

function renderHomeTop() {
  return `<section class="vx-conversion-home vx-work-home"><div class="vx-work-wrap">
    <div class="vx-work-hero-grid">
      <div class="vx-work-hero-copy"><div class="vx-work-eyebrow">DAY TRADING · SWING PORTFOLIO · OPTIONS</div><h1>Trading signals you can follow. Results you can inspect.</h1><p>Follow live Day Trading activity, review a stock portfolio updated each trading morning, and track Options positions. Explore the records, choose your system, and stay in control of your own trades.</p><div class="vx-work-actions"><a class="vx-work-btn primary" href="${offer.DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a><a class="vx-work-text-link" href="/results">View Trading Results →</a></div><div class="vx-work-microcopy">30 days of Day Trading signals through Telegram. Swing and Options updates are available on the website.</div></div>
      <div class="vx-conversion-product-preview vx-work-product-preview"><div class="vx-conversion-tabs" role="tablist" aria-label="Trading system preview"><button id="vx-preview-tab-day" type="button" role="tab" aria-selected="true" aria-controls="vx-preview-day" tabindex="0" data-vx-preview-tab="day">Day Trading</button><button id="vx-preview-tab-swing" type="button" role="tab" aria-selected="false" aria-controls="vx-preview-swing" tabindex="-1" data-vx-preview-tab="swing">Swing Trading</button><button id="vx-preview-tab-options" type="button" role="tab" aria-selected="false" aria-controls="vx-preview-options" tabindex="-1" data-vx-preview-tab="options">Options</button></div><div class="vx-conversion-preview-stage">${dayPreview()}${swingPreview()}${optionsPreview()}</div></div>
    </div>

    <section class="vx-work-section vx-work-systems" aria-labelledby="vx-work-systems-title"><div class="vx-work-section-head"><span>SYSTEM SELECTION</span><h2 id="vx-work-systems-title">Choose the system that fits how you trade.</h2><p>Follow intraday activity, review a daily stock portfolio, or explore the Options system. Each has its own workflow and results.</p></div><div class="vx-work-three">
      <article><span>DAY TRADING</span><h3>Follow the setup through the exit.</h3><p>Watch entries, targets, stop references, and live P&amp;L on your screen. Receive Day Trading signals in Telegram. The system includes two strategies: one closes positions at the end of the trading day; the other may hold overnight.</p><a href="${offer.SYSTEMS[0].path}">Explore Day Trading →</a></article>
      <article><span>SWING TRADING</span><h3>Give your portfolio a daily review.</h3><p>Follow a stock portfolio built around Vixale's ranking system. Review additions, current positions, ranking changes, and published exits each trading morning.</p><a href="${offer.SYSTEMS[1].path}#active-portfolio">View Swing Portfolio →</a></article>
      <article><span>OPTIONS</span><h3>Keep track of the position as it develops.</h3><p>Review new positions, daily website updates, and completed trades. Explore the recorded history and supporting brokerage documents where available.</p><a href="${offer.SYSTEMS[2].path}">Explore Options →</a></article>
    </div></section>

    <section class="vx-work-section vx-work-telegram"><div class="vx-work-section-head"><span>DAY TRADING TELEGRAM</span><h2>An entry alert is only the beginning.</h2><p>A trade idea leaves important questions unanswered. What are the reference levels? What changed after the entry? How did the trade finish? Vixale brings system activity, published updates, and recorded outcomes into a workflow you can follow.</p><a class="vx-work-btn primary" href="${offer.DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a></div><div class="vx-work-signal-example"><div class="vx-work-example-label">Format example · not a historical trade</div><pre>🟢 Vixale Prime opened LONG\n[TICKER]\n📍 Entry: [entry]\n🎯 Target: [target]\n🛑 Stop Ref: [stop]</pre><p>No fictional ticker, price, or result is shown. Replace this with a genuine redacted historical sequence when one is approved.</p></div></section>

    <section class="vx-work-section" aria-labelledby="vx-work-results-title"><div class="vx-work-section-head"><span>RESULTS</span><h2 id="vx-work-results-title">Look beyond the winning trade.</h2><p>Explore recorded outcomes across Day Trading, Swing Trading, and Options. Review the reporting period, losing trades, and the context behind the numbers before deciding whether a system fits your approach.</p></div><div class="vx-work-three vx-work-results-cards">
      <article><span>DAY TRADING</span><h3>Review closed trades.</h3><p>Explore the recorded trade history and realized results for the selected period.</p><a href="/results#day-trading">View Day Trading Results →</a></article>
      <article><span>SWING TRADING</span><h3>Explore portfolio history.</h3><p>Review the model portfolio's recorded positions and performance over time.</p><a href="/results#swing-trading">View Swing Results →</a></article>
      <article><span>OPTIONS</span><h3>Inspect positions and records.</h3><p>Review completed positions and supporting brokerage documents where available. Detailed records require viewer access.</p><a href="/results#options">View Options Results →</a></article>
    </div><p class="vx-work-local-note">Past performance does not guarantee future results. Model results and actual brokerage results can differ.</p></section>

    <section class="vx-work-section vx-work-start" aria-labelledby="vx-work-start-title"><div class="vx-work-section-head"><span>GETTING STARTED</span><h2 id="vx-work-start-title">Start with a clear view of the system.</h2></div><ol><li><b>1</b><div><strong>Explore the activity.</strong><span>Open a system preview and examine its recorded results.</span></div></li><li><b>2</b><div><strong>Follow the workflow.</strong><span>Try Day Trading signals through Telegram, or choose the system that matches your interest.</span></div></li><li><b>3</b><div><strong>Make your own decisions.</strong><span>Review each update and manage any orders in your own brokerage account.</span></div></li></ol></section>

    <section class="vx-work-section" aria-labelledby="vx-work-pricing-title"><div class="vx-work-section-head"><span>PRICING</span><h2 id="vx-work-pricing-title">Choose one system. Or follow all three.</h2></div><div class="vx-work-pricing-grid"><article><span>SINGLE SYSTEM</span><h3>$${offer.SINGLE_SYSTEM_PRICE_MONTHLY}<small>/month</small></h3><p>Choose Day Trading, Swing Trading, or Options. Get access to your selected system's published signals or portfolio updates and its subscriber experience.</p><a class="vx-work-btn" href="/pricing">Choose Your System</a></article><article class="featured"><span>THREE-SYSTEM BUNDLE</span><h3>$${offer.THREE_SYSTEM_BUNDLE_PRICE_MONTHLY}<small>/month</small></h3><p>Get Day Trading, Swing Trading, and Options in one subscription. Save $${offer.BUNDLE_SAVINGS_MONTHLY}/month compared with three individual subscriptions.</p><a class="vx-work-btn primary" href="${offer.BUNDLE_REQUEST_URL}" target="_blank" rel="noopener noreferrer">Get the Bundle</a></article></div><div class="vx-work-trial-callout"><div><strong>Start with 30 days of free Day Trading signals.</strong><span>Receive Day Trading signals through Telegram and explore the service before choosing a paid plan.</span></div><a href="${offer.DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free →</a></div><p class="vx-work-local-note">Telegram signals are currently available for Day Trading. Swing Trading and Options updates are published on the website. Setup, integrations, and custom development are separate services.</p></section>

    <section class="vx-work-section vx-work-founder"><div><span>ABOUT VIXALE</span><h2>Built by a trader who also builds the software.</h2><p>Vixale is an independent, founder-operated project combining systematic trading research with software development. Its focus is practical: make system activity visible and give you records you can examine for yourself.</p><a href="/about">Meet the Founder →</a><a class="secondary" href="/services">Explore Research and Development Services →</a></div></section>

    <section class="vx-work-section vx-work-faq" aria-labelledby="vx-work-faq-title"><div class="vx-work-section-head"><span>FAQ</span><h2 id="vx-work-faq-title">Questions before you start.</h2></div><div class="vx-work-faq-grid">
      <details><summary>What does Vixale provide?</summary><p>Vixale offers Day Trading signals, a Swing Trading model portfolio, and Options position updates, with tools for reviewing system activity and results. You make your own trading decisions and manage any orders in your brokerage account.</p></details>
      <details><summary>What is included in the free trial?</summary><p>The free trial covers 30 days of Day Trading signals through Telegram. It does not include a trial of every service. Dashboard viewer access has a separate request process.</p></details>
      <details><summary>How do I receive updates?</summary><p>Day Trading signals are delivered through Telegram, with activity available on the website. Swing Trading and Options updates are published on the website.</p></details>
      <details><summary>How much does a subscription cost?</summary><p>A Single System subscription costs $${offer.SINGLE_SYSTEM_PRICE_MONTHLY}/month. The Three-System Bundle costs $${offer.THREE_SYSTEM_BUNDLE_PRICE_MONTHLY}/month. Custom research, setup, and development are separate.</p></details>
      <details><summary>Where can I check the results?</summary><p>Open Results and select a system. Review its reporting period, result type, and trade or portfolio history. Some detailed records and brokerage documents require viewer access.</p></details>
      <details><summary>Does Vixale trade my account?</summary><p>No. Vixale does not trade or manage customer brokerage accounts. You remain responsible for your decisions, sizing, and execution.</p></details>
    </div></section>

    <section class="vx-work-final-cta"><div><span>START WITH DAY TRADING</span><h2>See how Vixale fits your trading routine.</h2><p>Start with 30 days of Day Trading signals in Telegram. Follow the activity, inspect the results, and decide what you want to use next.</p></div><div class="vx-work-actions"><a class="vx-work-btn primary" href="${offer.DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a><a class="vx-work-text-link" href="/pricing">Compare Plans →</a></div></section>
  </div></section>`;
}

function refineHome(html) {
  const currentTop = rangeByClass(html, "section", "vx-conversion-home") || rangeByClass(html, "section", "vx-home-top-systems") || rangeByClass(html, "section", "vx-home-hero");
  if (!currentTop) return html;
  return replaceRange(html, currentTop, renderHomeTop());
}

function renderSystemHero(kind) {
  const data = {
    day: {
      eyebrow: "DAY TRADING SIGNALS", title: "Follow the trade while it happens.",
      body: "Get Day Trading signals through Telegram and watch system activity on the Vixale dashboard. Review entries, targets, stop references, updates, and recorded outcomes in a clear trading workflow.",
      actions: `<a class="primary" href="${offer.DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a><a href="/results#day-trading">View Day Trading Results</a>`,
      support: `Day Trading subscription: $${offer.SINGLE_SYSTEM_PRICE_MONTHLY}/month. Also included in the $${offer.THREE_SYSTEM_BUNDLE_PRICE_MONTHLY}/month Three-System Bundle.`
    },
    options: {
      eyebrow: "OPTIONS SIGNALS AND POSITION UPDATES", title: "See more than the opening trade.",
      body: "Follow Vixale's Options positions through published openings, daily website updates, and closures. Review completed trades and supporting brokerage records where available before deciding how the service fits your approach.",
      actions: `<a class="primary" href="${offer.singleSystemRequestUrl("Options")}" target="_blank" rel="noopener noreferrer">Choose Options — $${offer.SINGLE_SYSTEM_PRICE_MONTHLY}/month</a><a href="/results#options">View Options Results</a>`,
      support: "Options updates are published on the website. The 30-day free Telegram trial applies to Day Trading."
    }
  }[kind];
  if (!data) return "";
  return `<section class="vx-conversion-system-hero vx-work-system-hero"><div><span>${data.eyebrow}</span><h1>${data.title}</h1><p>${data.body}</p><div class="vx-conversion-system-actions">${data.actions}</div><div class="vx-work-supporting-line">${data.support}</div></div></section>`;
}
function refineSystemPage(html, path) {
  if (path === offer.SYSTEMS[0].path || path === offer.SYSTEMS[2].path) {
    const hero = rangeByClass(html, "section", "vx-conversion-system-hero");
    if (hero) html = replaceRange(html, hero, renderSystemHero(path === offer.SYSTEMS[0].path ? "day" : "options"));
  }
  if (path === offer.SYSTEMS[1].path) {
    html = html.replace(/<h1>Follow a portfolio reviewed every day\.<\/h1>/i, "<h1>Follow a portfolio with a clear daily review.</h1>");
    html = html.replace(/A public research\/model portfolio built around Vixale's proprietary ranking system\. Review open positions, potential candidates, completed trades and model equity history from the latest published update\./i,
      "See how Vixale's stock portfolio changes each trading morning. Review current holdings, new additions, ranking changes, and published exits through the website.");
  }
  return html;
}

function refinePricing(html) {
  html = html.replace(/<h1>Choose one system or follow all three\.<\/h1>/i, "<h1>Choose one system. Or follow all three.</h1>");
  html = html.replace(/Request 30-Day Trial/g, "Get 30 Days Free");
  return html;
}
function refineAbout(html) {
  html = setTitle(html, "About Vixale | Trading Systems and Software");
  html = html.replace(/<h1>[^<]*<\/h1>/i, "<h1>You should be able to examine the system behind a trading idea.</h1>");
  return html;
}
function refineServices(html) {
  html = setTitle(html, "Trading Research and Custom Development | Vixale");
  html = html.replace(/<h1>[^<]*<\/h1>/i, "<h1>Turn your trading workflow into a clear build plan.</h1>");
  return html;
}
function refineResults(html) {
  html = html.replace(/<h1>[^<]*<\/h1>/i, "<h1>Examine the systems. Follow the record.</h1>");
  return html;
}
function refinePageCopy(html, path) {
  if (path === HOME_PATH) return refineHome(html);
  if (path === offer.SYSTEMS[0].path || path === offer.SYSTEMS[1].path || path === offer.SYSTEMS[2].path) return refineSystemPage(html, path);
  if (path === "/pricing") return refinePricing(html);
  if (path === "/about") return refineAbout(html);
  if (path === "/services") return refineServices(html);
  if (path === "/results") return refineResults(html);
  return html;
}

const styles = `<style id="${STYLE_ID}">
[data-vx-work-preview]{--vx-bg:#F7F8FA;--vx-ink:#101828;--vx-muted:#475467;--vx-line:#D8DEE7;--vx-panel:#101820;--vx-green:#087F5B;--vx-loss:#B42318;background:var(--vx-bg)!important;color:var(--vx-ink)!important;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important}
[data-vx-work-preview] main{background:var(--vx-bg)}
[data-vx-work-preview] .wrap,[data-vx-work-preview] .vx-work-wrap{max-width:1200px!important;margin:0 auto;padding-left:24px;padding-right:24px;box-sizing:border-box}
[data-vx-work-preview] .nav-links,[data-vx-work-preview] .navlinks{gap:22px!important}
[data-vx-work-preview] .vx-unified-public-nav{gap:22px!important}
[data-vx-work-preview] .vx-unified-public-nav a{color:#344054!important;font-size:14px!important;font-weight:600!important}
[data-vx-work-preview] .vx-unified-public-nav a.is-active{color:var(--vx-ink)!important;box-shadow:inset 0 -2px var(--vx-green)!important}
[data-vx-work-preview] .vx-public-nav-cta,[data-vx-work-preview] .vx-work-btn.primary{background:var(--vx-green)!important;border-color:var(--vx-green)!important;color:white!important;border-radius:10px!important;box-shadow:none!important}
[data-vx-work-preview] .vx-public-nav-login{color:var(--vx-ink)!important}
[data-vx-work-preview] .vx-conversion-home{padding:42px 0 74px!important;background:var(--vx-bg)!important;border-bottom:1px solid var(--vx-line)!important}
.vx-work-hero-grid{display:grid;grid-template-columns:minmax(0,40fr) minmax(0,60fr);gap:44px;align-items:center;min-width:0}.vx-work-hero-copy{padding:28px 0}.vx-work-eyebrow,.vx-work-section-head>span,.vx-work-three article>span,.vx-work-founder>div>span,.vx-work-final-cta>div>span{color:var(--vx-green);font-size:12px;font-weight:750;letter-spacing:.09em;text-transform:uppercase}.vx-work-hero-copy h1{max-width:540px;margin:12px 0 0;color:var(--vx-ink);font-size:clamp(56px,5vw,68px);font-weight:600;line-height:1.04;letter-spacing:-.045em;text-wrap:balance}.vx-work-hero-copy>p{max-width:530px;margin:20px 0 0;color:var(--vx-muted);font-size:18px;line-height:1.62}.vx-work-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:24px}.vx-work-btn{display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:0 19px;border:1px solid var(--vx-line);border-radius:10px;background:#fff;color:var(--vx-ink);font-size:14px;font-weight:700;text-decoration:none}.vx-work-text-link{color:var(--vx-green);font-size:14px;font-weight:750;text-decoration:none}.vx-work-microcopy{max-width:520px;margin-top:13px;color:#667085;font-size:12.5px;line-height:1.5}
[data-vx-work-preview] .vx-work-product-preview{border:1px solid #24343b!important;border-radius:16px!important;background:var(--vx-panel)!important;box-shadow:0 24px 60px rgba(16,24,32,.16)!important;color:#fff!important}.vx-work-product-preview .vx-conversion-tabs{border-bottom:1px solid rgba(255,255,255,.12)}.vx-work-product-preview .vx-conversion-tabs button{min-height:52px;background:transparent;color:#AAB7C0;font-size:13px}.vx-work-product-preview .vx-conversion-tabs button[aria-selected="true"]{background:rgba(255,255,255,.08);color:#fff;box-shadow:inset 0 -3px #37B37E}.vx-work-product-preview .vx-conversion-preview-panel{min-height:390px;padding:26px}.vx-work-panel-head{display:flex;justify-content:space-between;gap:16px}.vx-work-panel-head span{display:block;color:#8FD5B5;font-size:11px;font-weight:750;letter-spacing:.08em}.vx-work-panel-head strong{display:block;margin-top:6px;color:#fff;font-size:23px;font-weight:600}.vx-work-panel-head a{color:#D7E9E1;font-size:12px;font-weight:700;text-decoration:none}.vx-work-product-preview .vx-conversion-metrics>div{border-radius:12px}.vx-work-product-preview .vx-conversion-chart{border-radius:12px}
.vx-work-section{padding:96px 0;border-top:1px solid var(--vx-line)}.vx-work-section-head{max-width:780px}.vx-work-section-head h2,.vx-work-founder h2,.vx-work-final-cta h2{margin:10px 0 0;color:var(--vx-ink);font-size:clamp(36px,4vw,52px);font-weight:600;line-height:1.08;letter-spacing:-.035em;text-wrap:balance}.vx-work-section-head>p,.vx-work-founder p,.vx-work-final-cta p{margin:15px 0 0;color:var(--vx-muted);font-size:17px;line-height:1.65}.vx-work-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:34px}.vx-work-three article{display:flex;min-width:0;flex-direction:column;padding:0 0 22px;border-bottom:1px solid var(--vx-line);background:transparent}.vx-work-three h3{margin:10px 0 0;color:var(--vx-ink);font-size:25px;font-weight:600;line-height:1.18;letter-spacing:-.02em}.vx-work-three p{margin:12px 0 0;color:var(--vx-muted);font-size:14px;line-height:1.62}.vx-work-three a{margin-top:auto;padding-top:18px;color:var(--vx-green);font-size:13px;font-weight:750;text-decoration:none}
.vx-work-telegram{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.8fr);gap:56px;align-items:center}.vx-work-signal-example{padding:28px;border:1px solid #283740;border-radius:16px;background:var(--vx-panel);color:#fff}.vx-work-example-label{color:#8FD5B5;font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}.vx-work-signal-example pre{margin:18px 0 0;white-space:pre-wrap;font:600 14px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace}.vx-work-signal-example p{margin:14px 0 0;color:#B8C5CC;font-size:12px;line-height:1.55}.vx-work-local-note{margin:18px 0 0;color:#667085;font-size:12px;line-height:1.55}.vx-work-start ol{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;margin:30px 0 0;padding:0;list-style:none}.vx-work-start li{display:grid;grid-template-columns:38px 1fr;gap:12px;padding-top:18px;border-top:2px solid var(--vx-line)}.vx-work-start li>b{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:#E8F5EF;color:var(--vx-green);font-size:12px}.vx-work-start strong{display:block;color:var(--vx-ink);font-size:15px}.vx-work-start span{display:block;margin-top:5px;color:var(--vx-muted);font-size:13.5px;line-height:1.5}
.vx-work-pricing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:34px}.vx-work-pricing-grid article{padding:28px;border:1px solid var(--vx-line);border-radius:16px;background:#fff}.vx-work-pricing-grid article.featured{border-color:#9CCDB8;background:#F0F8F4}.vx-work-pricing-grid article>span{color:var(--vx-green);font-size:11px;font-weight:800;letter-spacing:.08em}.vx-work-pricing-grid h3{margin:9px 0 0;font-size:38px}.vx-work-pricing-grid h3 small{font-size:15px;color:#667085}.vx-work-pricing-grid p{color:var(--vx-muted);font-size:14px;line-height:1.6}.vx-work-pricing-grid .vx-work-btn{margin-top:10px}.vx-work-trial-callout{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:18px;padding:18px 20px;border:1px solid var(--vx-line);border-radius:14px;background:#fff}.vx-work-trial-callout strong,.vx-work-trial-callout span{display:block}.vx-work-trial-callout span{margin-top:4px;color:var(--vx-muted);font-size:13px}.vx-work-trial-callout a{color:var(--vx-green);font-weight:750;text-decoration:none;white-space:nowrap}
.vx-work-founder>div{max-width:780px}.vx-work-founder a{display:inline-block;margin-top:18px;color:var(--vx-green);font-weight:750;text-decoration:none}.vx-work-founder a.secondary{margin-left:24px}.vx-work-faq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 34px;margin-top:28px}.vx-work-faq details{padding:18px 0;border-top:1px solid var(--vx-line)}.vx-work-faq summary{cursor:pointer;color:var(--vx-ink);font-size:15px;font-weight:700}.vx-work-faq details p{margin:10px 0 0;color:var(--vx-muted);font-size:13.5px;line-height:1.58}.vx-work-final-cta{display:flex;justify-content:space-between;gap:38px;align-items:flex-end;margin-top:10px;padding:56px;border-radius:16px;background:var(--vx-panel);color:#fff}.vx-work-final-cta h2{color:#fff}.vx-work-final-cta p{max-width:680px;color:#C0CBD1}.vx-work-final-cta .vx-work-text-link{color:#9FE0C1}
[data-vx-work-preview] .vx-conversion-system-shell,[data-vx-work-preview] .vx-conversion-pricing{max-width:1200px!important;padding-top:64px!important}.vx-work-system-hero{padding-bottom:48px!important}.vx-work-system-hero h1{font-size:clamp(48px,5vw,64px)!important}.vx-work-system-hero p{font-size:17px!important}.vx-work-supporting-line{margin-top:14px;color:#667085;font-size:13px}.vx-work-system-hero .vx-conversion-system-actions a{border-radius:10px!important}
[data-vx-work-preview] .vx-conversion-working-screen,[data-vx-work-preview] .vx-home-equity-preview{border-radius:16px!important;background:var(--vx-panel)!important}
[data-vx-work-preview] .vx-price-card,[data-vx-work-preview] .vx-price-process,[data-vx-work-preview] .vx-price-separate{border-radius:16px!important}
[data-vx-work-preview] .positive{color:#087F5B!important}[data-vx-work-preview] .negative{color:var(--vx-loss)!important}
[data-vx-work-preview] :focus-visible{outline:3px solid #58B891!important;outline-offset:3px!important}
@media(max-width:900px){.vx-work-hero-grid,.vx-work-telegram{grid-template-columns:1fr}.vx-work-hero-copy h1{max-width:760px}.vx-work-three,.vx-work-start ol{grid-template-columns:1fr}.vx-work-pricing-grid{grid-template-columns:1fr}.vx-work-final-cta{align-items:flex-start;flex-direction:column}.vx-work-faq-grid{grid-template-columns:1fr}}
@media(max-width:700px){[data-vx-work-preview] .wrap,[data-vx-work-preview] .vx-work-wrap{padding-left:18px;padding-right:18px}.vx-work-hero-copy{padding:16px 0}.vx-work-hero-copy h1{font-size:clamp(36px,10.3vw,40px)}.vx-work-hero-copy>p{font-size:16px}.vx-work-actions{align-items:stretch;flex-direction:column}.vx-work-btn{width:100%;box-sizing:border-box}.vx-work-text-link{padding:8px 0}.vx-work-product-preview .vx-conversion-preview-panel{padding:18px;min-height:350px}.vx-work-panel-head{flex-direction:column}.vx-work-product-preview .vx-conversion-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-work-section{padding:56px 0}.vx-work-section-head h2,.vx-work-founder h2,.vx-work-final-cta h2{font-size:34px}.vx-work-telegram{gap:28px}.vx-work-signal-example{padding:20px}.vx-work-trial-callout{align-items:flex-start;flex-direction:column}.vx-work-founder a.secondary{margin-left:0;display:block}.vx-work-final-cta{padding:28px}.vx-work-final-cta .vx-work-actions{width:100%}.vx-work-faq-grid{gap:0}.vx-unified-public-nav{overflow-x:auto;flex-wrap:nowrap!important}.vx-unified-public-nav a{flex:0 0 auto}.vx-direct-nav-actions{gap:10px}.vx-public-nav-cta{padding:0 12px!important;font-size:12px!important}}
@media(prefers-reduced-motion:reduce){[data-vx-work-preview] *,[data-vx-work-preview] *::before,[data-vx-work-preview] *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>`;
function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}
function refineWorkPreview(html, path) {
  if (!enabled() || typeof html !== "string" || !SUPPORTED_PATHS.has(path)) return html;
  let out = markPreview(html);
  out = refineNavigation(out, path);
  out = refinePageCopy(out, path);
  out = injectStyles(out);
  if (path === "/") out = setTitle(out, "Vixale | Day Trading Signals, Swing Portfolio and Options");
  return out;
}

function installWorkRedesignPreview(app) {
  if (!enabled()) return;
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const path = String(req.path || req.url || "/").split("?")[0];
    if ((method !== "GET" && method !== "HEAD") || !SUPPORTED_PATHS.has(path)) return next();
    const send = res.send.bind(res);
    res.send = function sendWithWorkPreview(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html")) && res.statusCode < 400) body = refineWorkPreview(body, path);
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
  if (typeof factory !== "function" || factory.__vixaleWorkRedesignPreviewWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installWorkRedesignPreview(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleWorkRedesignPreviewWrapped", { value: true });
  return wrapped;
}
const originalLoad = Module._load;
Module._load = function vixaleWorkRedesignPreviewModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  PREVIEW_FLAG,
  STYLE_ID,
  SUPPORTED_PATHS,
  enabled,
  tagRange,
  rangeByClass,
  renderPrimaryNav,
  renderHomeTop,
  refineNavigation,
  refineHome,
  refineSystemPage,
  refinePricing,
  refineAbout,
  refineServices,
  refineResults,
  refinePageCopy,
  injectStyles,
  refineWorkPreview,
  installWorkRedesignPreview,
  wrapExpress,
};
