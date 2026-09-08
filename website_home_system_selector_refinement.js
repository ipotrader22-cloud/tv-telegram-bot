"use strict";

const Module = require("module");

const HOME_PATH = "/";
const STYLE_ID = "vx-home-system-selector-style";
const SCRIPT_ID = "vx-home-system-selector-script";
const TOP_MARKER = 'class="vx-home-top-systems"';
const PREVIEW_MARKER = 'class="vx-home-proof-preview"';
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
    <a class="vx-home-system-card" href="#${DAY_ANCHOR_ID}"><span>Intraday stocks</span><strong>Day Trading</strong><p>Live status, realized performance, and the Day Trading viewer dashboard.</p><b>View Day Trading ↓</b></a>
    <a class="vx-home-system-card" href="${SWING_TRADING_PATH}"><span>Multi-session</span><strong>Swing Trading</strong><p>Active Portfolio, Swing Leaders, and the dedicated swing equity history.</p><b>Explore Swing Trading →</b></a>
    <a class="vx-home-system-card" href="${OPTIONS_PATH}"><span>Options</span><strong>Options</strong><p>Options Journal evidence and realized Options performance after viewer access.</p><b>Explore Options →</b></a>
  </nav>`;
}

function renderHeroPreview() {
  return `<aside class="vx-home-proof-preview" aria-label="Day Trading performance preview">
    <div class="vx-home-proof-preview-head"><div><span>Live evidence</span><h2>Day Trading snapshot</h2></div><a href="#${DAY_ANCHOR_ID}">Explore performance ↓</a></div>
    <p class="vx-home-proof-preview-copy">This preview mirrors the verified Day Trading block below. If the source is unavailable, values remain unavailable rather than being simulated.</p>
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
  const top = `<section class="vx-home-top-systems"><div class="wrap"><div class="vx-home-top-grid">${heroHtml}${renderHeroPreview()}</div>${renderSystemSelector()}</div></section>`;
  return html.slice(0, heroRange.start) + top + html.slice(heroRange.end);
}

