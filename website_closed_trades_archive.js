"use strict";

const Module = require("module");
const { google } = require("googleapis");

const ARCHIVE_PATH = "/closed-trades";
const CLOSED_TRADES_SHEET = "Closed Trades";
const STYLE_ID = "vx-closed-trades-archive-style";
const SCRIPT_ID = "vx-closed-trades-archive-script";
const SNAPSHOT_TIMEOUT_MS = 4500;
const CACHE_MS = 60_000;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";

let archiveCache = { loadedAt: 0, payload: null };

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function buildClosedTradesArchive(closedValues, now = new Date()) {
  const trades = (closedValues || [])
    .slice(1)
    .map(row => {
      const entry = cleanNumber(row?.[5]);
      const exit = cleanNumber(row?.[6]);
      const size = cleanNumber(row?.[7]);
      const result = cleanNumber(row?.[8]);
      return {
        close_time: String(row?.[2] || "").trim(),
        symbol: String(row?.[3] || "").trim().toUpperCase(),
        side: String(row?.[4] || "").trim().toUpperCase(),
        entry: entry === "" ? null : entry,
        exit: exit === "" ? null : exit,
        size: size === "" ? null : size,
        result: result === "" ? null : Number(result.toFixed(2)),
        event: String(row?.[9] || "").trim(),
      };
    })
    .filter(row => row.close_time || row.symbol || row.result !== null)
    .sort((a, b) => {
      const dateA = closedTradeDateKey(a.close_time);
      const dateB = closedTradeDateKey(b.close_time);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(b.close_time).localeCompare(String(a.close_time));
    });

  const pnlRows = trades.filter(row => row.result !== null);
  const totalRealizedPnl = pnlRows.reduce((sum, row) => sum + row.result, 0);
  const winners = pnlRows.filter(row => row.result > 0).length;
  const dates = trades.map(row => closedTradeDateKey(row.close_time)).filter(Boolean).sort();

  return {
    updated_at: now.toISOString(),
    summary: {
      total_trades: trades.length,
      total_realized_pnl: Number(totalRealizedPnl.toFixed(2)),
      win_rate: pnlRows.length ? Number(((winners / pnlRows.length) * 100).toFixed(2)) : 0,
      first_close_date: dates[0] || "",
      last_close_date: dates[dates.length - 1] || "",
    },
    trades,
  };
}

async function createSheetsClient() {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Google Sheets closed-trades archive source is not configured.");
  }
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function readClosedTradesArchive() {
  const sheets = await createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${CLOSED_TRADES_SHEET}!A:J`,
  });
  return response.data.values || [];
}

async function getClosedTradesArchiveSnapshot(dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const nowMs = Number.isFinite(dependencies.nowMs) ? dependencies.nowMs : Date.now();
  const cache = dependencies.cache || archiveCache;
  const read = dependencies.readClosedTradesArchive || readClosedTradesArchive;

  if (cache.payload && nowMs - cache.loadedAt < CACHE_MS) {
    return { ...cache.payload, stale: false };
  }

  try {
    const values = await read();
    const payload = buildClosedTradesArchive(values, now);
    cache.loadedAt = nowMs;
    cache.payload = payload;
    if (!dependencies.cache) archiveCache = cache;
    return { ...payload, stale: false };
  } catch (error) {
    if (cache.payload) return { ...cache.payload, stale: true };
    throw error;
  }
}

function replaceDirectTextLink(html, oldText, href, newText) {
  const pattern = new RegExp(`<a\\b([^>]*)>\\s*${escapeRegex(oldText)}\\s*<\\/a>`, "g");
  return html.replace(pattern, `<a href="${href}">${newText}</a>`);
}

function refineGlobalArchiveLinks(html) {
  if (typeof html !== "string") return html;
  let result = replaceDirectTextLink(html, "Live System", "/", "Home");
  result = result.replace(
    /<span id="vx-home-equity-status">[\s\S]*?<\/span>/g,
    `<a id="vx-home-equity-status" class="vx-home-equity-ledger-link" href="${ARCHIVE_PATH}">Closed Trades ledger</a>`
  );
  return result;
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const openEnd = html.indexOf(">", openStart);
  if (openEnd < 0) return null;
  const tagPattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) {
      return { start: openStart, end: tagPattern.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
    }
  }
  return null;
}

function replaceMainContents(html, innerHtml) {
  const mainStart = html.search(/<main\b/i);
  if (mainStart < 0) return html;
  const range = findTagRangeFromOpen(html, "main", mainStart);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${innerHtml}\n` + html.slice(range.closeStart);
}

function updateTitle(html, title) {
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    : html;
}

