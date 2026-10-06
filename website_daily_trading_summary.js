"use strict";

const Module = require("module");
const { google } = require("googleapis");
const { optionPnl, optionTradeFromRow } = require("./website_options_canonical_refinement");

const INDEX_PATH = "/daily-trading-summary";
const SITE_URL = "https://www.vixale.com";
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
const CACHE_MS = 60_000;
const RANGES = ["Trades!A:J", "Closed Trades!A:J", "Trade Metadata!A:H", "Option Journal!A:S"];

let sourceCache = { loadedAt: 0, source: null };

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function numberOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/[$,+]/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function dateKey(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return us[3] + "-" + us[1].padStart(2, "0") + "-" + us[2].padStart(2, "0");
  return "";
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parts = value.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return dt.getUTCFullYear() === parts[0] && dt.getUTCMonth() === parts[1] - 1 && dt.getUTCDate() === parts[2];
}

function formatDate(value) {
  if (!validDateKey(value)) return String(value || "");
  const parts = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

function formatTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:^|[T\s])(\d{1,2}):(\d{2})/);
  if (!match) return text || "—";
  const h = Number(match[1]);
  if (h < 0 || h > 23) return text || "—";
  return (h % 12 || 12) + ":" + match[2] + " " + (h >= 12 ? "PM" : "AM") + " ET";
}

function money(value) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function price(value) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
  return "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function prettyEvent(value) {
  const key = String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
  const names = {
    TP: "Take Profit",
    TARGET: "Take Profit",
    TAKE_PROFIT: "Take Profit",
    CLOSE_STOP: "Stop Loss",
    FLIP_CLOSE: "Stop Loss",
    SL: "Stop Loss",
    STOP_LOSS: "Stop Loss",
    EOD: "End-of-Day Close",
    EOD_CLOSE: "End-of-Day Close",
    EXTERNAL_CLOSE: "Manual Close",
    MANUAL_CLOSE: "Manual Close"
  };
  return names[key] || (key ? key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : "—");
}

function tradeKey(symbol, side, openTime) {
  return String(symbol || "").trim().toUpperCase() + "|" + String(side || "").trim().toUpperCase() + "|" + String(openTime || "").trim();
}

function metadataMaps(values) {
  const byTradeId = new Map();
  const byOpen = new Map();
  for (const row of (values || []).slice(1)) {
    const item = {
      system: String(row?.[2] || "").trim(),
      symbol: String(row?.[3] || "").trim().toUpperCase(),
      side: String(row?.[4] || "").trim().toUpperCase(),
      openTime: String(row?.[5] || "").trim()
    };
    const tradeId = String(row?.[1] || "").trim();
    if (tradeId && !byTradeId.has(tradeId)) byTradeId.set(tradeId, item);
    const key = tradeKey(item.symbol, item.side, item.openTime);
    if (item.symbol && item.side && item.openTime && !byOpen.has(key)) byOpen.set(key, item);
  }
  return { byTradeId, byOpen };
}

