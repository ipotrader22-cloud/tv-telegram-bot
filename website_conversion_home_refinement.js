"use strict";

const Module = require("module");
const { DAY_TRIAL_URL, SYSTEMS } = require("./lib/website-commercial-offer");

const HOME_PATH = "/";
const STYLE_ID = "vx-conversion-home-style";
const SCRIPT_ID = "vx-conversion-home-script";
const MARKER = 'class="vx-conversion-home"';
const DAY_PATH = SYSTEMS[0].path;
const SWING_PATH = SYSTEMS[1].path;
const OPTIONS_PATH = SYSTEMS[2].path;

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

function findTagByClass(html, tagName, className) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "i");
  const match = pattern.exec(String(html || ""));
  return match ? findTagRangeFromOpen(html, tagName, match.index) : null;
}

function renderDayPanel() {
  return `<section id="vx-preview-day" class="vx-conversion-preview-panel is-active" role="tabpanel" aria-labelledby="vx-preview-tab-day" data-vx-preview-panel="day">
    <div class="vx-conversion-panel-head"><div><span>Day Trading — Live Overview</span><strong>Current system activity</strong></div><a href="${DAY_PATH}">Open Day Trading →</a></div>
    <div class="vx-conversion-metrics">
      <div><span>Open Positions</span><strong data-vx-mirror="vx-home-live-0">—</strong></div>
      <div><span>Open P&amp;L</span><strong data-vx-mirror="vx-home-open-pnl">—</strong></div>
      <div><span>Closed P&amp;L Today</span><strong data-vx-mirror="vx-home-live-3">—</strong></div>
      <div><span>Total Realized P&amp;L</span><strong data-vx-mirror="vx-home-equity-total">—</strong></div>
    </div>
    <div class="vx-conversion-chart" id="vx-conversion-day-chart"><div class="vx-conversion-chart-loading">Loading realized-results chart…</div></div>
    <div class="vx-conversion-status"><span data-vx-mirror-text="vx-home-day-badge">Checking market/session state…</span><span data-vx-mirror-text="vx-home-day-updated">Last updated: checking…</span></div>
  </section>`;
}

function renderSwingPanel() {
  return `<section id="vx-preview-swing" class="vx-conversion-preview-panel" role="tabpanel" aria-labelledby="vx-preview-tab-swing" data-vx-preview-panel="swing" hidden>
    <div class="vx-conversion-panel-head"><div><span>Swing Trading</span><strong>Daily portfolio preview</strong></div><a href="${SWING_PATH}">View Swing Portfolio →</a></div>
    <div class="vx-conversion-swing-state" data-vx-swing-state>
      <div class="vx-conversion-skeleton-row" aria-hidden="true"><i></i><i></i><i></i></div>
      <p>Loading the latest published portfolio update…</p>
    </div>
  </section>`;
}

function renderOptionsPanel() {
  return `<section id="vx-preview-options" class="vx-conversion-preview-panel" role="tabpanel" aria-labelledby="vx-preview-tab-options" data-vx-preview-panel="options" hidden>
    <div class="vx-conversion-panel-head"><div><span>Options</span><strong>Latest position updates</strong></div><a href="${OPTIONS_PATH}">Explore Options →</a></div>
    <div class="vx-conversion-protected-state">
      <span>Daily website updates</span>
      <h3>Position details and supporting records are protected.</h3>
      <p>Openings, updates and closures are published through the existing Options workflow. Public visitors see the product overview; entitled viewers can open the protected position history and brokerage records.</p>
      <div><a href="${OPTIONS_PATH}">Explore Options</a><a href="/access?system=options">Get Dashboard Access</a></div>
    </div>
  </section>`;
}