function updateCanonical(html) {
  const linkPattern = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
  const match = html.match(linkPattern);
  if (!match) return html;
  const updated = match[0].replace(/href=["'][^"']*["']/i, `href="https://www.vixale.com${ARCHIVE_PATH}"`);
  return html.replace(match[0], updated);
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—";
}

function formatSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function prettyEvent(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/\bEod\b/g, "EOD");
}

function pnlClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return " neutral";
  return n > 0 ? " positive" : " negative";
}

function archiveRows(trades) {
  if (!Array.isArray(trades) || !trades.length) {
    return `<tr><td class="vx-closed-empty" colspan="8">No closed trades are available yet.</td></tr>`;
  }
  return trades.map((trade, index) => {
    const outcome = trade.result === null ? "neutral" : trade.result > 0 ? "win" : trade.result < 0 ? "loss" : "neutral";
    const search = `${trade.symbol} ${trade.side} ${trade.event} ${trade.close_time}`.toLowerCase();
    return `<tr data-archive-row data-search="${escapeHtml(search)}" data-side="${escapeHtml(trade.side.toLowerCase())}" data-outcome="${outcome}">
      <td class="vx-closed-time">${escapeHtml(trade.close_time || "—")}</td>
      <td><strong>${escapeHtml(trade.symbol || "—")}</strong></td>
      <td><span class="vx-side vx-side-${escapeHtml(trade.side.toLowerCase())}">${escapeHtml(trade.side || "—")}</span></td>
      <td>${escapeHtml(formatPrice(trade.entry))}</td>
      <td>${escapeHtml(formatPrice(trade.exit))}</td>
      <td>${escapeHtml(formatSize(trade.size))}</td>
      <td><span class="vx-pnl${pnlClass(trade.result)}">${escapeHtml(formatMoney(trade.result))}</span></td>
      <td>${escapeHtml(prettyEvent(trade.event))}</td>
    </tr>`;
  }).join("");
}

function dateRangeText(summary) {
  const first = String(summary?.first_close_date || "");
  const last = String(summary?.last_close_date || "");
  if (!first && !last) return "—";
  if (!first || first === last) return first || last;
  return `${first} → ${last}`;
}

function archiveContent(snapshot) {
  const summary = snapshot?.summary || {};
  const available = Boolean(snapshot);
  const status = available
    ? (snapshot.stale ? "Last verified Google Sheets snapshot" : "Google Sheets · Closed Trades")
    : "Closed Trades source unavailable";
  const rows = available ? archiveRows(snapshot.trades) : `<tr><td class="vx-closed-empty" colspan="8">Closed Trades data is temporarily unavailable. No simulated rows are shown.</td></tr>`;

  return `<section class="vx-closed-page"><div class="vx-closed-wrap">
    <div class="vx-closed-hero">
      <div><div class="vx-closed-kicker">Closed Trades Ledger</div><h1>Closed Trades Archive</h1><p>Read-only historical results from the Vixale Closed Trades Google Sheets ledger. Technical IDs and raw payloads are not published.</p></div>
      <div class="vx-closed-source"><span></span>${escapeHtml(status)}</div>
    </div>

    <div class="vx-closed-summary">
      <div class="vx-closed-summary-card"><div>Total Closed Trades</div><strong>${available ? escapeHtml(summary.total_trades) : "—"}</strong></div>
      <div class="vx-closed-summary-card"><div>Total Realized P&amp;L</div><strong class="${pnlClass(summary.total_realized_pnl).trim()}">${available ? escapeHtml(formatMoney(summary.total_realized_pnl)) : "—"}</strong></div>
      <div class="vx-closed-summary-card"><div>Win Rate</div><strong>${available ? escapeHtml(Number(summary.win_rate || 0).toFixed(2) + "%") : "—"}</strong></div>
      <div class="vx-closed-summary-card"><div>Archive Range</div><strong class="vx-closed-range">${available ? escapeHtml(dateRangeText(summary)) : "—"}</strong></div>
    </div>

    <div class="vx-closed-panel">
      <div class="vx-closed-toolbar">
        <div class="vx-closed-toolbar-copy"><h2>Trade history</h2><p><span id="vx-closed-visible-count">${available ? escapeHtml(summary.total_trades) : "0"}</span> records shown</p></div>
        <div class="vx-closed-controls">
          <input id="vx-closed-search" type="search" placeholder="Search symbol or event" aria-label="Search closed trades">
          <select id="vx-closed-side" aria-label="Filter by side"><option value="">All sides</option><option value="long">Long</option><option value="short">Short</option></select>
          <select id="vx-closed-outcome" aria-label="Filter by outcome"><option value="">All outcomes</option><option value="win">Wins</option><option value="loss">Losses</option><option value="neutral">Flat / N/A</option></select>
          <button id="vx-closed-refresh" type="button">Refresh data</button>
        </div>
      </div>
      <div class="vx-closed-table-scroll">
        <table class="vx-closed-table">
          <thead><tr><th>Closed</th><th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th><th>Size</th><th>Realized P&amp;L</th><th>Event</th></tr></thead>
          <tbody id="vx-closed-table-body">${rows}</tbody>
        </table>
      </div>
      <div class="vx-closed-foot">Closed Trades ledger · read-only archive · Open/unrealized P&amp;L is not included here.</div>
    </div>
  </div></section>`;
}