function buildDaySummary(source, targetDate) {
  if (!validDateKey(targetDate)) throw new Error("invalid_date");
  const maps = metadataMaps(source.metadataValues);
  const fills = [];
  const seenFill = new Set();

  for (const row of (source.tradesValues || []).slice(1)) {
    if (dateKey(row?.[0]) !== targetDate) continue;
    const event = String(row?.[3] || "").trim().toUpperCase();
    if (event !== "FILL" && event !== "ENTRY_FILL") continue;
    const symbol = String(row?.[1] || "").trim().toUpperCase();
    const side = String(row?.[2] || "").trim().toUpperCase();
    const openTime = String(row?.[0] || "").trim();
    const key = openTime + "|" + symbol + "|" + side;
    if (seenFill.has(key)) continue;
    seenFill.add(key);
    fills.push({ open_time: openTime, symbol, side });
  }

  const closed = [];
  for (const row of (source.closedValues || []).slice(1)) {
    if (dateKey(row?.[2]) !== targetDate) continue;
    const tradeId = String(row?.[0] || "").trim();
    const symbol = String(row?.[3] || "").trim().toUpperCase();
    const side = String(row?.[4] || "").trim().toUpperCase();
    const openTime = String(row?.[1] || "").trim();
    const meta = maps.byTradeId.get(tradeId) || maps.byOpen.get(tradeKey(symbol, side, openTime)) || {};
    closed.push({
      system: String(meta.system || "Vixale Day Trading").trim(),
      open_time: openTime,
      close_time: String(row?.[2] || "").trim(),
      symbol,
      side,
      entry: numberOrNull(row?.[5]),
      exit: numberOrNull(row?.[6]),
      size: numberOrNull(row?.[7]),
      result: numberOrNull(row?.[8]),
      event: String(row?.[9] || "").trim(),
      carried: dateKey(openTime) !== targetDate
    });
  }

  const options = [];
  for (const row of (source.optionValues || []).slice(1)) {
    const trade = optionTradeFromRow(row);
    if (dateKey(trade.exit_date) !== targetDate || trade.status !== "Closed") continue;
    options.push({
      symbol: String(trade.symbol || "").trim().toUpperCase(),
      strategy: String(trade.strategy || "").trim(),
      legs: String(trade.legs || "").trim(),
      expiration: String(trade.expiration || "").trim(),
      contracts: Number.isFinite(Number(trade.contracts)) ? Number(trade.contracts) : null,
      trade_type: String(trade.trade_type || "").trim(),
      entry_price: Number.isFinite(Number(trade.entry_price)) ? Number(trade.entry_price) : null,
      exit_time: String(trade.exit_time || "").trim(),
      exit_price: trade.exit_price === "" || !Number.isFinite(Number(trade.exit_price)) ? null : Number(trade.exit_price),
      result: optionPnl(trade)
    });
  }

  const results = closed.map(row => row.result).filter(Number.isFinite);
  const sameDay = closed.filter(row => !row.carried);
  const carried = closed.filter(row => row.carried);
  const sum = rows => Number(rows.map(row => row.result).filter(Number.isFinite).reduce((a, b) => a + b, 0).toFixed(2));

  return {
    date: targetDate,
    fills,
    closed,
    options,
    totals: {
      opened_count: fills.length,
      closed_count: closed.length,
      winners: results.filter(v => v > 0).length,
      losers: results.filter(v => v < 0).length,
      realized_pnl: Number(results.reduce((a, b) => a + b, 0).toFixed(2)),
      same_day_closed_count: sameDay.length,
      same_day_pnl: sum(sameDay),
      carried_closed_count: carried.length,
      carried_pnl: sum(carried),
      options_closed_count: options.length
    },
    has_activity: fills.length > 0 || closed.length > 0 || options.length > 0
  };
}

function availableDates(source) {
  const out = new Set();
  for (const row of (source.tradesValues || []).slice(1)) {
    const event = String(row?.[3] || "").trim().toUpperCase();
    if (event === "FILL" || event === "ENTRY_FILL") {
      const key = dateKey(row?.[0]);
      if (key) out.add(key);
    }
  }
  for (const row of (source.closedValues || []).slice(1)) {
    const key = dateKey(row?.[2]);
    if (key) out.add(key);
  }
  for (const row of (source.optionValues || []).slice(1)) {
    if (String(row?.[15] || "").trim().toLowerCase() !== "closed") continue;
    const key = dateKey(row?.[11]);
    if (key) out.add(key);
  }
  return [...out].sort((a, b) => b.localeCompare(a));
}

async function sheetsClient() {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("daily_summary_source_not_configured");
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
}

async function readSourceSheets() {
  const sheets = await sheetsClient();
  const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId: GOOGLE_SHEET_ID, ranges: RANGES });
  const ranges = response.data.valueRanges || [];
  return {
    tradesValues: ranges[0]?.values || [],
    closedValues: ranges[1]?.values || [],
    metadataValues: ranges[2]?.values || [],
    optionValues: ranges[3]?.values || []
  };
}

async function getSourceSnapshot(deps = {}) {
  const cache = deps.cache || sourceCache;
  const nowMs = Number.isFinite(deps.nowMs) ? deps.nowMs : Date.now();
  if (cache.source && nowMs - cache.loadedAt < CACHE_MS) return { source: cache.source, stale: false };
  try {
    const source = await (deps.readSourceSheets || readSourceSheets)();
    cache.source = source;
    cache.loadedAt = nowMs;
    if (!deps.cache) sourceCache = cache;
    return { source, stale: false };
  } catch (error) {
    if (cache.source) return { source: cache.source, stale: true };
    throw error;
  }
}

