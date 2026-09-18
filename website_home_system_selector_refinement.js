"use strict";

const Module = require("module");

const HOME_PATH = "/";
const STYLE_ID = "vx-home-system-selector-style";
const SCRIPT_ID = "vx-home-system-selector-script";
const TOP_MARKER = 'class="vx-home-top-systems"';
const PREVIEW_MARKER = 'class="vx-home-proof-preview"';
const DAY_SECTION_CLASS = "vx-home-day-trading";
const DAY_ANCHOR_ID = "live-day-trading";
const DAY_TRADING_PATH = "/trading-systems/day-trading";
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

function renderHowItWorks() {
  return `<section class="vx-home-how" aria-labelledby="vx-home-how-title">
    <div class="vx-home-section-kicker">How It Works</div>
    <h2 id="vx-home-how-title">Understand Vixale before you request anything.</h2>
    <p class="vx-home-section-lead">Vixale provides trading-system research, signals and data visibility, plus separate software and setup services. You can inspect what is public first and decide whether read-only viewer access or another service is useful.</p>
    <ol class="vx-home-how-steps">
      <li><b>1</b><div><strong>Explore systems</strong><span>Start with Day Trading, Swing Trading, or Options based on how you want to follow the market.</span></div></li>
      <li><b>2</b><div><strong>Review available evidence</strong><span>Use the public results and system pages to understand what is visible for that category.</span></div></li>
      <li><b>3</b><div><strong>Request viewer access if useful</strong><span>Viewer access is read-only. Setup, automation, and custom development are separate services.</span></div></li>
    </ol>
    <div class="vx-home-how-boundary">Vixale does not trade or manage customer brokerage accounts. <a href="/services">Explore separate services →</a></div>
  </section>`;
}

function renderSystemSelector() {
  return `<section class="vx-home-compare" aria-labelledby="vx-home-compare-title">
    <div class="vx-home-section-kicker">Compare Trading Systems</div>
    <h2 id="vx-home-compare-title">Choose the category before you choose a strategy.</h2>
    <p class="vx-home-section-lead">The three categories differ in holding horizon, how you follow them, and what evidence is available. Internal strategy names come later on the system pages.</p>
    <nav class="vx-home-system-stack" aria-label="Compare Vixale trading systems">
      <a class="vx-home-system-card" href="${DAY_TRADING_PATH}">
        <span>Day Trading</span><strong>Intraday activity</strong>
        <div class="vx-home-system-fact"><b>Holding horizon</b><p>Usually intraday; some Day Trading positions can remain open overnight.</p></div>
        <div class="vx-home-system-fact"><b>How often to check</b><p>During the market session when you want current status.</p></div>
        <div class="vx-home-system-fact"><b>Public evidence</b><p>Day Trading status plus realized closed-trade results.</p></div>
        <div class="vx-home-system-fact"><b>Viewer access</b><p>Adds read-only dashboard detail after approval.</p></div>
        <em>Learn about Day Trading →</em>
      </a>
      <a class="vx-home-system-card" href="${SWING_TRADING_PATH}">
        <span>Swing Trading</span><strong>Multi-session positions</strong>
        <div class="vx-home-system-fact"><b>Holding horizon</b><p>Positions can remain active across multiple sessions.</p></div>
        <div class="vx-home-system-fact"><b>How often to check</b><p>Review the public portfolio and its daily updates.</p></div>
        <div class="vx-home-system-fact"><b>Public evidence</b><p>Public research/model portfolio and swing equity history.</p></div>
        <div class="vx-home-system-fact"><b>Viewer access</b><p>The public Swing portfolio remains viewable without login.</p></div>
        <em>Learn about Swing Trading →</em>
      </a>
      <a class="vx-home-system-card" href="${OPTIONS_PATH}">
        <span>Options</span><strong>Journal-based tracking</strong>
        <div class="vx-home-system-fact"><b>Holding horizon</b><p>Varies by the individual options trade.</p></div>
        <div class="vx-home-system-fact"><b>How often to check</b><p>Follow updates when Option Journal records are available.</p></div>
        <div class="vx-home-system-fact"><b>Public evidence</b><p>A public explanation of the owner-entered Option Journal.</p></div>
        <div class="vx-home-system-fact"><b>Viewer access</b><p>Adds protected journal detail and available owner-provided screenshots.</p></div>
        <em>Learn about Options →</em>
      </a>
    </nav>
  </section>`;
}

