"use strict";

const Module = require("module");
const { google } = require("googleapis");

const PERFORMANCE_PATH = "/public-performance.json";
const CLOSED_TRADES_SHEET = "Closed Trades";
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
const CACHE_MS = 60_000;

let performanceCache = { loadedAt: 0, payload: null };

function cleanNumber(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).replace(/\$/g, "").replace(/,/g, "").replace(/\+/g, "").trim();
  const number = Number(text);
  return Number.isFinite(number) ? number : "";
}

function closedTradeDateKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;

  return "";
}

function newYorkDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildPublicPerformance(closedValues, now = new Date()) {
  const rows = (closedValues || []).slice(1).filter(row => String(row?.[0] || "").trim());
  const dailyPnlByDate = new Map();
  const pnlRows = [];

  for (const row of rows) {
    const date = closedTradeDateKey(row?.[2]);
    const rawResult = row?.[8];
    const realizedPnl = cleanNumber(rawResult);
    if (String(rawResult ?? "").trim() !== "" && realizedPnl !== "") pnlRows.push({ date, realizedPnl });
    if (!date || String(rawResult ?? "").trim() === "" || realizedPnl === "") continue;
    dailyPnlByDate.set(date, (dailyPnlByDate.get(date) || 0) + realizedPnl);
  }

  let cumulativePnl = 0;
  const points = [...dailyPnlByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dailyPnlRaw]) => {
      const dailyPnl = Number(dailyPnlRaw.toFixed(2));
      cumulativePnl = Number((cumulativePnl + dailyPnl).toFixed(2));
      return { date, daily_pnl: dailyPnl, cumulative_pnl: cumulativePnl };
    });

  const today = newYorkDateKey(now);
  const closedToday = rows.filter(row => String(row?.[2] || "").slice(0, 10) === today);
  const closedPnlToday = closedToday.reduce((sum, row) => {
    const realizedPnl = cleanNumber(row?.[8]);
    return sum + (realizedPnl === "" ? 0 : realizedPnl);
  }, 0);
  const totalClosedPnl = pnlRows.reduce((sum, row) => sum + row.realizedPnl, 0);
  const winners = pnlRows.filter(row => row.realizedPnl > 0).length;
  const winRate = pnlRows.length ? (winners / pnlRows.length) * 100 : 0;

  return {
    updated_at: now.toISOString(),
    summary: {
      closed_count_today: closedToday.length,
      closed_pnl_today: Number(closedPnlToday.toFixed(2)),
      total_closed_pnl: Number(totalClosedPnl.toFixed(2)),
      win_rate: Number(winRate.toFixed(2)),
    },
    equity_curve: {
      points,
      total_realized_pnl: points.length ? points[points.length - 1].cumulative_pnl : 0,
    },
  };
}

async function createSheetsClient() {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Google Sheets performance source is not configured.");
  }
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function readClosedTrades() {
  const sheets = await createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${CLOSED_TRADES_SHEET}!A:I`,
  });
  return response.data.values || [];
}

async function getPublicPerformanceSnapshot(dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const nowMs = Number.isFinite(dependencies.nowMs) ? dependencies.nowMs : Date.now();
  const read = dependencies.readClosedTrades || readClosedTrades;
  const cache = dependencies.cache || performanceCache;

  if (cache.payload && nowMs - cache.loadedAt < CACHE_MS) {
    return { ...cache.payload, stale: false };
  }

  try {
    const values = await read();
    const payload = buildPublicPerformance(values, now);
    cache.loadedAt = nowMs;
    cache.payload = payload;
    if (!dependencies.cache) performanceCache = cache;
    return { ...payload, stale: false };
  } catch (error) {
    if (cache.payload) return { ...cache.payload, stale: true };
    throw error;
  }
}

function setPublicPerformanceHeaders(res) {
  res.set({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
}

async function handlePublicPerformanceRequest(req, res, dependencies = {}) {
  try {
    setPublicPerformanceHeaders(res);
    const snapshot = await getPublicPerformanceSnapshot(dependencies);
    return res.status(200).json({ ok: true, ...snapshot });
  } catch (error) {
    console.error("Public performance preview error:", error?.message || error);
    return res.status(503).json({ ok: false, error: "performance_unavailable" });
  }
}

function installPublicPerformance(app) {
  app.get(PERFORMANCE_PATH, (req, res) => handlePublicPerformanceRequest(req, res));
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
  if (typeof expressFactory !== "function" || expressFactory.__vixalePublicPerformanceWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installPublicPerformance(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixalePublicPerformanceWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixalePublicPerformanceModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  PERFORMANCE_PATH,
  CLOSED_TRADES_SHEET,
  CACHE_MS,
  cleanNumber,
  closedTradeDateKey,
  newYorkDateKey,
  buildPublicPerformance,
  getPublicPerformanceSnapshot,
  handlePublicPerformanceRequest,
  installPublicPerformance,
  wrapExpress,
};