function head(title, description, canonical) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(description) + '">' +
    '<link rel="canonical" href="' + esc(canonical) + '">' +
    '<meta property="og:type" content="article"><meta property="og:site_name" content="Vixale">' +
    '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(description) + '">' +
    '<meta property="og:url" content="' + esc(canonical) + '"><meta name="twitter:card" content="summary">' +
    '<meta name="twitter:title" content="' + esc(title) + '"><meta name="twitter:description" content="' + esc(description) + '">' +
    '<link rel="icon" href="/favicon.ico"><style>' +
    ':root{--bg:#fbfcfb;--paper:#fff;--ink:#101413;--muted:#68736f;--line:#e3e9e5;--green:#078f51;--soft:#e9fff4;--red:#b42318}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.5}' +
    'a{color:inherit}.wrap{width:min(1160px,calc(100% - 32px));margin:auto}.top{border-bottom:1px solid var(--line);background:#fff}.top .wrap{min-height:66px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{font-size:20px;font-weight:700;letter-spacing:.12em;text-decoration:none}.nav{display:flex;gap:14px;flex-wrap:wrap}.nav a{font-size:13px;text-decoration:none;color:#425049}' +
    '.hero{padding:56px 0 22px}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);font-weight:700}.hero h1{font-size:clamp(36px,5vw,60px);line-height:1.04;letter-spacing:-.04em;margin:10px 0 14px;max-width:920px}.lead{font-size:18px;color:#56645e;max-width:800px}.share{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.btn{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:#fff;text-decoration:none;font-size:13px;cursor:pointer}.btn.primary{background:var(--green);border-color:var(--green);color:#fff}' +
    '.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:20px 0 30px}.stat,.card{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px}.stat small{display:block;color:var(--muted);font-size:12px}.stat strong{display:block;font-size:24px;margin-top:5px}.positive{color:var(--green)}.negative{color:var(--red)}.section{margin:28px 0 38px}.section h2{font-size:28px;margin:0 0 8px}.note{color:var(--muted);margin:0 0 15px}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:#fff}.table{width:100%;border-collapse:collapse;min-width:900px}.table th,.table td{text-align:left;padding:12px 13px;border-bottom:1px solid var(--line);font-size:13px;white-space:nowrap}.table th{font-size:11px;color:#5f6d67;text-transform:uppercase;letter-spacing:.06em}.table tr:last-child td{border-bottom:0}.pill{display:inline-flex;padding:3px 8px;border-radius:999px;background:var(--soft);color:var(--green);font-size:11px;font-weight:700}.pill.short{background:#fff0ee;color:#a63d32}' +
    '.cards,.archive{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card h3{margin:0 0 6px}.meta{color:var(--muted);font-size:13px}.disclosure{background:#f4f7f4;border:1px solid var(--line);border-radius:18px;padding:18px;color:#56645e;font-size:13px}.archive a{text-decoration:none}.archive strong{font-size:18px}.archive span{display:block;color:var(--muted);font-size:13px;margin-top:6px}.stale{background:#fff8e6;border:1px solid #efcf83;color:#765b12;padding:10px 12px;border-radius:12px;margin:14px 0}.footer{border-top:1px solid var(--line);margin-top:50px;padding:28px 0;color:var(--muted);font-size:12px}' +
    '@media(max-width:900px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cards,.archive{grid-template-columns:1fr 1fr}.nav{display:none}}@media(max-width:560px){.wrap{width:min(100% - 22px,1160px)}.stats,.cards,.archive{grid-template-columns:1fr}.hero{padding-top:38px}}' +
    '</style></head><body>';
}

function header() {
  return '<header class="top"><div class="wrap"><a class="brand" href="/">VIXALE</a><nav class="nav"><a href="/trading-systems">Trading Systems</a><a href="/results">Results</a><a href="' + INDEX_PATH + '">Daily Recaps</a><a href="/services">Services</a><a href="/access">Request Free Access</a></nav></div></header>';
}

function resultClass(value) {
  return !Number.isFinite(Number(value)) || Number(value) === 0 ? "" : Number(value) > 0 ? "positive" : "negative";
}

function closedRows(rows) {
  if (!rows.length) return '<tr><td colspan="10">No closed trades recorded for this date.</td></tr>';
  return rows.map(row => '<tr>' +
    '<td>' + esc(row.system) + '</td><td><strong>' + esc(row.symbol) + '</strong></td>' +
    '<td><span class="pill ' + (row.side === "SHORT" ? "short" : "") + '">' + esc(row.side) + '</span></td>' +
    '<td>' + esc(formatTime(row.open_time)) + (row.carried ? '<br><small>Prior date</small>' : '') + '</td>' +
    '<td>' + esc(formatTime(row.close_time)) + '</td><td>' + esc(row.size ?? "—") + '</td>' +
    '<td>' + esc(price(row.entry)) + '</td><td>' + esc(price(row.exit)) + '</td><td>' + esc(prettyEvent(row.event)) + '</td>' +
    '<td class="' + resultClass(row.result) + '"><strong>' + esc(money(row.result)) + '</strong></td></tr>').join("");
}

