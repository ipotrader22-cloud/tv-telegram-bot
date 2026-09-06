"use strict";

const Module = require("module");

const OPTIONS_PATH = "/trading-systems/options";
const DASHBOARD_PATH = "/dashboard";
const OPTIONS_CANONICAL_URL = "https://www.vixale.com/trading-systems/options";
const OPTION_JOURNAL_RANGE = "'Option Journal'!A:S";
const OPTIONS_PAGE_MARKER = "data-vx-options-canonical";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagRange(html, tag, start) {
  if (start < 0) return null;
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const re = new RegExp(`<\\/?${escapeRegex(tag)}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = re.exec(html))) {
    depth += new RegExp(`^<\\/${escapeRegex(tag)}\\b`, "i").test(match[0]) ? -1 : 1;
    if (depth === 0) return { start, end: re.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
  }
  return null;
}

function elementRangeById(html, tag, id) {
  const re = new RegExp(`<${escapeRegex(tag)}\\b[^>]*\\bid=["']${escapeRegex(id)}["'][^>]*>`, "i");
  const match = re.exec(html);
  return match ? tagRange(html, tag, match.index) : null;
}

function sectionRangeByText(html, className, text) {
  const textIndex = html.indexOf(text);
  if (textIndex < 0) return null;
  const before = html.slice(0, textIndex);
  const re = new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>`, "gi");
  let match;
  let start = -1;
  while ((match = re.exec(before))) start = match.index;
  return start >= 0 ? tagRange(html, "div", start) : null;
}

function replaceBody(html, body) {
  const start = html.search(/<body\b/i);
  const range = tagRange(html, "body", start);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${body}\n` + html.slice(range.closeStart);
}

function setTitle(html, title) {
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    : html;
}

function setCanonical(html, url) {
  const canonical = `<link rel="canonical" href="${url}" />`;
  const existing = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
  if (existing.test(html)) return html.replace(existing, canonical);
  return html.includes("</head>") ? html.replace("</head>", `${canonical}\n</head>`) : html;
}

function removeMetaRefresh(html) {
  return html.replace(/\s*<meta\b[^>]*http-equiv=["']refresh["'][^>]*>\s*/i, "\n");
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function optionTradeFromRow(row = []) {
  return {
    id: String(row[0] || ""), trade_date: String(row[1] || ""), entry_time: String(row[2] || ""),
    symbol: String(row[3] || ""), strategy: String(row[4] || ""), legs: String(row[5] || ""),
    expiration: String(row[6] || ""), contracts: Number(row[7] || 0), multiplier: Number(row[8] || 100),
    trade_type: String(row[9] || ""), entry_price: Number(row[10] || 0), exit_date: String(row[11] || ""),
    exit_time: String(row[12] || ""), exit_price: row[13] == null || row[13] === "" ? "" : Number(row[13]),
    fees: Number(row[14] || 0), status: String(row[15] || ""),
  };
}

function parseOptionJournalRows(values) {
  const rows = Array.isArray(values) ? values : [];
  const start = rows.length && String(rows[0]?.[0] || "").trim().toUpperCase() === "ID" ? 1 : 0;
  return rows.slice(start).filter(row => Array.isArray(row) && row.some(cell => String(cell ?? "").trim() !== "")).map(optionTradeFromRow);
}

function optionPnl(trade) {
  if (!trade || trade.status !== "Closed" || trade.exit_price === "") return null;
  const fields = [trade.entry_price, trade.exit_price, trade.contracts, trade.multiplier, trade.fees];
  if (fields.some(value => !Number.isFinite(Number(value)))) return null;
  const difference = trade.trade_type === "Credit" ? trade.entry_price - trade.exit_price : trade.exit_price - trade.entry_price;
  const pnl = difference * trade.contracts * trade.multiplier - trade.fees;
  return Number.isFinite(pnl) ? roundMoney(pnl) : null;
}

function buildOptionsEquityCurve(trades) {
  const daily = new Map();
  for (const trade of Array.isArray(trades) ? trades : []) {
    if (trade.status !== "Closed" || !/^\d{4}-\d{2}-\d{2}$/.test(String(trade.exit_date || ""))) continue;
    const pnl = optionPnl(trade);
    if (pnl == null) continue;
    daily.set(trade.exit_date, roundMoney((daily.get(trade.exit_date) || 0) + pnl));
  }
  let cumulative = 0;
  const points = [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dailyPnl]) => {
    cumulative = roundMoney(cumulative + dailyPnl);
    return { date, daily_pnl: dailyPnl, cumulative_pnl: cumulative };
  });
  return { points, total_realized_pnl: points.length ? points[points.length - 1].cumulative_pnl : 0 };
}

async function loadOptionsEquityFromSheets() {
  const spreadsheetId = String(process.env.GOOGLE_SHEET_ID || "").trim();
  const credentialsJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!spreadsheetId || !credentialsJson) throw new Error("Google Sheets is not configured for Options equity.");
  const { google } = require("googleapis");
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(credentialsJson), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: OPTION_JOURNAL_RANGE });
  return buildOptionsEquityCurve(parseOptionJournalRows(response.data.values || []));
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "$0.00";
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}$${Math.abs(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function optionsEquitySection(curve, error = false) {
  const points = Array.isArray(curve?.points) ? curve.points : [];
  const total = Number.isFinite(Number(curve?.total_realized_pnl)) ? Number(curve.total_realized_pnl) : 0;
  return `<div class="section" id="options-equity"><div class="section-header equity-header"><div class="equity-header-copy"><h2>Options Equity Curve — Realized P&amp;L</h2><span>Cumulative realized P&amp;L · closed Option Journal trades only · grouped by Exit Date</span></div><div class="equity-total"><span>Total Realized Options P&amp;L</span><strong class="${total >= 0 ? "positive" : "negative"}">${formatMoney(total)}</strong></div></div><div class="equity-chart-wrap">${error ? '<div class="journal-warning">Options performance history is temporarily unavailable. The journal below remains the existing viewer record.</div>' : points.length ? '<div class="equity-chart-stage" id="options-equity-chart-stage"><svg id="options-equity-chart-svg" class="equity-chart-svg" role="img" aria-label="Options Equity Curve — Realized P&L"></svg><div id="options-equity-chart-tooltip" class="equity-tooltip" aria-hidden="true"></div></div>' : '<div class="empty">No closed Option Journal trades with valid realized P&amp;L yet.</div>'}</div></div>`;
}

function optionsChartScript(curve) {
  const pointsJson = JSON.stringify(Array.isArray(curve?.points) ? curve.points : []).replace(/&/g, "\\u0026").replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `<script ${OPTIONS_PAGE_MARKER}="chart">(() => {const raw=${pointsJson};const stage=document.getElementById('options-equity-chart-stage'),svg=document.getElementById('options-equity-chart-svg'),tooltip=document.getElementById('options-equity-chart-tooltip');if(!stage||!svg||!tooltip||!raw.length)return;const points=raw.map(p=>({date:String(p.date||''),daily_pnl:Number(p.daily_pnl),cumulative_pnl:Number(p.cumulative_pnl)})).filter(p=>p.date&&Number.isFinite(p.daily_pnl)&&Number.isFinite(p.cumulative_pnl));if(!points.length)return;const money=v=>{const n=Number(v);if(!Number.isFinite(n))return'—';const s=n>0?'+':n<0?'-':'';return s+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})},axis=v=>{const n=Number(v);if(!Number.isFinite(n))return'';return(n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:Math.abs(n)<100?2:0})},date=(v,c=false)=>{const m=String(v||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);if(!m)return String(v||'');const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));return new Intl.DateTimeFormat('en-US',c?{month:'short',day:'numeric'}:{year:'numeric',month:'short',day:'numeric'}).format(d)};const render=()=>{const width=Math.max(stage.clientWidth||0,320),height=window.innerWidth<=720?300:340,margin={top:24,right:width<=560?82:112,bottom:44,left:width<=560?56:70},pw=Math.max(1,width-margin.left-margin.right),ph=Math.max(1,height-margin.top-margin.bottom),vals=points.map(p=>p.cumulative_pnl);let min=Math.min(0,...vals),max=Math.max(0,...vals);const rs=max-min,pad=Math.max(rs*.08,rs===0?1:.5);min-=pad;max+=pad;const span=max-min||1,x=i=>points.length===1?margin.left+pw/2:margin.left+(i/(points.length-1))*pw,y=v=>margin.top+((max-v)/span)*ph,zy=y(0),ns='http://www.w3.org/2000/svg';svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('height',String(height));while(svg.firstChild)svg.removeChild(svg.firstChild);const line=(x1,y1,x2,y2,cl)=>{const e=document.createElementNS(ns,'line');[['x1',x1],['y1',y1],['x2',x2],['y2',y2],['class',cl]].forEach(([k,v])=>e.setAttribute(k,String(v)));svg.appendChild(e)};line(margin.left,zy,width-margin.right,zy,'equity-zero-line');const text=(xx,yy,v,a='start')=>{const e=document.createElementNS(ns,'text');e.setAttribute('x',String(xx));e.setAttribute('y',String(yy));e.setAttribute('text-anchor',a);e.setAttribute('class','equity-axis-text');e.textContent=v;svg.appendChild(e)};text(margin.left-10,zy+4,'$0','end');text(margin.left-10,margin.top+4,axis(max),'end');text(margin.left-10,margin.top+ph+4,axis(min),'end');text(margin.left,height-10,date(points[0].date,true),'start');text(width-margin.right,height-10,date(points[points.length-1].date,true),'end');const poly=document.createElementNS(ns,'polyline');poly.setAttribute('class','equity-line');poly.setAttribute('points',points.map((p,i)=>String(x(i))+','+String(y(p.cumulative_pnl))).join(' '));svg.appendChild(poly);points.forEach((p,i)=>{const c=document.createElementNS(ns,'circle');c.setAttribute('class','equity-point');c.setAttribute('cx',String(x(i)));c.setAttribute('cy',String(y(p.cumulative_pnl)));c.setAttribute('r','4.5');c.setAttribute('tabindex','0');const show=()=>{tooltip.innerHTML='<div class="equity-tooltip-date">'+date(p.date)+'</div><div class="equity-tooltip-row"><span>Daily P&L</span><strong>'+money(p.daily_pnl)+'</strong></div><div class="equity-tooltip-row"><span>Cumulative P&L</span><strong>'+money(p.cumulative_pnl)+'</strong></div>';tooltip.classList.add('visible');tooltip.setAttribute('aria-hidden','false');const sr=stage.getBoundingClientRect(),vr=svg.getBoundingClientRect(),px=(x(i)/width)*vr.width+(vr.left-sr.left),py=(y(p.cumulative_pnl)/height)*vr.height+(vr.top-sr.top);tooltip.style.left=Math.max(8,Math.min(stage.clientWidth-tooltip.offsetWidth-8,px+10))+'px';tooltip.style.top=Math.max(8,py-tooltip.offsetHeight-10)+'px'},hide=()=>{tooltip.classList.remove('visible');tooltip.setAttribute('aria-hidden','true')};c.addEventListener('mouseenter',show);c.addEventListener('focus',show);c.addEventListener('mouseleave',hide);c.addEventListener('blur',hide);svg.appendChild(c)})};render();let timer=null;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(render,120)})})();</script>`;
}

function extractOptionJournalSection(html) {
  const range = elementRangeById(html, "div", "option-journal");
  return range ? html.slice(range.start, range.end) : "";
}

function refineDayTradingDashboard(html) {
  if (typeof html !== "string" || !html.includes("Vixale Live Strategy Dashboard")) return html;
  let out = html;
  const journalRange = elementRangeById(out, "div", "option-journal");
  if (journalRange) out = out.slice(0, journalRange.start) + out.slice(journalRange.end);
  out = out.replace(/\s*<a\b[^>]*href=["']#option-journal["'][^>]*>\s*Option Journal\s*<\/a>/i, "");
  const noteRange = sectionRangeByText(out, "strategy-note", "Option Straddles");
  if (noteRange) out = out.slice(0, noteRange.start) + out.slice(noteRange.end);
  out = setTitle(out, "Vixale | Live Day Trading Dashboard");
  out = out.replace(/<h1>Vixale Live Strategy Dashboard<\/h1>/i, "<h1>Vixale Live Day Trading Dashboard</h1>");
  out = out.replace("Private live forward-test / paper-trading tracker", "Private live day-trading forward-test / paper-trading tracker");
  return out;
}

function refineOptionsPageFromDashboard(html, curve = { points: [], total_realized_pnl: 0 }, equityError = false) {
  if (typeof html !== "string" || !html.includes("Vixale Live Strategy Dashboard")) return html;
  const optionSection = extractOptionJournalSection(html);
  if (!optionSection) return html;
  let out = removeMetaRefresh(setCanonical(setTitle(html, "Vixale | Options Trading"), OPTIONS_CANONICAL_URL));
  const body = `<div class="wrap" ${OPTIONS_PAGE_MARKER}="page"><div class="top-actions"><div class="left-links"><a class="home-link" href="/">← Back to Home</a><a class="home-link" href="/dashboard">Day Trading Dashboard</a><a class="home-link" href="/trading-systems/swing-trading">Swing Trading</a><a class="home-link" href="/trading-systems">Trading Systems</a></div><div class="dashboard-links"><a class="dash-btn primary" href="/#password-access">Watch Systems for Free</a><a class="dash-btn" href="/logout">Log Out</a></div></div><div class="hero"><div class="topline"><div class="brand"><h1>Vixale Options</h1><div class="subtitle">Owner-entered Option Journal · open and closed trades · realized P&amp;L</div><div class="updated">Options are recorded manually through the existing owner journal. This page is read-only.</div></div><div class="badge"><span class="dot"></span> OPTIONS JOURNAL</div></div><div class="strategy-notes"><div class="strategy-note"><strong>Manual journal</strong>Trades continue to be entered and updated by the owner through the existing Options admin workflow.</div><div class="strategy-note"><strong>Closed-only equity</strong>The curve changes only when an Option Journal trade is Closed with a valid Exit Date and derived realized P&amp;L.</div><div class="strategy-note"><strong>One viewer access</strong>The same Vixale viewer session used for the Day Trading dashboard opens this Options page and protected brokerage proofs.</div></div></div>${optionsEquitySection(curve, equityError)}${optionSection}<div class="footer"><strong>Options disclosure:</strong> Option Journal entries are owner-entered records. Realized P&amp;L is derived from the recorded Credit/Debit, entry price, exit price, contracts, multiplier, and fees; it is not entered manually. Brokerage screenshots, when present, are owner-provided and may be cropped or redacted. Trading options involves substantial risk and results are not guaranteed.</div></div>${optionsChartScript(curve)}`;
  return replaceBody(out, body);
}

function installOptionsCanonicalRefinement(app, dependencies = {}) {
  const loadCurve = dependencies.loadOptionsEquityFromSheets || loadOptionsEquityFromSheets;
  app.use((req, res, next) => {
    const originalPath = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || (originalPath !== OPTIONS_PATH && originalPath !== DASHBOARD_PATH)) return next();
    const send = res.send.bind(res);
    res.send = function sendWithOptionsRefinement(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "");
      const isHtml = typeof body === "string" && (!contentType || contentType.includes("html"));
      if (!isHtml || res.statusCode >= 300) return send(body);
      if (originalPath === DASHBOARD_PATH) return send(refineDayTradingDashboard(body));
      Promise.resolve().then(() => loadCurve()).then(curve => send(refineOptionsPageFromDashboard(body, curve, false))).catch(error => { console.error("Options equity load error:", error); send(refineOptionsPageFromDashboard(body, { points: [], total_realized_pnl: 0 }, true)); });
      return res;
    };
    if (originalPath === OPTIONS_PATH) {
      const queryIndex = req.url.indexOf("?");
      const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
      req.url = `${DASHBOARD_PATH}${query}`;
      if (Object.prototype.hasOwnProperty.call(req, "_parsedUrl")) delete req._parsedUrl;
    }
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleOptionsCanonicalWrapped) return expressFactory;
  function wrappedExpress(...args) { const app = expressFactory(...args); installOptionsCanonicalRefinement(app); return app; }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleOptionsCanonicalWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleOptionsCanonicalModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = { OPTIONS_PATH, DASHBOARD_PATH, OPTIONS_CANONICAL_URL, OPTION_JOURNAL_RANGE, OPTIONS_PAGE_MARKER, optionTradeFromRow, parseOptionJournalRows, optionPnl, buildOptionsEquityCurve, loadOptionsEquityFromSheets, extractOptionJournalSection, refineDayTradingDashboard, refineOptionsPageFromDashboard, installOptionsCanonicalRefinement };