function renderHeroAndPreview() {
  return `<section class="vx-conversion-home"><div class="vx-conversion-home-wrap">
    <div class="vx-conversion-hero-grid">
      <div class="vx-conversion-hero-copy">
        <div class="vx-conversion-kicker">Vixale Trading Systems</div>
        <h1>Trading signals. Three systems. Your choice.</h1>
        <p>Follow Day Trading live, explore a daily Swing portfolio, or track Options positions. See the trades and results, then choose your system.</p>
        <div class="vx-conversion-hero-actions"><a class="vx-conversion-btn primary" href="${DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a><a class="vx-conversion-btn" href="/results">View Trading Results</a></div>
        <div class="vx-conversion-trial-line">30-day free trial of Day Trading Telegram signals.</div>
      </div>
      <div class="vx-conversion-product-preview">
        <div class="vx-conversion-tabs" role="tablist" aria-label="Trading system preview">
          <button id="vx-preview-tab-day" type="button" role="tab" aria-selected="true" aria-controls="vx-preview-day" tabindex="0" data-vx-preview-tab="day">Day Trading</button>
          <button id="vx-preview-tab-swing" type="button" role="tab" aria-selected="false" aria-controls="vx-preview-swing" tabindex="-1" data-vx-preview-tab="swing">Swing Trading</button>
          <button id="vx-preview-tab-options" type="button" role="tab" aria-selected="false" aria-controls="vx-preview-options" tabindex="-1" data-vx-preview-tab="options">Options</button>
        </div>
        <div class="vx-conversion-preview-stage">${renderDayPanel()}${renderSwingPanel()}${renderOptionsPanel()}</div>
      </div>
    </div>
    ${renderSystemCards()}
  </div></section>`;
}

function renderSystemCards() {
  return `<section class="vx-conversion-system-cards" aria-label="Vixale trading systems">
    <article><span>DAY TRADING</span><h2>Watch the trades. Get the signals.</h2><p>Two active strategies working across 5, 15, 30 and 60-minute charts. One closes all positions at the end of the trading day; the other can hold overnight.</p><p>Follow entries, exits, targets, stop levels and live P&amp;L on your screen. Receive Day Trading signals directly in Telegram.</p><a href="${DAY_PATH}">Explore Day Trading →</a></article>
    <article><span>SWING TRADING</span><h2>Follow a portfolio reviewed every day.</h2><p>A stock portfolio built around Vixale's proprietary ranking system. Each trading morning, positions are reviewed, new opportunities are added and exits are published.</p><p>Follow open positions, ranking changes and completed trades — with a clear daily portfolio update.</p><a href="${SWING_PATH}#active-portfolio">View Swing Portfolio →</a></article>
    <article><span>OPTIONS</span><h2>Follow positions from open to close.</h2><p>An actively managed options system with daily position updates. See new positions, follow their progress and review the results when trades close.</p><p>Explore the trade history and supporting brokerage records.</p><a href="${OPTIONS_PATH}">Explore Options →</a></article>
  </section>`;
}

