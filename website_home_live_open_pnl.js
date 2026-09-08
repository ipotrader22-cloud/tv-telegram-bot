"use strict";

const Module = require("module");
const { google } = require("googleapis");

const HOME_PATH = "/";
const LIVE_OPEN_PNL_PATH = "/public-live-open-pnl.json";
const OPEN_POSITIONS_RANGE = "Open Positions!A:L";
const OPEN_POSITIONS_CACHE_MS = 30_000;
const STYLE_ID = "vx-home-live-open-pnl-style";
const SCRIPT_ID = "vx-home-live-open-pnl-script";
const CARD_ID = "vx-home-live-open-pnl";

let openPositionsCache = { loadedAt: 0, rows: null };
let sheetsClientPromise = null;

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

async function getSheetsClient() {
  if (sheetsClientPromise) return sheetsClientPromise;
  sheetsClientPromise = Promise.resolve().then(() => {
    const spreadsheetId = String(process.env.GOOGLE_SHEET_ID || "").trim();
    const rawCredentials = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
    if (!spreadsheetId || !rawCredentials) throw new Error("Google Sheets live P&L source is not configured.");
    const credentials = JSON.parse(rawCredentials);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return google.sheets({ version: "v4", auth });
  });
  return sheetsClientPromise;
}

async function readOpenPositionRows() {
  const spreadsheetId = String(process.env.GOOGLE_SHEET_ID || "").trim();
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID is not configured.");
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: OPEN_POSITIONS_RANGE,
  });
  return response.data.values || [];
}

async function getOpenPositionRowsSnapshot(dependencies = {}) {
  const nowMs = Number.isFinite(dependencies.nowMs) ? dependencies.nowMs : Date.now();
  const cache = dependencies.cache || openPositionsCache;
  if (Array.isArray(cache.rows) && nowMs - Number(cache.loadedAt || 0) < OPEN_POSITIONS_CACHE_MS) {
    return cache.rows;
  }

  const reader = dependencies.readOpenPositionRows || readOpenPositionRows;
  const rows = await reader();
  if (!Array.isArray(rows)) throw new Error("Open Positions source returned an invalid payload.");
  cache.rows = rows;
  cache.loadedAt = nowMs;
  if (!dependencies.cache) openPositionsCache = cache;
  return rows;
}

function buildLiveOpenPnlPayload(rows, appApi = currentAppTestApi()) {
  if (!appApi ||
      typeof appApi.parseOpenPositionRow !== "function" ||
      typeof appApi.rememberPublicDashboardPnlPositions !== "function" ||
      typeof appApi.publicDashboardLivePnlPayload !== "function") {
    return null;
  }

  const sourceRows = Array.isArray(rows) ? rows : [];
  const parsed = sourceRows
    .slice(1)
    .filter(row => String(row && row[0] || "").trim())
    .map(row => appApi.parseOpenPositionRow(row));

  appApi.rememberPublicDashboardPnlPositions(parsed);
  const livePayload = appApi.publicDashboardLivePnlPayload();
  const positions = Array.isArray(livePayload && livePayload.positions)
    ? livePayload.positions
    : null;
  if (!positions) return null;

  let total = 0;
  for (const position of positions) {
    const raw = position && position.open_pnl;
    if (raw === "" || raw === null || raw === undefined) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    total += value;
  }

  return {
    ok: true,
    open_pnl: Number(total.toFixed(2)),
  };
}

function setNoStoreHeaders(res) {
  res.set({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
}

async function handleLiveOpenPnlRequest(req, res, dependencies = {}) {
  try {
    setNoStoreHeaders(res);
    const rows = await getOpenPositionRowsSnapshot(dependencies);
    const appApi = dependencies.appApi || currentAppTestApi();
    const payload = buildLiveOpenPnlPayload(rows, appApi);
    if (!payload) return res.status(503).json({ ok: false, error: "live_open_pnl_unavailable" });
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Homepage live open P&L error:", error && error.message ? error.message : error);
    return res.status(503).json({ ok: false, error: "live_open_pnl_unavailable" });
  }
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const pattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  pattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = pattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${tagName}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, end: pattern.lastIndex };
  }
  return null;
}

const styles = `
<style id="${STYLE_ID}">
  .vx-home-live-strip{grid-template-columns:repeat(5,minmax(0,1fr))}
  @media(max-width:900px){.vx-home-live-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const card = document.getElementById('${CARD_ID}');
  if (!card) return;
  let timer = null;
  let inFlight = false;
  let stopped = false;

  const money = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const apply = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    card.textContent = money(n);
    card.classList.remove('positive', 'negative');
    if (n > 0) card.classList.add('positive');
    else if (n < 0) card.classList.add('negative');
  };

  const schedule = (delay = 2000) => {
    if (timer) window.clearTimeout(timer);
    timer = null;
    if (stopped || document.hidden) return;
    timer = window.setTimeout(refresh, delay);
  };

  async function refresh() {
    if (inFlight || stopped || document.hidden) return;
    inFlight = true;
    try {
      const response = await fetch('${LIVE_OPEN_PNL_PATH}', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload && payload.ok) apply(payload.open_pnl);
    } catch (_) {
    } finally {
      inFlight = false;
      schedule(2000);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer) window.clearTimeout(timer);
      timer = null;
      return;
    }
    schedule(100);
  });

  schedule(100);
})();
</script>`;

function injectLiveOpenPnl(html, path = HOME_PATH) {
  if (typeof html !== "string" || path !== HOME_PATH) return html;
  if (html.includes(`id="${CARD_ID}"`)) return html;

  const marker = '<div class="vx-home-live-strip">';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const range = findTagRangeFromOpen(html, "div", start);
  if (!range) return html;

  const card = `<div class="vx-home-live-card"><div class="vx-home-live-label">Live Open P&amp;L</div><div id="${CARD_ID}" class="vx-home-live-value">—</div></div>`;
  const closeLength = "</div>".length;
  let result = html.slice(0, range.end - closeLength) + card + html.slice(range.end - closeLength);

  if (!result.includes(`id="${STYLE_ID}"`)) {
    result = result.includes("</head>")
      ? result.replace("</head>", `${styles}\n</head>`)
      : `${styles}${result}`;
  }
  if (!result.includes(`id="${SCRIPT_ID}"`)) {
    result = result.includes("</body>")
      ? result.replace("</body>", `${script}\n</body>`)
      : `${result}${script}`;
  }
  return result;
}

function installHomeLiveOpenPnl(app) {
  app.get(LIVE_OPEN_PNL_PATH, (req, res) => handleLiveOpenPnlRequest(req, res));
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    if (path !== HOME_PATH || (req.method !== "GET" && req.method !== "HEAD")) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithHomeLiveOpenPnl(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = injectLiveOpenPnl(body, path);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleHomeLiveOpenPnlWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installHomeLiveOpenPnl(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleHomeLiveOpenPnlWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleHomeLiveOpenPnlModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  LIVE_OPEN_PNL_PATH,
  OPEN_POSITIONS_RANGE,
  OPEN_POSITIONS_CACHE_MS,
  STYLE_ID,
  SCRIPT_ID,
  CARD_ID,
  currentAppTestApi,
  readOpenPositionRows,
  getOpenPositionRowsSnapshot,
  buildLiveOpenPnlPayload,
  handleLiveOpenPnlRequest,
  findTagRangeFromOpen,
  injectLiveOpenPnl,
  installHomeLiveOpenPnl,
  wrapExpress,
};
