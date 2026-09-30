"use strict";

const Module = require("module");

const DAY_PATH = "/trading-systems/day-trading";
const RU_HOST = "ru.vixale.com";
const LIVE_ACCESS_HREF = "/#password-access";
const CLOSED_TRADES_PATH = "/closed-trades";
const PAGE_MARKER = 'data-vx-conversion-system-page="day"';
const BUTTON_MARKER = 'data-vx-day-live-access="1"';
const COMPACT_MARKER = 'data-vx-day-compact-hero="1"';
const SIGNALS_MARKER = 'data-vx-day-recent-signals="1"';
const STYLE_ID = "vx-day-compact-hero-style";
const SCRIPT_ID = "vx-day-recent-signals-script";
const ACTIONS_OPEN = '<div class="vx-conversion-system-actions">';
const HERO_OPEN = '<section class="vx-conversion-system-hero"><div>';
const WORKING_SCREEN_OPEN = '<section class="vx-conversion-working-screen"';
const RESULTS_LINK = '<a href="/results#day-trading">View Day Trading Results</a>';

const compactStyles = `<style id="${STYLE_ID}">
.vx-day-compact-hero{grid-template-columns:minmax(0,1.08fr) minmax(380px,.92fr)!important;gap:32px;align-items:start;padding-bottom:30px!important}.vx-day-compact-copy{max-width:none!important;min-width:0}.vx-day-compact-copy h1{max-width:690px!important;font-size:clamp(38px,4.1vw,54px)!important}.vx-day-compact-copy>p{max-width:690px!important}
.vx-day-signals-panel{display:flex;flex-direction:column;align-self:start;min-width:0;margin:0;padding:12px 16px 10px;border:1px solid #d5e4dc;border-radius:22px;background:rgba(255,255,255,.88);box-shadow:0 14px 34px rgba(26,72,53,.07);backdrop-filter:blur(8px);font-weight:400;line-height:1.3}
/* Keep the shared hero's uppercase, bold span treatment out of signal rows. */
.vx-day-compact-hero .vx-day-signals-panel span{font-weight:400;line-height:1.3;letter-spacing:normal;text-transform:none}
.vx-day-signals-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 8px;border-bottom:1px solid #e2ebe6}.vx-day-signals-head strong{display:block;color:#17211d;font-size:16px;font-weight:500;letter-spacing:-.02em;line-height:1.25}.vx-day-signals-head a{display:inline-flex;align-items:center;gap:6px;color:#078f51;text-decoration:none;font-size:10.5px;font-weight:400;white-space:nowrap}.vx-day-signals-head a:before{content:'↗';font-size:11px}
.vx-day-signals-list{display:grid}.vx-day-signal-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:3px 0;border-bottom:1px solid #e7eee9}.vx-day-signal-row:last-child{border-bottom:0}.vx-day-signal-main{min-width:0}.vx-day-signal-top{display:flex;align-items:center;gap:7px;min-width:0}
.vx-day-signals-panel .vx-day-signal-symbol{color:#287153;font-size:12px}.vx-day-signals-panel .vx-day-signal-side{display:inline-flex;align-items:center;min-height:16px;padding:0 6px;border-radius:999px;background:#edf6f1;color:#287153;font-size:8.5px}.vx-day-signals-panel .vx-day-signal-short .vx-day-signal-symbol,.vx-day-signals-panel .vx-day-signal-short .vx-day-signal-side{color:#b64a4a}.vx-day-signals-panel .vx-day-signal-short .vx-day-signal-side{background:#fbefef}
.vx-day-signal-meta{margin-top:2px;color:#65736d;font-size:9.5px;line-height:1.35;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vx-day-signal-right{text-align:right}.vx-day-signals-panel .vx-day-signal-pnl{display:inline-flex;align-items:center;justify-content:center;min-width:62px;min-height:21px;padding:0 8px;border-radius:999px;background:#edf6f1;color:#087546;font-size:10px}.vx-day-signals-panel .vx-day-signal-pnl.negative{background:#fbefef;color:#b64a4a}.vx-day-signals-panel .vx-day-signal-pnl.neutral{background:#f1f3f2;color:#68756f}.vx-day-signals-panel .vx-day-signal-time{display:block;margin-top:2px;color:#8a9691;font-size:8.5px;white-space:nowrap}
.vx-day-signals-status{padding:17px 2px 8px;color:#65736d;font-size:11px;line-height:1.45}.vx-day-signals-foot{padding-top:6px;border-top:1px solid #eef2ef;color:#87928d;font-size:9px;line-height:1.35;font-weight:400}.vx-day-compact-hero+.vx-conversion-working-screen{margin-top:0!important}
@media(min-width:901px){.vx-day-compact-hero>.vx-day-signals-panel{align-self:stretch;margin-top:-14px}.vx-day-signals-list{flex:1}}
@media(max-width:900px){.vx-day-compact-hero{grid-template-columns:1fr!important;gap:20px}.vx-day-signals-panel{max-width:690px}.vx-day-compact-copy h1{font-size:clamp(36px,7vw,50px)!important}}
@media(max-width:620px){.vx-day-compact-hero{padding-bottom:22px!important}.vx-day-signals-panel{padding:16px;border-radius:18px}.vx-day-signals-head{align-items:flex-start;flex-wrap:wrap}.vx-day-signal-row{padding:9px 0}.vx-day-signal-meta{white-space:normal}.vx-day-compact-copy h1{font-size:36px!important}}
</style>`;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function requestHost(req) {
  return String(req?.get?.("host") || req?.headers?.host || req?.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function isRussianRequest(req) {
  return requestHost(req) === RU_HOST;
}

function insertDayTradingLiveAccess(html, isRussian = false) {
  if (typeof html !== "string" || !html.includes(PAGE_MARKER) || html.includes(BUTTON_MARKER)) return html;
  const openStart = html.indexOf(ACTIONS_OPEN);
  if (openStart < 0) return html;
  const closeStart = html.indexOf("</div>", openStart + ACTIONS_OPEN.length);
  if (closeStart < 0) return html;

  const actionsEnd = closeStart + "</div>".length;
  const actions = html.slice(openStart, actionsEnd);
  if (!actions.includes("Get 30 Days Free") || !actions.includes(RESULTS_LINK)) return html;

  const liveAccessLabel = isRussian ? "Live-доступ" : "Live Access";
  const liveAccess = `<a ${BUTTON_MARKER} href="${LIVE_ACCESS_HREF}">${liveAccessLabel}</a>`;
  const refinedActions = actions.replace(RESULTS_LINK, `${liveAccess}${RESULTS_LINK}`);
  return html.slice(0, openStart) + refinedActions + html.slice(actionsEnd);
}

function extractTrialHref(heroHtml) {
  const match = String(heroHtml || "").match(/<a\b[^>]*href="([^"]+)"[^>]*>Get 30 Days Free<\/a>/i);
  return match ? match[1] : "";
}

function renderRecentSignalsPanel(trialHref, isRussian = false) {
  const copy = isRussian ? {
    aria: "Последние сигналы дейтрейдинга",
    title: "Последние сигналы Day Trading",
    live: "Live в Telegram",
    loading: "Загружаем последние публичные закрытые сделки…",
    foot: "Последние закрытые сигналы из публичного журнала Closed Trades. Открытые и ожидающие сделки остаются защищёнными.",
  } : {
    aria: "Recent Day Trading Signals",
    title: "Recent Day Trading Signals",
    live: "Live on Telegram",
    loading: "Loading the latest public closed trades…",
    foot: "Latest closed signals from the public Closed Trades ledger. Open and pending trade details remain protected.",
  };
  const liveHref = trialHref || "/pricing?system=day-trading";
  return `<aside class="vx-day-signals-panel" ${SIGNALS_MARKER} aria-label="${copy.aria}">
      <div class="vx-day-signals-head"><strong>${copy.title}</strong><a href="${liveHref}" target="_blank" rel="noopener noreferrer">${copy.live}</a></div>
      <div class="vx-day-signals-list" data-vx-day-signals-list data-vx-loading-copy="${copy.loading}"><div class="vx-day-signals-status">${copy.loading}</div></div>
      <div class="vx-day-signals-foot">${copy.foot}</div>
    </aside>`;
}

function makeDayTradingHeroCompact(html, isRussian = false) {
  if (typeof html !== "string" || !html.includes(PAGE_MARKER) || html.includes(COMPACT_MARKER)) return html;
  const heroStart = html.indexOf(HERO_OPEN);
  if (heroStart < 0) return html;
  const workingStart = html.indexOf(WORKING_SCREEN_OPEN, heroStart + HERO_OPEN.length);
  if (workingStart < 0) return html;
  const heroCloseStart = html.lastIndexOf("</section>", workingStart);
  if (heroCloseStart < heroStart) return html;
  const heroEnd = heroCloseStart + "</section>".length;
  const hero = html.slice(heroStart, heroEnd);
  if (!hero.includes("Live stock signals and P&amp;L.") || !hero.includes("Get 30 Days Free")) return html;

  const trialHref = extractTrialHref(hero);
  let refinedHero = hero.replace(HERO_OPEN, `<section class="vx-conversion-system-hero vx-day-compact-hero" ${COMPACT_MARKER}><div class="vx-day-compact-copy">`);
  refinedHero = refinedHero.replace(/<\/section>\s*$/i, `${renderRecentSignalsPanel(trialHref, isRussian)}</section>`);
  return html.slice(0, heroStart) + refinedHero + html.slice(heroEnd);
}

function recentSignalsScript(isRussian = false) {
  const unavailable = isRussian ? "Последние публичные сделки временно недоступны." : "Recent public trades are temporarily unavailable.";
  const noTrades = isRussian ? "В публичном журнале пока нет закрытых сделок." : "No closed trades are available in the public ledger yet.";
  const labels = isRussian
    ? { entry: "Вход", exit: "Выход", shares: "акц.", closed: "Закрыто" }
    : { entry: "Entry", exit: "Exit", shares: "shares", closed: "Closed" };
  return `<script id="${SCRIPT_ID}">(() => {
const target=document.querySelector('[data-vx-day-signals-list]');if(!target)return;
const clean=v=>String(v||'').replace(/\\s+/g,' ').trim();
const esc=v=>clean(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
const pnlClass=v=>{const t=clean(v);if(/^[-−]/.test(t))return' negative';if(/^\\+/.test(t))return'';return' neutral'};
const render=rows=>{if(!rows.length){target.innerHTML='<div class="vx-day-signals-status">${noTrades}</div>';return}target.innerHTML=rows.slice(0,5).map(row=>{const cells=Array.from(row.querySelectorAll('td'));const time=clean(cells[0]?.textContent);const symbol=clean(cells[1]?.textContent);const side=clean(cells[2]?.textContent);const entry=clean(cells[3]?.textContent);const exit=clean(cells[4]?.textContent);const size=clean(cells[5]?.textContent);const pnl=clean(cells[6]?.textContent);const event=clean(cells[7]?.textContent)||'${labels.closed}';const meta=['${labels.entry} '+entry,'${labels.exit} '+exit,size&&size!=='—'?size+' ${labels.shares}':''].filter(Boolean).join(' · ');return '<div class="vx-day-signal-row'+(side.toUpperCase()==='SHORT'?' vx-day-signal-short':'')+'"><div class="vx-day-signal-main"><div class="vx-day-signal-top"><span class="vx-day-signal-symbol">'+esc(symbol||'—')+'</span><span class="vx-day-signal-side">'+esc(side||'${labels.closed}')+'</span></div><div class="vx-day-signal-meta">'+esc(meta)+'</div></div><div class="vx-day-signal-right"><span class="vx-day-signal-pnl'+pnlClass(pnl)+'">'+esc(pnl||'—')+'</span><span class="vx-day-signal-time">'+esc(time||event)+'</span></div></div>'}).join('')};
fetch('${CLOSED_TRADES_PATH}',{credentials:'same-origin',cache:'no-store',headers:{Accept:'text/html'}}).then(r=>r.ok?r.text():Promise.reject(new Error('closed_trades_http_'+r.status))).then(html=>{const doc=new DOMParser().parseFromString(html,'text/html');render(Array.from(doc.querySelectorAll('[data-archive-row]')))}).catch(()=>{target.innerHTML='<div class="vx-day-signals-status">${unavailable}</div>'});
})();</script>`;
}

function injectCompactAssets(html, isRussian = false) {
  if (typeof html !== "string") return html;
  let out = html;
  if (!out.includes(`id="${STYLE_ID}"`)) out = out.includes("</head>") ? out.replace("</head>", () => `${compactStyles}\n</head>`) : `${compactStyles}${out}`;
  if (!out.includes(`id="${SCRIPT_ID}"`)) out = out.includes("</body>") ? out.replace("</body>", () => `${recentSignalsScript(isRussian)}\n</body>`) : `${out}${recentSignalsScript(isRussian)}`;
  return out;
}

function refineDayTradingLiveAccess(html, pathname = DAY_PATH, isRussian = false) {
  if (pathname !== DAY_PATH) return html;
  let out = insertDayTradingLiveAccess(html, isRussian);
  out = makeDayTradingHeroCompact(out, isRussian);
  if (out.includes(COMPACT_MARKER)) out = injectCompactAssets(out, isRussian);
  return out;
}

function installDayTradingLiveAccessRefinement(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const pathname = requestPath(req);
    if ((method !== "GET" && method !== "HEAD") || pathname !== DAY_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendWithDayTradingLiveAccess(body) {
      const type = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (typeof body === "string" && (!type || type.includes("html"))) {
        body = refineDayTradingLiveAccess(body, pathname, isRussianRequest(req));
      }
      return send(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) {
      try { Object.defineProperty(target, key, descriptor); } catch (_) {}
    }
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleDayTradingLiveAccessWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installDayTradingLiveAccessRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleDayTradingLiveAccessWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleDayTradingLiveAccessModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  DAY_PATH,
  RU_HOST,
  LIVE_ACCESS_HREF,
  CLOSED_TRADES_PATH,
  PAGE_MARKER,
  BUTTON_MARKER,
  COMPACT_MARKER,
  SIGNALS_MARKER,
  STYLE_ID,
  SCRIPT_ID,
  ACTIONS_OPEN,
  HERO_OPEN,
  WORKING_SCREEN_OPEN,
  RESULTS_LINK,
  compactStyles,
  requestPath,
  requestHost,
  isRussianRequest,
  insertDayTradingLiveAccess,
  extractTrialHref,
  renderRecentSignalsPanel,
  makeDayTradingHeroCompact,
  recentSignalsScript,
  injectCompactAssets,
  refineDayTradingLiveAccess,
  installDayTradingLiveAccessRefinement,
  wrapExpress,
};