const styles = `
<style id="${STYLE_ID}">
.vx-closed-page{min-height:calc(100vh - 140px);padding:54px 0 86px;background:linear-gradient(180deg,#f3faf6 0%,#f8fbf9 34%,#fff 100%);color:#17211d}
.vx-closed-wrap{max-width:1420px;margin:0 auto;padding:0 24px;box-sizing:border-box}
.vx-closed-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;margin-bottom:26px}.vx-closed-hero>div:first-child{max-width:800px}.vx-closed-kicker{color:#23704f;font-size:11px;font-weight:650;letter-spacing:.085em;text-transform:uppercase}.vx-closed-hero h1{margin:10px 0 0;font-size:clamp(38px,5vw,62px);line-height:1;letter-spacing:-.045em;font-weight:500}.vx-closed-hero p{max-width:720px;margin:16px 0 0;color:#6f7a75;font-size:15px;line-height:1.6}.vx-closed-source{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;color:#287153;font-size:11px}.vx-closed-source span{width:8px;height:8px;border-radius:50%;background:#0aa25f;box-shadow:0 0 0 4px rgba(10,162,95,.09)}
.vx-closed-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.vx-closed-summary-card{min-height:116px;padding:20px;border:1px solid #dce7e1;border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 12px 34px rgba(31,67,51,.04)}.vx-closed-summary-card div{color:#85918c;font-size:10.5px;letter-spacing:.055em;text-transform:uppercase}.vx-closed-summary-card strong{display:block;margin-top:13px;font-size:25px;font-weight:500;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.vx-closed-summary-card strong.positive{color:#009452}.vx-closed-summary-card strong.negative{color:#b33a3a}.vx-closed-summary-card .vx-closed-range{font-size:18px;line-height:1.3}
.vx-closed-panel{overflow:hidden;border:1px solid #d8e6de;border-radius:28px;background:#fff;box-shadow:0 22px 60px rgba(31,67,51,.08)}.vx-closed-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:20px 22px;border-bottom:1px solid #e5eee9;background:#fbfdfc}.vx-closed-toolbar h2{margin:0;font-size:20px;font-weight:550;letter-spacing:-.025em}.vx-closed-toolbar p{margin:5px 0 0;color:#87918d;font-size:12px}.vx-closed-controls{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}.vx-closed-controls input,.vx-closed-controls select,.vx-closed-controls button{min-height:40px;border:1px solid #d4e0da;border-radius:12px;background:#fff;color:#26302c;font:inherit;font-size:12.5px;padding:0 12px;box-sizing:border-box}.vx-closed-controls input{min-width:220px}.vx-closed-controls button{cursor:pointer;font-weight:600}.vx-closed-controls button:hover{border-color:#9fbeae;background:#f7fbf9}
.vx-closed-table-scroll{overflow:auto}.vx-closed-table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;font-size:13px}.vx-closed-table th{position:sticky;top:0;z-index:1;padding:13px 16px;border-bottom:1px solid #e5eee9;background:#f8fbf9;color:#7f8b85;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.055em;text-transform:uppercase;white-space:nowrap}.vx-closed-table td{padding:14px 16px;border-bottom:1px solid #edf2ef;color:#4f5d57;white-space:nowrap}.vx-closed-table tbody tr:hover td{background:#fbfdfc}.vx-closed-table td strong{color:#17211d;font-weight:600}.vx-closed-time{color:#6f7a75!important;font-variant-numeric:tabular-nums}.vx-side{display:inline-flex;align-items:center;min-height:26px;padding:0 9px;border-radius:999px;border:1px solid #dce7e1;background:#f8fbf9;font-size:10.5px;font-weight:650;letter-spacing:.045em}.vx-side-long{color:#087c49}.vx-side-short{color:#9d4141}.vx-pnl{font-variant-numeric:tabular-nums;font-weight:600}.vx-pnl.positive{color:#009452}.vx-pnl.negative{color:#b33a3a}.vx-pnl.neutral{color:#68736f}.vx-closed-empty{padding:46px 20px!important;text-align:center;color:#7d8983!important}.vx-closed-foot{padding:14px 20px;color:#8a9590;font-size:11.5px;background:#fbfdfc}
.vx-home-equity-ledger-link{color:#4e6157;text-decoration:underline;text-underline-offset:3px}
@media(max-width:900px){.vx-closed-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-closed-hero,.vx-closed-toolbar{align-items:flex-start;flex-direction:column}.vx-closed-controls{justify-content:flex-start;width:100%}}
@media(max-width:600px){.vx-closed-page{padding:38px 0 64px}.vx-closed-wrap{padding:0 14px}.vx-closed-summary{gap:9px}.vx-closed-summary-card{min-height:96px;padding:15px;border-radius:18px}.vx-closed-summary-card strong{font-size:21px}.vx-closed-summary-card .vx-closed-range{font-size:14px}.vx-closed-panel{border-radius:22px}.vx-closed-toolbar{padding:17px}.vx-closed-controls{display:grid;grid-template-columns:1fr 1fr}.vx-closed-controls input{grid-column:1/-1;min-width:0;width:100%}.vx-closed-controls button{grid-column:1/-1}.vx-closed-controls select{width:100%}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const rows=[...document.querySelectorAll('[data-archive-row]')];
  const search=document.getElementById('vx-closed-search');
  const side=document.getElementById('vx-closed-side');
  const outcome=document.getElementById('vx-closed-outcome');
  const count=document.getElementById('vx-closed-visible-count');
  const refresh=document.getElementById('vx-closed-refresh');
  function apply(){const q=String(search?.value||'').trim().toLowerCase(),s=String(side?.value||''),o=String(outcome?.value||'');let visible=0;rows.forEach(row=>{const show=(!q||String(row.dataset.search||'').includes(q))&&(!s||row.dataset.side===s)&&(!o||row.dataset.outcome===o);row.hidden=!show;if(show)visible+=1;});if(count)count.textContent=String(visible);}
  [search,side,outcome].forEach(el=>el&&el.addEventListener('input',apply));
  if(refresh)refresh.addEventListener('click',()=>window.location.reload());
})();
</script>`;