function renderHeroPreview() {
  return `<aside class="vx-home-proof-preview" aria-label="Day Trading evidence preview">
    <div class="vx-home-proof-preview-head"><div><span>Day Trading evidence</span><h2>Current Day Trading snapshot</h2></div><a href="#${DAY_ANCHOR_ID}">View Day Trading results ↓</a></div>
    <p class="vx-home-proof-preview-copy">This preview mirrors the Day Trading data block below, including its freshness state. If the source is unavailable, values remain unavailable rather than being simulated.</p>
    <div class="vx-home-proof-grid">
      <div><span>Open Positions</span><strong data-vx-mirror="vx-home-live-0">—</strong></div>
      <div><span>Pending Setups</span><strong data-vx-mirror="vx-home-live-1">—</strong></div>
      <div><span>Closed P&amp;L Today</span><strong data-vx-mirror="vx-home-live-3">—</strong></div>
      <div><span>Total Realized P&amp;L</span><strong data-vx-mirror="vx-home-equity-total">—</strong></div>
    </div>
    <div class="vx-home-proof-meta"><span data-vx-mirror-text="vx-home-day-badge">Checking data status…</span><span data-vx-mirror-text="vx-home-day-updated">Last updated: checking…</span></div>
  </aside>`;
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
  const top = `<section class="vx-home-top-systems"><div class="wrap">${heroHtml}${renderHowItWorks()}${renderSystemSelector()}${renderHeroPreview()}</div></section>`;
  return html.slice(0, heroRange.start) + top + html.slice(heroRange.end);
}