function optionCards(rows) {
  if (!rows.length) return "";
  return '<section class="section"><h2>Options — Closed Journal Activity</h2><p class="note">Public recap includes closed Option Journal records only; open option positions remain private.</p><div class="cards">' +
    rows.map(row => '<article class="card"><h3>' + esc(row.symbol || "Options") + ' · ' + esc(row.strategy || "Trade") + '</h3>' +
      '<div class="meta">' + esc(row.trade_type || "") + (row.contracts !== null ? ' · ' + esc(row.contracts) + ' contract(s)' : '') + '</div>' +
      '<p>' + esc(row.legs || "—").replace(/\r?\n/g, "<br>") + '</p>' +
      '<div class="meta">Expiration ' + esc(row.expiration || "—") + ' · Entry ' + esc(price(row.entry_price)) + ' · Exit ' + esc(price(row.exit_price)) + ' at ' + esc(formatTime(row.exit_time)) + '</div>' +
      '<div class="meta">Result <strong class="' + resultClass(row.result) + '">' + esc(money(row.result)) + '</strong></div></article>').join("") +
    '</div></section>';
}

function description(summary) {
  return summary.totals.closed_count + " positions closed, " + money(summary.totals.realized_pnl) + " recorded realized P&L, " + summary.totals.opened_count + " new fills recorded.";
}

function renderDayPage(summary, stale = false) {
  const canonical = SITE_URL + INDEX_PATH + "/" + summary.date;
  const title = "Vixale Daily Trading Summary — " + summary.date;
  const t = summary.totals;
  return head(title, description(summary), canonical) + header() +
    '<main class="wrap"><section class="hero"><div class="eyebrow">Daily Trading Recap</div><h1>Vixale Daily Trading Summary</h1><p class="lead">' + esc(formatDate(summary.date)) + ' · Executed trading activity and recorded realized results from the Vixale ledger.</p>' +
    (stale ? '<div class="stale">Showing the last successfully loaded ledger snapshot.</div>' : '') +
    '<div class="share"><button class="btn primary" id="copy-link">Copy Link</button><a class="btn" id="share-x" target="_blank" rel="noopener">Share on X</a><a class="btn" id="share-linkedin" target="_blank" rel="noopener">Share on LinkedIn</a></div></section>' +
    '<section class="stats"><div class="stat"><small>New fills</small><strong>' + t.opened_count + '</strong></div><div class="stat"><small>Closed</small><strong>' + t.closed_count + '</strong></div><div class="stat"><small>Winners / Losers</small><strong>' + t.winners + ' / ' + t.losers + '</strong></div><div class="stat"><small>Realized P&L</small><strong class="' + resultClass(t.realized_pnl) + '">' + esc(money(t.realized_pnl)) + '</strong></div><div class="stat"><small>Carried closes</small><strong>' + t.carried_closed_count + '</strong></div></section>' +
    '<section class="section"><h2>Closed Trades</h2><p class="note">Recorded P&L comes directly from Closed Trades. ' + (t.carried_closed_count ? t.carried_closed_count + ' position(s) were opened on prior dates.' : 'All closes shown were opened the same day.') + '</p><div class="table-wrap"><table class="table"><thead><tr><th>System</th><th>Symbol</th><th>Side</th><th>Opened</th><th>Closed</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Exit Reason</th><th>P&L</th></tr></thead><tbody>' + closedRows(summary.closed) + '</tbody></table></div></section>' +
    '<section class="section"><div class="disclosure"><strong>Public data boundary.</strong> New-fill totals are counted from broker-confirmed ledger entries, but symbols/entry details for positions that did not close on this date are intentionally not published here. Historical Open Positions/Pending state is not reconstructed after the fact. The private 4:05 PM email may include those live states. NFA — Not Financial Advice.</div></section>' +
    optionCards(summary.options) +
    '</main><footer class="footer"><div class="wrap">Vixale · <a href="' + INDEX_PATH + '">Daily Recaps</a> · <a href="/results">Results</a> · <a href="/closed-trades">Closed Trades ledger</a></div></footer>' +
    '<script>(function(){var u=location.href,t=' + JSON.stringify(title) + ';var x=document.getElementById("share-x"),l=document.getElementById("share-linkedin"),c=document.getElementById("copy-link");if(x)x.href="https://twitter.com/intent/tweet?text="+encodeURIComponent(t)+"&url="+encodeURIComponent(u);if(l)l.href="https://www.linkedin.com/sharing/share-offsite/?url="+encodeURIComponent(u);if(c)c.onclick=async function(){try{await navigator.clipboard.writeText(u);c.textContent="Link Copied"}catch(e){window.prompt("Copy this link",u)}}})();</script></body></html>';
}