const styles = `
<style id="${STYLE_ID}">
  .vx-conversion-home{padding:34px 0 48px;background:linear-gradient(180deg,#f4faf6 0%,#fff 72%);border-bottom:1px solid #dfe8e3;color:#17211d}
  .vx-conversion-home-wrap{max-width:1220px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-conversion-hero-grid{display:grid;grid-template-columns:minmax(0,40fr) minmax(0,60fr);gap:34px;align-items:center;min-width:0}
  .vx-conversion-hero-copy{min-width:0;padding:28px 0}.vx-conversion-kicker{color:#176442;font-size:11px;font-weight:750;letter-spacing:.09em;text-transform:uppercase}
  .vx-conversion-hero-copy h1{max-width:520px;margin:12px 0 0;color:#101413;font-size:clamp(48px,5vw,62px);font-weight:520;line-height:1.01;letter-spacing:-.048em;text-wrap:balance}
  .vx-conversion-hero-copy>p{max-width:520px;margin:18px 0 0;color:#56645e;font-size:16px;line-height:1.6}
  .vx-conversion-hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:23px}.vx-conversion-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 19px;border:1px solid #c6d7ce;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:13px;font-weight:700}.vx-conversion-btn.primary{border-color:#078f51;background:#078f51;color:#fff;box-shadow:0 10px 26px rgba(7,143,81,.16)}
  .vx-conversion-trial-line{margin-top:12px;color:#4f5e57;font-size:12.5px;font-weight:600}
  .vx-conversion-product-preview{min-width:0;border:1px solid #194c39;border-radius:26px;background:linear-gradient(145deg,#0e3024,#174b38);box-shadow:0 22px 54px rgba(13,48,35,.16);overflow:hidden;color:#fff}
  .vx-conversion-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-bottom:1px solid rgba(255,255,255,.12)}.vx-conversion-tabs button{min-width:0;min-height:48px;padding:0 12px;border:0;border-right:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.025);color:#bcd2c7;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}.vx-conversion-tabs button:last-child{border-right:0}.vx-conversion-tabs button[aria-selected="true"]{background:rgba(255,255,255,.12);color:#fff;box-shadow:inset 0 -3px #62d69a}.vx-conversion-tabs button:focus-visible{outline:3px solid #99efc1;outline-offset:-4px}
  .vx-conversion-preview-stage{min-height:390px}.vx-conversion-preview-panel{min-height:390px;padding:24px;box-sizing:border-box}.vx-conversion-preview-panel[hidden]{display:none!important}.vx-conversion-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.vx-conversion-panel-head span{display:block;color:#99d8b9;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.vx-conversion-panel-head strong{display:block;margin-top:5px;color:#fff;font-size:23px;font-weight:560}.vx-conversion-panel-head>a{color:#d8eee3;font-size:12.5px;font-weight:700;text-decoration:none;white-space:nowrap}
  .vx-conversion-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:19px}.vx-conversion-metrics>div{min-width:0;padding:13px;border:1px solid rgba(255,255,255,.11);border-radius:14px;background:rgba(255,255,255,.05)}.vx-conversion-metrics span{display:block;color:#b7cec2;font-size:10.5px;line-height:1.35}.vx-conversion-metrics strong{display:block;margin-top:7px;color:#fff;font-size:19px;font-weight:580;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.vx-conversion-metrics strong.positive{color:#7fe4ac}.vx-conversion-metrics strong.negative{color:#ffaaa7}
  .vx-conversion-chart{height:180px;margin-top:13px;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:rgba(255,255,255,.035);overflow:hidden}.vx-conversion-chart svg{display:block;width:100%;height:100%}.vx-conversion-chart-loading{display:flex;height:100%;align-items:center;justify-content:center;color:#a9c3b7;font-size:12px}.vx-conversion-status{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;color:#b9d0c5;font-size:11.5px}
  .vx-conversion-skeleton-row{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:22px}.vx-conversion-skeleton-row i{height:72px;border-radius:13px;background:rgba(255,255,255,.08);animation:vxPulse 1.4s ease-in-out infinite alternate}.vx-conversion-swing-state>p{margin:14px 0 0;color:#b9d0c5;font-size:12.5px}.vx-conversion-swing-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:19px}.vx-conversion-swing-summary>div{padding:13px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.05)}.vx-conversion-swing-summary span{display:block;color:#b7cec2;font-size:10.5px}.vx-conversion-swing-summary strong{display:block;margin-top:6px;color:#fff;font-size:19px}.vx-conversion-swing-positions{display:grid;gap:8px;margin-top:13px}.vx-conversion-swing-position{display:grid;grid-template-columns:1fr auto auto;gap:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.045);font-size:12px}.vx-conversion-swing-position strong{color:#fff}.vx-conversion-swing-position span{color:#c3d7cd}.vx-conversion-swing-meta{margin-top:13px;color:#b9d0c5;font-size:11.5px}
  .vx-conversion-protected-state{margin-top:22px;padding:22px;border:1px solid rgba(255,255,255,.11);border-radius:17px;background:rgba(255,255,255,.045)}.vx-conversion-protected-state>span{color:#99d8b9;font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.07em}.vx-conversion-protected-state h3{margin:8px 0 0;color:#fff;font-size:22px;font-weight:560}.vx-conversion-protected-state p{max-width:620px;margin:10px 0 0;color:#c2d5cb;font-size:13px;line-height:1.55}.vx-conversion-protected-state>div{display:flex;gap:9px;flex-wrap:wrap;margin-top:17px}.vx-conversion-protected-state a{display:inline-flex;min-height:40px;align-items:center;padding:0 14px;border:1px solid rgba(255,255,255,.2);border-radius:999px;color:#fff;text-decoration:none;font-size:12px;font-weight:700}
  .vx-conversion-system-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:34px}.vx-conversion-system-cards article{display:flex;min-width:0;flex-direction:column;padding:23px;border:1px solid #dce6e1;border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(24,57,43,.04)}.vx-conversion-system-cards article>span{color:#287153;font-size:10.5px;font-weight:800;letter-spacing:.09em}.vx-conversion-system-cards h2{margin:9px 0 0;color:#17211d;font-size:23px;font-weight:560;letter-spacing:-.025em}.vx-conversion-system-cards p{margin:10px 0 0;color:#5f6d67;font-size:13.5px;line-height:1.55}.vx-conversion-system-cards a{margin-top:auto;padding-top:17px;color:#176442;font-size:13px;font-weight:750;text-decoration:none}
  @keyframes vxPulse{from{opacity:.45}to{opacity:.9}}
  @media(prefers-reduced-motion:reduce){.vx-conversion-skeleton-row i{animation:none}}
  @media(max-width:900px){.vx-conversion-hero-grid{grid-template-columns:1fr}.vx-conversion-hero-copy{padding:14px 0 0}.vx-conversion-hero-copy h1{max-width:720px}.vx-conversion-hero-copy>p{max-width:680px}.vx-conversion-system-cards{grid-template-columns:1fr}.vx-conversion-preview-stage,.vx-conversion-preview-panel{min-height:360px}}
  @media(max-width:600px){.vx-conversion-home{padding:20px 0 34px}.vx-conversion-home-wrap{padding:0 14px}.vx-conversion-hero-grid{gap:20px}.vx-conversion-hero-copy h1{font-size:clamp(34px,10.5vw,40px)}.vx-conversion-hero-copy>p{font-size:14.5px;margin-top:13px}.vx-conversion-hero-actions{margin-top:17px}.vx-conversion-btn{min-height:44px}.vx-conversion-trial-line{font-size:11.8px}.vx-conversion-product-preview{border-radius:20px}.vx-conversion-tabs button{min-height:44px;padding:0 6px;font-size:11.5px}.vx-conversion-preview-panel{padding:17px;min-height:350px}.vx-conversion-preview-stage{min-height:350px}.vx-conversion-panel-head{gap:8px}.vx-conversion-panel-head strong{font-size:19px}.vx-conversion-panel-head>a{font-size:11.5px}.vx-conversion-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-conversion-chart{height:140px}.vx-conversion-swing-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.vx-conversion-swing-position{grid-template-columns:1fr auto}.vx-conversion-swing-position span:last-child{grid-column:1/-1}.vx-conversion-system-cards{margin-top:22px;gap:10px}.vx-conversion-system-cards article{padding:19px}.vx-conversion-system-cards h2{font-size:20px}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const tabs = Array.from(document.querySelectorAll('[data-vx-preview-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-vx-preview-panel]'));
  if (!tabs.length || !panels.length) return;
  let swingLoaded = false;
  const money = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n > 0 ? '+$' + abs : n < 0 ? '-$' + abs : '$0.00';
  };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const cloneDayChart = () => {
    const source = document.getElementById('vx-home-equity-svg');
    const target = document.getElementById('vx-conversion-day-chart');
    if (!target) return;
    if (!source) { target.innerHTML = '<div class="vx-conversion-chart-loading">Realized-results chart unavailable.</div>'; return; }
    const clone = source.cloneNode(true);
    clone.id = 'vx-conversion-day-equity-svg';
    target.replaceChildren(clone);
  };
  const dayStage = document.getElementById('vx-home-equity-stage');
  if (dayStage) new MutationObserver(cloneDayChart).observe(dayStage, { childList: true, subtree: true, attributes: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cloneDayChart, { once: true }); else cloneDayChart();

  const loadSwing = async () => {
    if (swingLoaded) return;
    swingLoaded = true;
    const state = document.querySelector('[data-vx-swing-state]');
    if (!state) return;
    try {
      const response = await fetch('/api/swing-leaders', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      const positions = Array.isArray(data.active_portfolio) ? data.active_portfolio.slice(0, 3) : [];
      const latestEquity = Array.isArray(data.equity_history) && data.equity_history.length ? data.equity_history[data.equity_history.length - 1] : null;
      const positionRows = positions.length ? positions.map(item => '<div class="vx-conversion-swing-position"><strong>' + escape(item.ticker) + '</strong><span>Score ' + escape(item.score) + '</span><span>' + escape(item.return_pct) + '</span></div>').join('') : '<div class="vx-conversion-swing-position"><strong>No active positions</strong><span>Latest published snapshot</span><span></span></div>';
      state.innerHTML = '<div class="vx-conversion-swing-summary"><div><span>Open positions</span><strong>' + escape(data.active_count) + '</strong></div><div><span>Potential candidates</span><strong>' + escape(data.intern_count) + '</strong></div><div><span>Total model P&L</span><strong>' + escape(latestEquity ? money(latestEquity.total_model_pnl) : '—') + '</strong></div></div><div class="vx-conversion-swing-positions">' + positionRows + '</div><div class="vx-conversion-swing-meta">Reviewed each trading morning · Latest published update ' + escape(data.snapshot_date || 'unavailable') + (data.stale ? ' · Last validated snapshot' : '') + '</div>';
    } catch (_) {
      state.innerHTML = '<div class="vx-conversion-protected-state"><span>Daily portfolio update</span><h3>Latest Swing portfolio update is temporarily unavailable.</h3><p>No replacement values are shown. Open the Swing portfolio page for the current published state.</p><div><a href="${SWING_PATH}">View Swing Portfolio</a></div></div>';
    }
  };
  const activate = key => {
    tabs.forEach(tab => {
      const active = tab.getAttribute('data-vx-preview-tab') === key;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => {
      const active = panel.getAttribute('data-vx-preview-panel') === key;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    if (key === 'swing') loadSwing();
    if (key === 'day') cloneDayChart();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.getAttribute('data-vx-preview-tab')));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      tabs[next].focus();
      activate(tabs[next].getAttribute('data-vx-preview-tab'));
    });
  });
})();
</script>`;