function injectAssets(html) {
  let result = html;
  if (!result.includes(`id="${STYLE_ID}"`)) {
    result = result.includes("</head>") ? result.replace("</head>", () => `${styles}\n</head>`) : `${styles}${result}`;
  }
  if (!result.includes(`id="${SCRIPT_ID}"`)) {
    result = result.includes("</body>") ? result.replace("</body>", () => `${script}\n</body>`) : `${result}${script}`;
  }
  return result;
}

function refineClosedTradesArchivePage(html, snapshot) {
  if (typeof html !== "string") return html;
  let result = refineGlobalArchiveLinks(html);
  result = replaceMainContents(result, archiveContent(snapshot));
  result = updateTitle(result, "Vixale | Closed Trades Archive");
  result = updateCanonical(result);
  return injectAssets(result);
}

function resolveSnapshotWithTimeout(provider = getClosedTradesArchiveSnapshot, timeoutMs = SNAPSHOT_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value || null); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    Promise.resolve().then(() => provider()).then(finish).catch(() => finish(null));
  });
}

function installClosedTradesArchiveRefinement(app) {
  app.use((req, res, next) => {
    const originalPath = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();

    const originalSend = res.send.bind(res);
    const continueWith = snapshot => {
      res.send = function sendWithClosedTradesArchive(body) {
        const type = String(res.getHeader("Content-Type") || "");
        if (typeof body === "string" && (!type || type.includes("html"))) {
          body = originalPath === ARCHIVE_PATH
            ? refineClosedTradesArchivePage(body, snapshot)
            : refineGlobalArchiveLinks(body);
        }
        return originalSend(body);
      };

      if (originalPath === ARCHIVE_PATH) {
        const queryIndex = req.url.indexOf("?");
        const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
        req.url = `/${query}`;
        if (Object.prototype.hasOwnProperty.call(req, "_parsedUrl")) delete req._parsedUrl;
      }
      next();
    };

    if (originalPath === ARCHIVE_PATH) {
      resolveSnapshotWithTimeout().then(continueWith);
      return;
    }
    continueWith(null);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleClosedTradesArchiveWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installClosedTradesArchiveRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleClosedTradesArchiveWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleClosedTradesArchiveModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  ARCHIVE_PATH,
  CLOSED_TRADES_SHEET,
  STYLE_ID,
  SCRIPT_ID,
  SNAPSHOT_TIMEOUT_MS,
  CACHE_MS,
  cleanNumber,
  closedTradeDateKey,
  buildClosedTradesArchive,
  readClosedTradesArchive,
  getClosedTradesArchiveSnapshot,
  refineGlobalArchiveLinks,
  replaceMainContents,
  archiveContent,
  injectAssets,
  refineClosedTradesArchivePage,
  resolveSnapshotWithTimeout,
  installClosedTradesArchiveRefinement,
  wrapExpress,
};