function renderIndexPage(items, stale = false) {
  const canonical = SITE_URL + INDEX_PATH;
  const title = "Vixale Daily Trading Summaries";
  const cards = items.length ? items.map(summary => '<a class="card" href="' + INDEX_PATH + '/' + esc(summary.date) + '"><strong>' + esc(formatDate(summary.date)) + '</strong><span>' + esc(description(summary)) + '</span></a>').join("") : '<div class="card">No daily recaps are available yet.</div>';
  return head(title, "Shareable Vixale daily trading recaps built from recorded trading activity.", canonical) + header() +
    '<main class="wrap"><section class="hero"><div class="eyebrow">Vixale Journal</div><h1>Daily Trading Summaries</h1><p class="lead">Shareable daily recaps of recorded trading activity and realized results across the available Vixale ledger history.</p>' +
    (stale ? '<div class="stale">Showing the last successfully loaded ledger snapshot.</div>' : '') + '</section><section class="archive">' + cards + '</section>' +
    '<section class="section"><div class="disclosure">Daily recaps publish closed-trade details and aggregate new-fill counts. They do not reveal still-open Day Trading positions or reconstruct historical Pending/Open state. NFA — Not Financial Advice.</div></section></main>' +
    '<footer class="footer"><div class="wrap">Vixale · <a href="/results">Results</a> · <a href="/closed-trades">Closed Trades ledger</a></div></footer></body></html>';
}

function isRussianHost(req) {
  const host = String(req.headers?.host || "").split(":")[0].toLowerCase();
  return host === "ru.vixale.com" || host.endsWith(".ru.vixale.com");
}

function setHeaders(res) {
  res.set({ "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff" });
}

async function handleIndex(req, res, deps = {}) {
  if (isRussianHost(req)) return res.redirect(302, SITE_URL + INDEX_PATH);
  try {
    const snapshot = await getSourceSnapshot(deps);
    const items = availableDates(snapshot.source).map(date => buildDaySummary(snapshot.source, date)).filter(row => row.has_activity);
    setHeaders(res);
    return res.status(200).type("html").send(renderIndexPage(items, snapshot.stale));
  } catch (error) {
    console.error("Daily trading summary index error:", error?.message || error);
    return res.status(503).type("text").send("Daily trading summaries are temporarily unavailable.");
  }
}

async function handleDay(req, res, deps = {}) {
  const targetDate = String(req.params?.date || "").trim();
  if (isRussianHost(req)) return res.redirect(302, SITE_URL + INDEX_PATH + "/" + encodeURIComponent(targetDate));
  if (!validDateKey(targetDate)) return res.status(404).type("text").send("Daily trading summary not found.");
  try {
    const snapshot = await getSourceSnapshot(deps);
    const summary = buildDaySummary(snapshot.source, targetDate);
    if (!summary.has_activity) return res.status(404).type("text").send("No trading activity was recorded for this date.");
    setHeaders(res);
    return res.status(200).type("html").send(renderDayPage(summary, snapshot.stale));
  } catch (error) {
    console.error("Daily trading summary page error:", error?.message || error);
    return res.status(503).type("text").send("Daily trading summary is temporarily unavailable.");
  }
}

function install(app) {
  app.get(INDEX_PATH, (req, res) => handleIndex(req, res));
  app.get(INDEX_PATH + "/:date", (req, res) => handleDay(req, res));
}

function copyStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleDailyTradingSummaryWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    install(app);
    return app;
  }
  copyStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleDailyTradingSummaryWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function dailySummaryModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  INDEX_PATH, SITE_URL, CACHE_MS, RANGES,
  numberOrNull, dateKey, validDateKey, formatDate, formatTime, money, price, prettyEvent,
  metadataMaps, buildDaySummary, availableDates, getSourceSnapshot, renderDayPage, renderIndexPage,
  handleIndex, handleDay, install, wrapExpress
};
