"use strict";

const Module = require("module");

const DAY_PATH = "/trading-systems/day-trading";
const LIVE_ACCESS_HREF = "/#password-access";
const PAGE_MARKER = 'data-vx-conversion-system-page="day"';
const BUTTON_MARKER = 'data-vx-day-live-access="1"';
const COMPACT_MARKER = 'data-vx-day-compact-hero="1"';
const STYLE_ID = "vx-day-compact-hero-style";
const ACTIONS_OPEN = '<div class="vx-conversion-system-actions">';
const HERO_OPEN = '<section class="vx-conversion-system-hero"><div>';
const WORKING_SCREEN_OPEN = '<section class="vx-conversion-working-screen"';
const RESULTS_LINK = '<a href="/results#day-trading">View Day Trading Results</a>';

const compactStyles = `<style id="${STYLE_ID}">
.vx-day-compact-hero{grid-template-columns:minmax(0,1.08fr) minmax(330px,.84fr)!important;gap:32px;align-items:start;padding-bottom:30px!important}.vx-day-compact-copy{max-width:none!important;min-width:0}.vx-day-compact-copy h1{max-width:690px!important;font-size:clamp(38px,4.1vw,54px)!important}.vx-day-compact-copy>p{max-width:690px!important}.vx-day-compact-panel{align-self:start;padding:20px;border:1px solid #d5e4dc;border-radius:22px;background:rgba(255,255,255,.84);box-shadow:0 14px 34px rgba(26,72,53,.07);backdrop-filter:blur(8px)}.vx-day-compact-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:1px 2px 14px;border-bottom:1px solid #e2ebe6}.vx-day-compact-panel-head span{display:block;color:#287153;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.vx-day-compact-panel-head strong{display:block;margin-top:5px;color:#17211d;font-size:20px;font-weight:620;letter-spacing:-.025em}.vx-day-compact-panel-head em{font-style:normal;color:#65736d;font-size:11px;white-space:nowrap}.vx-day-compact-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 2px;border-bottom:1px solid #e7eee9}.vx-day-compact-row:last-child{border-bottom:0;padding-bottom:2px}.vx-day-compact-row strong{display:block;color:#17211d;font-size:13px;font-weight:700}.vx-day-compact-row p{margin:4px 0 0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#66736e!important;font-size:11.5px!important;line-height:1.45!important}.vx-day-compact-row a{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border:1px solid #c9d9d0;border-radius:999px;background:#fff;color:#176442;text-decoration:none;font-size:11px;font-weight:750;white-space:nowrap}.vx-day-compact-row a.primary{border-color:#078f51;background:#078f51;color:#fff}.vx-day-compact-hero+.vx-conversion-working-screen{margin-top:0!important}
@media(max-width:900px){.vx-day-compact-hero{grid-template-columns:1fr!important;gap:20px}.vx-day-compact-panel{max-width:690px}.vx-day-compact-copy h1{font-size:clamp(36px,7vw,50px)!important}}
@media(max-width:620px){.vx-day-compact-hero{padding-bottom:22px!important}.vx-day-compact-panel{padding:16px;border-radius:18px}.vx-day-compact-panel-head{display:block}.vx-day-compact-panel-head em{display:block;margin-top:5px}.vx-day-compact-row{grid-template-columns:1fr;gap:9px}.vx-day-compact-row a{width:max-content}.vx-day-compact-copy h1{font-size:36px!important}}
</style>`;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function insertDayTradingLiveAccess(html) {
  if (typeof html !== "string" || !html.includes(PAGE_MARKER) || html.includes(BUTTON_MARKER)) return html;
  const openStart = html.indexOf(ACTIONS_OPEN);
  if (openStart < 0) return html;
  const closeStart = html.indexOf("</div>", openStart + ACTIONS_OPEN.length);
  if (closeStart < 0) return html;

  const actionsEnd = closeStart + "</div>".length;
  const actions = html.slice(openStart, actionsEnd);
  if (!actions.includes("Get 30 Days Free") || !actions.includes(RESULTS_LINK)) return html;

  const liveAccess = `<a ${BUTTON_MARKER} href="${LIVE_ACCESS_HREF}">Live Access</a>`;
  const refinedActions = actions.replace(RESULTS_LINK, `${liveAccess}${RESULTS_LINK}`);
  return html.slice(0, openStart) + refinedActions + html.slice(actionsEnd);
}

function extractTrialHref(heroHtml) {
  const match = String(heroHtml || "").match(/<a\b[^>]*href="([^"]+)"[^>]*>Get 30 Days Free<\/a>/i);
  return match ? match[1] : "";
}

function renderCompactPanel(trialHref) {
  const trialAction = trialHref
    ? `<a class="primary" href="${trialHref}" target="_blank" rel="noopener noreferrer">Start Free</a>`
    : `<a class="primary" href="/pricing?system=day-trading">View Plan</a>`;
  return `<aside class="vx-day-compact-panel" aria-label="Day Trading access options">
      <div class="vx-day-compact-panel-head"><div><span>DAY TRADING ACCESS</span><strong>Choose how to follow.</strong></div><em>Public + protected views</em></div>
      <div class="vx-day-compact-row"><div><strong>Public results</strong><p>Review aggregated live P&amp;L, realized history and the closed-trades archive.</p></div><a href="/results#day-trading">View Results</a></div>
      <div class="vx-day-compact-row"><div><strong>Live access</strong><p>Open and pending trade details stay behind the existing viewer-access boundary.</p></div><a href="${LIVE_ACCESS_HREF}">Open Access</a></div>
      <div class="vx-day-compact-row"><div><strong>Telegram signals</strong><p>Start the existing 30-day Day Trading signals trial for entries, exits, targets and stops.</p></div>${trialAction}</div>
    </aside>`;
}

function makeDayTradingHeroCompact(html) {
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
  refinedHero = refinedHero.replace(/<\/section>\s*$/i, `${renderCompactPanel(trialHref)}</section>`);
  return html.slice(0, heroStart) + refinedHero + html.slice(heroEnd);
}

function injectCompactStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  if (html.includes("</head>")) return html.replace("</head>", () => `${compactStyles}\n</head>`);
  return `${compactStyles}${html}`;
}

function refineDayTradingLiveAccess(html, pathname = DAY_PATH) {
  if (pathname !== DAY_PATH) return html;
  let out = insertDayTradingLiveAccess(html);
  out = makeDayTradingHeroCompact(out);
  if (out.includes(COMPACT_MARKER)) out = injectCompactStyles(out);
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
        body = refineDayTradingLiveAccess(body, pathname);
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
  LIVE_ACCESS_HREF,
  PAGE_MARKER,
  BUTTON_MARKER,
  COMPACT_MARKER,
  STYLE_ID,
  ACTIONS_OPEN,
  HERO_OPEN,
  WORKING_SCREEN_OPEN,
  RESULTS_LINK,
  compactStyles,
  requestPath,
  insertDayTradingLiveAccess,
  extractTrialHref,
  renderCompactPanel,
  makeDayTradingHeroCompact,
  injectCompactStyles,
  refineDayTradingLiveAccess,
  installDayTradingLiveAccessRefinement,
  wrapExpress,
};