const styles = `
<style id="${STYLE_ID}">
  .vx-home-top-systems{padding:34px 0 42px;background:linear-gradient(180deg,#f3faf6 0%,#fff 78%);border-bottom:1px solid #e3e9e5}
  .vx-home-top-systems>.wrap{max-width:1180px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-home-top-systems .vx-home-hero{margin:0 auto;padding:22px 0 42px;border:0;background:transparent;box-shadow:none}
  .vx-home-top-systems .vx-home-hero .wrap{max-width:none;margin:0;padding:0}
  .vx-home-top-systems .vx-home-hero-copy{max-width:900px;margin:0 auto;padding:0;text-align:center}
  .vx-home-top-systems .vx-home-hero h1{max-width:900px;margin:14px auto 0;font-size:clamp(48px,4.8vw,58px);font-weight:500;line-height:1.02;letter-spacing:-.045em;white-space:normal!important;text-wrap:balance}
  .vx-home-top-systems .vx-home-hero-lead{max-width:760px;margin:17px auto 0;color:#56645e;font-size:16.5px;line-height:1.62}
  .vx-home-top-systems .vx-home-hero-actions{justify-content:center;margin-top:23px}
  .vx-home-top-systems .vx-home-hero-proof{margin:14px auto 0;color:#5f6d67;font-size:13px}
  .vx-home-section-kicker{color:#287153;font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
  .vx-home-how,.vx-home-compare{padding:38px 0;border-top:1px solid #e0e9e4}
  .vx-home-how h2,.vx-home-compare h2{max-width:800px;margin:10px 0 0;color:#17211d;font-size:clamp(30px,3.4vw,42px);font-weight:540;line-height:1.08;letter-spacing:-.035em}
  .vx-home-section-lead{max-width:850px;margin:13px 0 0;color:#56645e;font-size:15.5px;line-height:1.62}
  .vx-home-how-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin:27px 0 0;padding:0;list-style:none}
  .vx-home-how-steps li{display:grid;grid-template-columns:34px 1fr;gap:12px;padding-top:15px;border-top:2px solid #d8e5de}
  .vx-home-how-steps li>b{display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:50%;background:#eef8f3;color:#176442;font-size:12px}
  .vx-home-how-steps strong{display:block;color:#17211d;font-size:15px;font-weight:650}.vx-home-how-steps span{display:block;margin-top:5px;color:#5f6d67;font-size:13.5px;line-height:1.52}
  .vx-home-how-boundary{margin-top:22px;color:#4f5e57;font-size:13.5px;line-height:1.55}.vx-home-how-boundary a{color:#176442;font-weight:700;text-decoration:none}.vx-home-how-boundary a:hover{text-decoration:underline;text-underline-offset:3px}
  .vx-home-system-stack{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:25px;min-width:0}
  .vx-home-top-systems .vx-home-system-card{display:flex;min-width:0;flex-direction:column;padding:22px;border:1px solid #dce7e1;border-radius:20px;background:#fff;color:#17211d;text-decoration:none;box-sizing:border-box;transition:border-color .16s ease,transform .16s ease}
  .vx-home-top-systems .vx-home-system-card>span{color:#287153;font-size:12px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}
  .vx-home-top-systems .vx-home-system-card>strong{margin-top:8px;font-size:23px;font-weight:560;letter-spacing:-.025em}
  .vx-home-system-fact{padding:13px 0;border-top:1px solid #edf2ef}.vx-home-system-fact:first-of-type{margin-top:17px}
  .vx-home-system-fact b{display:block;color:#425049;font-size:12px;font-weight:700}.vx-home-system-fact p{margin:5px 0 0;color:#5f6d67;font-size:13.5px;line-height:1.48}
  .vx-home-top-systems .vx-home-system-card>em{margin-top:auto;padding-top:15px;color:#176442;font-size:13px;font-style:normal;font-weight:700}
  .vx-home-top-systems .vx-home-system-card:hover{transform:translateY(-1px);border-color:#bdd7ca}
  .vx-home-proof-preview{display:flex;min-width:0;flex-direction:column;margin-top:8px;padding:30px;border:1px solid #245d47;border-radius:26px;background:linear-gradient(145deg,#11372a 0%,#174d39 100%);color:#f5fbf8;box-shadow:0 18px 48px rgba(17,55,42,.13);box-sizing:border-box}
  .vx-home-proof-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.vx-home-proof-preview-head span{color:#a9d9c1;font-size:11.5px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.vx-home-proof-preview-head h2{margin:7px 0 0;color:#fff;font-size:28px;font-weight:560;letter-spacing:-.025em}.vx-home-proof-preview-head a{color:#d9f1e5;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}.vx-home-proof-preview-copy{max-width:760px;margin:14px 0 0;color:#c4d8ce;font-size:13.5px;line-height:1.58}
  .vx-home-proof-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:22px}.vx-home-proof-grid>div{min-width:0;padding:16px;border:1px solid rgba(255,255,255,.13);border-radius:17px;background:rgba(255,255,255,.055)}.vx-home-proof-grid span{display:block;color:#bfd3c9;font-size:11.5px;line-height:1.35}.vx-home-proof-grid strong{display:block;margin-top:8px;color:#fff;font-size:22px;font-weight:560;letter-spacing:-.025em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.vx-home-proof-grid strong.positive{color:#83e9b3}.vx-home-proof-grid strong.negative{color:#ffaaa7}
  .vx-home-proof-meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:18px;color:#bed3c8;font-size:11.5px;line-height:1.45;font-variant-numeric:tabular-nums}
  #${DAY_ANCHOR_ID}{scroll-margin-top:92px}
  @media(max-width:900px){.vx-home-how-steps{grid-template-columns:1fr}.vx-home-system-stack{grid-template-columns:1fr}.vx-home-proof-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-home-top-systems .vx-home-hero h1{font-size:clamp(42px,7vw,54px)}}
  @media(max-width:700px){.vx-home-top-systems{padding:22px 0 30px}.vx-home-top-systems>.wrap{padding:0 16px}.vx-home-top-systems .vx-home-hero{padding:18px 0 32px}.vx-home-top-systems .vx-home-hero h1{font-size:clamp(34px,10vw,40px);line-height:1.05}.vx-home-top-systems .vx-home-hero-lead{font-size:15.5px}.vx-home-top-systems .vx-home-hero-actions{margin-top:20px}.vx-home-how,.vx-home-compare{padding:31px 0}.vx-home-how h2,.vx-home-compare h2{font-size:clamp(28px,8vw,36px)}.vx-home-proof-preview{padding:23px 18px;border-radius:22px}.vx-home-proof-preview-head{flex-direction:column}.vx-home-proof-preview-head a{white-space:normal}.vx-home-system-fact p,.vx-home-how-steps span{font-size:13.5px}}
  @media(max-width:420px){.vx-home-proof-grid{grid-template-columns:1fr}.vx-home-proof-grid strong{font-size:21px}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const valueTargets = Array.from(document.querySelectorAll('[data-vx-mirror]'));
  const textTargets = Array.from(document.querySelectorAll('[data-vx-mirror-text]'));
  if (!valueTargets.length && !textTargets.length) return;
  const syncValue = target => {
    const source = document.getElementById(target.getAttribute('data-vx-mirror'));
    if (!source) return;
    target.textContent = source.textContent || '—';
    const text = String(target.textContent || '').trim();
    target.classList.toggle('positive', source.classList.contains('positive') || text.startsWith('+$'));
    target.classList.toggle('negative', source.classList.contains('negative') || text.startsWith('-$'));
  };
  const syncText = target => {
    const source = document.getElementById(target.getAttribute('data-vx-mirror-text'));
    if (!source) return;
    target.textContent = source.textContent || target.textContent;
  };
  const sync = () => { valueTargets.forEach(syncValue); textTargets.forEach(syncText); };
  const observer = new MutationObserver(sync);
  const sources = new Set();
  [...valueTargets, ...textTargets].forEach(target => {
    const id = target.getAttribute('data-vx-mirror') || target.getAttribute('data-vx-mirror-text');
    const source = document.getElementById(id);
    if (source) sources.add(source);
  });
  sources.forEach(source => observer.observe(source, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] }));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
  else sync();
  window.setInterval(sync, 5000);
})();
</script>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function injectScript(html) {
  if (html.includes(`id="${SCRIPT_ID}"`)) return html;
  return html.includes("</body>") ? html.replace("</body>", () => `${script}\n</body>`) : `${html}${script}`;
}

function refineHomeSystemSelector(html, path) {
  if (typeof html !== "string" || path !== HOME_PATH) return html;
  let result = removeLowerSystemCards(html);
  result = ensureDayAnchor(result);
  result = composeTopBlock(result);
  if (result.includes(TOP_MARKER)) {
    result = injectStyles(result);
    result = injectScript(result);
  }
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
  SCRIPT_ID,
  TOP_MARKER,
  PREVIEW_MARKER,
  DAY_SECTION_CLASS,
  DAY_ANCHOR_ID,
  DAY_TRADING_PATH,
  SWING_TRADING_PATH,
  OPTIONS_PATH,
  findTagRangeFromOpen,
  findTagByClass,
  renderHowItWorks,
  renderSystemSelector,
  renderHeroPreview,
  removeLowerSystemCards,
  ensureDayAnchor,
  composeTopBlock,
  injectStyles,
  injectScript,
  refineHomeSystemSelector,
  installHomeSystemSelectorRefinement,
  wrapExpress,
};
