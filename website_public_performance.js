"use strict";

const Module = require("module");
const { google } = require("googleapis");

const PERFORMANCE_PATH = "/public-performance.json";
const OPEN_POSITIONS_SHEET = "Open Positions";
const PENDING_SHEET = "Pending";
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

function buildRealizedEquityCurve(closedValues) {
  const dailyPnlByDate = new Map();
  for (const row of (closedValues || []).slice(1)) {
    const date = closedTradeDateKey(row?.[2]);
    const rawResult = row?.[8];
    if (!date || String(rawResult ?? "").trim() === "") continue;
    const realizedPnl = cleanNumber(rawResult);
    if (realizedPnl === "") continue;
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
  return { points, total_realized_pnl: points.length ? points[points.length - 1].cumulative_pnl : 0 };
}

function buildDashboardSummary(closedValues, openValues, pendingValues, now = new Date()) {
  const openRows = (openValues || []).slice(1).filter(row => String(row?.[0] || "").trim());
  const pendingRows = (pendingValues || []).slice(1).filter(row => String(row?.[0] || "").trim());
  const workingExitCount = openRows.filter(row => String(row?.[6] ?? "").trim() !== "" && String(row?.[7] ?? "").trim() !== "").length;
  const closedRows = (closedValues || []).slice(1).filter(row => String(row?.[0] || "").trim());
  const pnlRows = closedRows.map(row => ({ row, pnl: cleanNumber(row?.[8]) })).filter(item => String(item.row?.[8] ?? "").trim() !== "" && item.pnl !== "");
  const today = newYorkDateKey(now);
  const closedToday = closedRows.filter(row => closedTradeDateKey(row?.[2]) === today);
  const closedPnlToday = closedToday.reduce((sum, row) => {
    const pnl = cleanNumber(row?.[8]);
    return sum + (pnl === "" ? 0 : pnl);
  }, 0);
  const totalClosedPnl = pnlRows.reduce((sum, item) => sum + item.pnl, 0);
  const winners = pnlRows.filter(item => item.pnl > 0).length;
  const winRate = pnlRows.length ? (winners / pnlRows.length) * 100 : 0;
  return {
    open_count: openRows.length,
    working_count: pendingRows.length + workingExitCount,
    closed_count_today: closedToday.length,
    closed_pnl_today: Number(closedPnlToday.toFixed(2)),
    total_closed_pnl: Number(totalClosedPnl.toFixed(2)),
    win_rate: Number(winRate.toFixed(2)),
  };
}

function buildPublicPerformance(closedValues, now = new Date(), openValues = [], pendingValues = []) {
  return {
    updated_at: now.toISOString(),
    summary: buildDashboardSummary(closedValues, openValues, pendingValues, now),
    equity_curve: buildRealizedEquityCurve(closedValues),
  };
}

async function createSheetsClient() {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("Google Sheets performance source is not configured.");
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
}

async function readPublicPerformanceSheets() {
  const sheets = await createSheetsClient();
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: GOOGLE_SHEET_ID,
    ranges: [`${OPEN_POSITIONS_SHEET}!A:H`, `${PENDING_SHEET}!A:J`, `${CLOSED_TRADES_SHEET}!A:I`],
  });
  const ranges = response.data.valueRanges || [];
  return {
    openValues: ranges[0]?.values || [],
    pendingValues: ranges[1]?.values || [],
    closedValues: ranges[2]?.values || [],
  };
}

async function readClosedTrades() {
  const sheets = await createSheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: `${CLOSED_TRADES_SHEET}!A:I` });
  return response.data.values || [];
}

async function getPublicPerformanceSnapshot(dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const nowMs = Number.isFinite(dependencies.nowMs) ? dependencies.nowMs : Date.now();
  const cache = dependencies.cache || performanceCache;
  if (cache.payload && nowMs - cache.loadedAt < CACHE_MS) return { ...cache.payload, stale: false };
  try {
    let source;
    if (dependencies.readPerformanceSheets) source = await dependencies.readPerformanceSheets();
    else if (dependencies.readClosedTrades) {
      source = { closedValues: await dependencies.readClosedTrades(), openValues: dependencies.openValues || [], pendingValues: dependencies.pendingValues || [] };
    } else source = await readPublicPerformanceSheets();
    const payload = buildPublicPerformance(source?.closedValues || [], now, source?.openValues || [], source?.pendingValues || []);
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
  res.set({ "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0" });
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

function installPublicPerformance(app) { app.get(PERFORMANCE_PATH, (req, res) => handlePublicPerformanceRequest(req, res)); }
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
  function wrappedExpress(...args) { const app = expressFactory(...args); installPublicPerformance(app); return app; }
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
  PERFORMANCE_PATH, OPEN_POSITIONS_SHEET, PENDING_SHEET, CLOSED_TRADES_SHEET, CACHE_MS,
  cleanNumber, closedTradeDateKey, newYorkDateKey, buildRealizedEquityCurve, buildDashboardSummary,
  buildPublicPerformance, readPublicPerformanceSheets, readClosedTrades, getPublicPerformanceSnapshot,
  handlePublicPerformanceRequest, installPublicPerformance, wrapExpress,
};
