"use strict";

const Module = require("module");

const HOME_PATH = "/";
const DASHBOARD_PATH = "/dashboard";
const PUBLIC_DASHBOARD_WIN_RATE_PATH = "/public-dashboard-win-rate.json";
const STYLE_ID = "vx-dashboard-snapshot-refinement-style";
const SCRIPT_ID = "vx-dashboard-snapshot-refinement-script";
const HOME_WIN_RATE_ID = "vx-home-proof-win-rate";
const DASHBOARD_OPEN_PNL_ID = "vx-dashboard-open-live-pnl";
const DASHBOARD_HEADER_CLASS = "vx-dashboard-header-grid";
const DASHBOARD_METRIC_CLASS = "vx-dashboard-metric-row";

const HOME_PREVIEW_COPY = "This preview mirrors the verified Day Trading block below. If the source is unavailable, values remain unavailable rather than being simulated.";

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
    if (depth === 0) {
      return { start: openStart, end: pattern.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
    }
  }
  return null;
}

function findTagByClass(html, tagName, className) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "i");
  const match = pattern.exec(html);
  if (!match) return null;
  return findTagRangeFromOpen(html, tagName, match.index);
}

function normalizedText(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\\s+/g, " ")
    .trim();
}

function addClassToOpeningTag(block, className) {
  if (!block || new RegExp(`\\b${escapeRegex(className)}\\b`).test(block.slice(0, block.indexOf(">") + 1))) return block;
  return block.replace(/^<([a-z0-9]+)\\b([^>]*)>/i, (match, tag, attrs) => {
    const classMatch = attrs.match(/\\bclass=(["'])([^"']*)\\1/i);
    if (!classMatch) return `<${tag}${attrs} class="${className}">`;
    const nextClass = `${classMatch[2]} ${className}`.trim();
    return `<${tag}${attrs.replace(classMatch[0], `class=${classMatch[1]}${nextClass}${classMatch[1]}`)}>`;
  });
}

function findChildByClassAndText(block, tagName, className, text) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "gi");
  let match;
  while ((match = pattern.exec(block))) {
    const range = findTagRangeFromOpen(block, tagName, match.index);
    if (!range) continue;
    const candidate = block.slice(range.start, range.end);
    if (normalizedText(candidate).includes(text)) return range;
    pattern.lastIndex = Math.max(pattern.lastIndex, range.end);
  }
  return null;
}

function removeRanges(block, ranges) {
  let result = block;
  for (const range of [...ranges].filter(Boolean).sort((a, b) => b.start - a.start)) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }
  return result;
}

function currentAppTestApi() {
  const mainApi = process.mainModule && process.mainModule.exports && process.mainModule.exports.__test;
  if (mainApi && typeof mainApi === "object") return mainApi;
  try {
    const appPath = require.resolve("./app.js");
    const appModule = require.cache[appPath];
    const cachedApi = appModule && appModule.exports && appModule.exports.__test;
    return cachedApi && typeof cachedApi === "object" ? cachedApi : null;
  } catch (_) {
    return null;
  }
}