const styles = `
<style id="${STYLE_ID}">
  .vx-home-top-systems{padding:42px 0 38px;background:linear-gradient(180deg,#f3faf6 0%,#fff 92%);border-bottom:1px solid #e3e9e5}
  .vx-home-top-systems>.wrap{max-width:1180px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-home-top-grid{display:grid;grid-template-columns:minmax(0,1.16fr) minmax(320px,.84fr);gap:18px;align-items:stretch}
  .vx-home-top-systems .vx-home-hero{margin:0;padding:34px 34px 32px;border:1px solid #d9e6df;border-radius:28px;background:#fff;box-shadow:0 16px 44px rgba(31,67,51,.045);box-sizing:border-box}
  .vx-home-top-systems .vx-home-hero .wrap{max-width:none;margin:0;padding:0}
  .vx-home-top-systems .vx-home-hero-copy{max-width:650px;margin:0;padding:0;text-align:left}
  .vx-home-top-systems .vx-home-hero h1{max-width:650px;margin:14px 0 0;font-size:clamp(48px,4.8vw,58px);font-weight:500;line-height:1.01;letter-spacing:-.045em;white-space:normal!important;text-wrap:balance}
  .vx-home-top-systems .vx-home-hero-lead{max-width:620px;margin:17px 0 0;color:#56645e;font-size:16.5px;line-height:1.58}
  .vx-home-top-systems .vx-home-hero-actions{justify-content:flex-start;margin-top:23px}
  .vx-home-top-systems .vx-home-hero-proof{margin:14px 0 0;color:#5f6d67;font-size:13px}
  .vx-home-top-systems .vx-home-hero-login{margin:7px 0 0;color:#5f6d67;font-size:12.5px}
  .vx-home-proof-preview{display:flex;min-width:0;flex-direction:column;padding:27px;border:1px solid #cfe3d8;border-radius:28px;background:linear-gradient(145deg,#11372a 0%,#174d39 100%);color:#f5fbf8;box-shadow:0 18px 48px rgba(17,55,42,.12);box-sizing:border-box}
  .vx-home-proof-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.vx-home-proof-preview-head span{color:#a9d9c1;font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.vx-home-proof-preview-head h2{margin:7px 0 0;color:#fff;font-size:25px;font-weight:560;letter-spacing:-.025em}.vx-home-proof-preview-head a{color:#d9f1e5;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap}.vx-home-proof-preview-copy{margin:14px 0 0;color:#c4d8ce;font-size:13px;line-height:1.55}
  .vx-home-proof-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:22px}.vx-home-proof-grid>div{min-width:0;padding:15px;border:1px solid rgba(255,255,255,.13);border-radius:17px;background:rgba(255,255,255,.055)}.vx-home-proof-grid span{display:block;color:#bfd3c9;font-size:11.5px;line-height:1.35}.vx-home-proof-grid strong{display:block;margin-top:8px;color:#fff;font-size:22px;font-weight:560;letter-spacing:-.025em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.vx-home-proof-grid strong.positive{color:#83e9b3}.vx-home-proof-grid strong.negative{color:#ffaaa7}
  .vx-home-proof-meta{display:grid;gap:5px;margin-top:auto;padding-top:18px;color:#bed3c8;font-size:11.5px;line-height:1.45;font-variant-numeric:tabular-nums}
  .vx-home-system-stack{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px;min-width:0}
  .vx-home-top-systems .vx-home-system-card{display:flex;min-height:170px;flex-direction:column;padding:19px 20px;border:1px solid #dce7e1;border-radius:22px;background:#fff;color:#17211d;text-decoration:none;box-shadow:0 12px 34px rgba(31,67,51,.035);box-sizing:border-box;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
  .vx-home-top-systems .vx-home-system-card>span{color:#287153;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
  .vx-home-top-systems .vx-home-system-card>strong{margin-top:8px;font-size:22px;font-weight:560;letter-spacing:-.025em}
  .vx-home-top-systems .vx-home-system-card>p{margin:7px 0 0;color:#56645e;font-size:13.5px;line-height:1.48}
  .vx-home-top-systems .vx-home-system-card>b{margin-top:auto;padding-top:13px;color:#176442;font-size:12.5px;font-weight:700}
  .vx-home-top-systems .vx-home-system-card:hover{transform:translateY(-1px);border-color:#c9ded3;box-shadow:0 16px 40px rgba(31,67,51,.06)}
  #${DAY_ANCHOR_ID}{scroll-margin-top:92px}
  @media(max-width:900px){.vx-home-top-grid{grid-template-columns:1fr}.vx-home-top-systems .vx-home-hero{order:1}.vx-home-proof-preview{order:2}.vx-home-system-stack{grid-template-columns:repeat(3,minmax(0,1fr))}.vx-home-top-systems .vx-home-hero h1{font-size:clamp(42px,7vw,54px)}}
  @media(max-width:700px){.vx-home-top-systems{padding:24px 0 28px}.vx-home-top-systems>.wrap{padding:0 16px}.vx-home-top-systems .vx-home-hero{padding:26px 20px 24px;border-radius:22px}.vx-home-top-systems .vx-home-hero h1{font-size:clamp(34px,10vw,40px);line-height:1.04}.vx-home-top-systems .vx-home-hero-lead{font-size:15.5px}.vx-home-top-systems .vx-home-hero-actions{margin-top:20px}.vx-home-proof-preview{padding:22px 18px;border-radius:22px}.vx-home-proof-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-home-system-stack{grid-template-columns:1fr}.vx-home-top-systems .vx-home-system-card{min-height:138px}.vx-home-proof-preview-head{flex-direction:column}.vx-home-proof-preview-head a{white-space:normal}}
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
  return html.includes("</body>") ? html.replace("</body>", `${script}\n</body>`) : `${html}${script}`;
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
  SWING_TRADING_PATH,
  OPTIONS_PATH,
  findTagRangeFromOpen,
  findTagByClass,
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