function injectAssets(html) {
  let out = html;
  if (!out.includes(`id="${STYLE_ID}"`)) out = out.includes("</head>") ? out.replace("</head>", `${styles}\n</head>`) : `${styles}${out}`;
  if (!out.includes(`id="${SCRIPT_ID}"`)) out = out.includes("</body>") ? out.replace("</body>", `${script}\n</body>`) : `${out}${script}`;
  return out;
}

function refineConversionHomepage(html) {
  if (typeof html !== "string") return html;
  let out = html;
  if (!out.includes(MARKER)) {
    const oldTop = findTagByClass(out, "section", "vx-home-top-systems");
    if (oldTop) out = out.slice(0, oldTop.start) + renderHeroAndPreview() + out.slice(oldTop.end);
    else {
      const oldHero = findTagByClass(out, "section", "vx-home-hero");
      if (!oldHero) return html;
      out = out.slice(0, oldHero.start) + renderHeroAndPreview() + out.slice(oldHero.end);
    }
  }
  return injectAssets(out);
}

function installConversionHomeRefinement(app) {
  app.use((req, res, next) => {
    const path = String(req.path || req.url || "/").split("?")[0];
    const method = String(req.method || "GET").toUpperCase();
    if (path !== HOME_PATH || (method !== "GET" && method !== "HEAD")) return next();
    const send = res.send.bind(res);
    res.send = function sendWithConversionHome(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineConversionHomepage(body);
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
  if (typeof factory !== "function" || factory.__vixaleConversionHomeWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installConversionHomeRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleConversionHomeWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleConversionHomeModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  STYLE_ID,
  SCRIPT_ID,
  DAY_PATH,
  SWING_PATH,
  OPTIONS_PATH,
  findTagRangeFromOpen,
  findTagByClass,
  renderDayPanel,
  renderSwingPanel,
  renderOptionsPanel,
  renderSystemCards,
  renderHeroAndPreview,
  injectAssets,
  refineConversionHomepage,
  installConversionHomeRefinement,
  wrapExpress,
};