function buildDashboardWinRatePayload(data) {
  const raw = data && data.summary && data.summary.win_rate;
  if (raw === "" || raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return { ok: true, win_rate: Number(value.toFixed(2)) };
}

function setNoStoreHeaders(res) {
  res.set({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
}

async function handlePublicDashboardWinRateRequest(req, res, dependencies = {}) {
  try {
    setNoStoreHeaders(res);
    const appApi = dependencies.appApi || currentAppTestApi();
    const getData = dependencies.getDashboardData || (appApi && appApi.getDashboardData);
    if (typeof getData !== "function") {
      return res.status(503).json({ ok: false, error: "dashboard_win_rate_unavailable" });
    }
    const payload = buildDashboardWinRatePayload(await getData());
    if (!payload) return res.status(503).json({ ok: false, error: "dashboard_win_rate_unavailable" });
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Public dashboard Win Rate error:", error && error.message ? error.message : error);
    return res.status(503).json({ ok: false, error: "dashboard_win_rate_unavailable" });
  }
}

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  const styles = `
<style id="${STYLE_ID}">
  .${DASHBOARD_HEADER_CLASS}{display:grid;grid-template-columns:minmax(320px,1.15fr) repeat(2,minmax(220px,.85fr));gap:14px;align-items:stretch;margin:0 0 8px}
  .vx-dashboard-heading-block{min-width:0;margin:0!important;height:100%;align-items:flex-start!important}
  .vx-dashboard-heading-block .brand{min-width:0}
  .vx-dashboard-system-card{min-width:0!important;width:auto!important;max-width:none!important;margin:0!important;height:100%}
  .vx-dashboard-updated{margin:0 0 14px!important}
  .vx-dashboard-other-system-notes{grid-template-columns:1fr!important;margin:14px 0 0!important}
  .${DASHBOARD_METRIC_CLASS}{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:12px!important;align-items:stretch!important}
  .${DASHBOARD_METRIC_CLASS}>*{min-width:0!important;width:auto!important;max-width:none!important}
  #${DASHBOARD_OPEN_PNL_ID}.positive{color:#00954f!important}
  #${DASHBOARD_OPEN_PNL_ID}.negative{color:#ef3f4a!important}
  #${DASHBOARD_OPEN_PNL_ID}.neutral{color:inherit!important}
  @media(max-width:1180px){.${DASHBOARD_HEADER_CLASS}{grid-template-columns:1fr}.${DASHBOARD_METRIC_CLASS}{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
  @media(max-width:760px){.${DASHBOARD_METRIC_CLASS}{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

const browserScript = `
<script id="${SCRIPT_ID}">
(() => {
  const formatMoney = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const setSignedClass = (el, value) => {
    if (!el) return;
    const n = Number(value);
    el.classList.remove('positive', 'negative', 'neutral');
    if (!Number.isFinite(n) || n === 0) el.classList.add('neutral');
    else if (n > 0) el.classList.add('positive');
    else el.classList.add('negative');
  };

  const setDashboardOpenPnlUnavailable = target => {
    if (!target) return;
    target.textContent = '—';
    setSignedClass(target, NaN);
  };

  let dashboardPnlTimer = null;
  let dashboardPnlBusy = false;
  const refreshDashboardOpenPnl = async () => {
    const target = document.getElementById('${DASHBOARD_OPEN_PNL_ID}');
    if (!target || dashboardPnlBusy || document.hidden) return;
    dashboardPnlBusy = true;
    try {
      const response = await fetch('/dashboard/live-pnl.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        setDashboardOpenPnlUnavailable(target);
        return;
      }
      const payload = await response.json();
      const positions = Array.isArray(payload && payload.positions) ? payload.positions : null;
      if (!positions) {
        setDashboardOpenPnlUnavailable(target);
        return;
      }
      let total = 0;
      for (const position of positions) {
        const raw = position && position.open_pnl;
        if (raw === '' || raw === null || raw === undefined) {
          setDashboardOpenPnlUnavailable(target);
          return;
        }
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          setDashboardOpenPnlUnavailable(target);
          return;
        }
        total += value;
      }
      target.textContent = formatMoney(total);
      setSignedClass(target, total);
    } catch (_) {
      setDashboardOpenPnlUnavailable(target);
    } finally {
      dashboardPnlBusy = false;
      if (dashboardPnlTimer) window.clearTimeout(dashboardPnlTimer);
      if (!document.hidden) dashboardPnlTimer = window.setTimeout(refreshDashboardOpenPnl, 2000);
    }
  };

  const refreshHomeWinRate = async () => {
    const target = document.getElementById('${HOME_WIN_RATE_ID}');
    if (!target || document.hidden) return;
    try {
      const response = await fetch('${PUBLIC_DASHBOARD_WIN_RATE_PATH}', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      const value = Number(payload && payload.win_rate);
      if (!Number.isFinite(value)) return;
      target.textContent = value.toFixed(2) + '%';
    } catch (_) {}
  };

  const boot = () => {
    refreshDashboardOpenPnl();
    refreshHomeWinRate();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (dashboardPnlTimer) window.clearTimeout(dashboardPnlTimer);
      dashboardPnlTimer = null;
      return;
    }
    refreshDashboardOpenPnl();
    refreshHomeWinRate();
  });
})();
</script>`;

function injectScript(html) {
  if (html.includes(`id="${SCRIPT_ID}"`)) return html;
  return html.includes("</body>") ? html.replace("</body>", `${browserScript}\n</body>`) : `${html}${browserScript}`;
}

function refineHome(html) {
  let result = String(html);
  result = result.replace(new RegExp(`<p\\b[^>]*\\bclass=(["'])[^"']*\\bvx-home-proof-preview-copy\\b[^"']*\\1[^>]*>\\s*${escapeRegex(HOME_PREVIEW_COPY)}\\s*<\\/p>`, "i"), "");
  if (!result.includes(`id="${HOME_WIN_RATE_ID}"`)) {
    const range = findTagByClass(result, "div", "vx-home-proof-grid");
    if (range) {
      const extra = `\n      <div><span>Live Open P&amp;L</span><strong data-vx-mirror="vx-home-live-open-pnl">—</strong></div>\n      <div><span>Win Rate</span><strong id="${HOME_WIN_RATE_ID}">—</strong></div>`;
      result = result.slice(0, range.closeStart) + extra + result.slice(range.closeStart);
    }
  }
  result = injectStyles(result);
  return injectScript(result);
}

function transformDashboardHero(html) {
  let result = String(html)
    .replace(/<h1>\\s*Vixale Live Strategy Dashboard\\s*<\\/h1>/i, "<h1>Vixale Live Day Trading Dashboard</h1>")
    .replace(/(<div\\b[^>]*\\bclass=(["'])[^"']*\\bsubtitle\\b[^"']*\\2[^>]*>)\\s*Private live forward-test \/ paper-trading tracker\\s*(<\\/div>)/i, "$1Private live day-trading forward-test / paper-trading tracker$3");

  if (result.includes(`class="${DASHBOARD_HEADER_CLASS}"`) || result.includes(`class='${DASHBOARD_HEADER_CLASS}'`)) return result;

  const heroRange = findTagByClass(result, "div", "hero");
  if (!heroRange) return result;
  let hero = result.slice(heroRange.start, heroRange.end);
  const topRange = findTagByClass(hero, "div", "topline");
  const notesRange = findTagByClass(hero, "div", "strategy-notes");
  if (!topRange || !notesRange || notesRange.start <= topRange.start) return result;

  let topBlock = hero.slice(topRange.start, topRange.end);
  const updatedRange = findTagByClass(topBlock, "div", "updated");
  let updatedBlock = "";
  if (updatedRange) {
    updatedBlock = addClassToOpeningTag(topBlock.slice(updatedRange.start, updatedRange.end), "vx-dashboard-updated");
    topBlock = topBlock.slice(0, updatedRange.start) + topBlock.slice(updatedRange.end);
  }
  topBlock = addClassToOpeningTag(topBlock, "vx-dashboard-heading-block");

  const notesBlock = hero.slice(notesRange.start, notesRange.end);
  const primeRange = findChildByClassAndText(notesBlock, "div", "strategy-note", "Vixale Prime");
  const edgeRange = findChildByClassAndText(notesBlock, "div", "strategy-note", "Vixale Edge");
  if (!primeRange || !edgeRange) return result;

  const primeBlock = addClassToOpeningTag(notesBlock.slice(primeRange.start, primeRange.end), "vx-dashboard-system-card");
  const edgeBlock = addClassToOpeningTag(notesBlock.slice(edgeRange.start, edgeRange.end), "vx-dashboard-system-card");
  let remainingNotes = removeRanges(notesBlock, [primeRange, edgeRange]);
  remainingNotes = findTagByClass(remainingNotes, "div", "strategy-note")
    ? addClassToOpeningTag(remainingNotes, "vx-dashboard-other-system-notes")
    : "";

  const header = `<div class="${DASHBOARD_HEADER_CLASS}">${topBlock}${primeBlock}${edgeBlock}</div>${updatedBlock}`;
  hero = hero.slice(0, topRange.start) + header + hero.slice(notesRange.end);

  let cardsRange = findTagByClass(hero, "div", "cards");
  if (cardsRange) {
    let cardsBlock = hero.slice(cardsRange.start, cardsRange.end);
    if (!cardsBlock.includes(`id="${DASHBOARD_OPEN_PNL_ID}"`)) {
      const closedPnlCard = findChildByClassAndText(cardsBlock, "div", "card", "Closed P&L Today");
      if (closedPnlCard) {
        const livePnlCard = `<div class="card vx-dashboard-live-open-pnl-card"><div class="label">Live Open P&amp;L</div><div id="${DASHBOARD_OPEN_PNL_ID}" class="value neutral">—</div></div>`;
        cardsBlock = cardsBlock.slice(0, closedPnlCard.end) + livePnlCard + cardsBlock.slice(closedPnlCard.end);
      }
    }
    cardsBlock = addClassToOpeningTag(cardsBlock, DASHBOARD_METRIC_CLASS);
    hero = hero.slice(0, cardsRange.start) + cardsBlock + hero.slice(cardsRange.end);
    if (remainingNotes) {
      cardsRange = findTagByClass(hero, "div", DASHBOARD_METRIC_CLASS);
      if (cardsRange) hero = hero.slice(0, cardsRange.end) + remainingNotes + hero.slice(cardsRange.end);
    }
  }

  return result.slice(0, heroRange.start) + hero + result.slice(heroRange.end);
}

function refineDashboard(html) {
  let result = transformDashboardHero(String(html));
  result = injectStyles(result);
  return injectScript(result);
}

function refinePage(html, path) {
  if (typeof html !== "string") return html;
  if (path === HOME_PATH) return refineHome(html);
  if (path === DASHBOARD_PATH) return refineDashboard(html);
  return html;
}

function installDashboardSnapshotRefinement(app) {
  app.get(PUBLIC_DASHBOARD_WIN_RATE_PATH, (req, res) => handlePublicDashboardWinRateRequest(req, res));
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || (path !== HOME_PATH && path !== DASHBOARD_PATH)) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithDashboardSnapshotRefinement(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) body = refinePage(body, path);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleDashboardSnapshotRefinementWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installDashboardSnapshotRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleDashboardSnapshotRefinementWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleDashboardSnapshotRefinementModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  DASHBOARD_PATH,
  PUBLIC_DASHBOARD_WIN_RATE_PATH,
  STYLE_ID,
  SCRIPT_ID,
  HOME_WIN_RATE_ID,
  DASHBOARD_OPEN_PNL_ID,
  DASHBOARD_HEADER_CLASS,
  DASHBOARD_METRIC_CLASS,
  HOME_PREVIEW_COPY,
  findTagRangeFromOpen,
  findTagByClass,
  normalizedText,
  addClassToOpeningTag,
  findChildByClassAndText,
  currentAppTestApi,
  buildDashboardWinRatePayload,
  handlePublicDashboardWinRateRequest,
  injectStyles,
  injectScript,
  refineHome,
  transformDashboardHero,
  refineDashboard,
  refinePage,
  installDashboardSnapshotRefinement,
  wrapExpress,
};
