"use strict";

const Module = require("module");
const { getPublicPerformanceSnapshot } = require("./website_public_performance");

const HOME_PATH = "/";
const TELEGRAM_URL = "https://t.me/tradervip22";
const DAY_TRADING_PATH = "/trading-systems/day-trading";
const SWING_TRADING_PATH = "/trading-systems/swing-trading";
const OPTIONS_PATH = "/trading-systems/options";
const STYLE_ID = "vx-home-performance-style";
const SCRIPT_ID = "vx-home-performance-script";
const HERO_MARKER = 'class="vx-home-hero"';
const DAY_SCOPE_MARKER = 'class="vx-home-day-trading"';
const SNAPSHOT_TIMEOUT_MS = 4500;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function replaceDirectTextLink(html, oldText, href, newText) {
  const pattern = new RegExp(`<a\\b([^>]*)>\\s*${escapeRegex(oldText)}\\s*<\\/a>`, "g");
  return html.replace(pattern, `<a href="${href}">${newText}</a>`);
}

function refineTelegramNav(html) {
  if (typeof html !== "string") return html;
  return replaceDirectTextLink(html, "Start Here", TELEGRAM_URL, "Telegram");
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const tagPattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, end: tagPattern.lastIndex };
  }
  return null;
}

function findTagByClass(html, tagName, className, from = 0, to = html.length) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "gi");
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (!match || match.index >= to) return null;
  const range = findTagRangeFromOpen(html, tagName, match.index);
  if (!range || range.end > to) return null;
  return range;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function metricClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return n > 0 ? " positive" : " negative";
}

function dateLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "");
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

function summaryStrip(snapshot) {
  const s = snapshot?.summary || {};
  const cards = [
    ["Open Positions", Number.isFinite(Number(s.open_count)) ? String(Number(s.open_count)) : "—", 0],
    ["Working Orders", Number.isFinite(Number(s.working_count)) ? String(Number(s.working_count)) : "—", 0],
    ["Closed Trades Today", Number.isFinite(Number(s.closed_count_today)) ? String(Number(s.closed_count_today)) : "—", 0],
    ["Closed P&L Today", formatMoney(s.closed_pnl_today), s.closed_pnl_today],
  ];
  return `<section class="vx-home-live-strip-wrap" aria-label="Day Trading system status summary"><div class="vx-home-live-strip">
    ${cards.map(([label, value, raw], index) => `<div class="vx-home-live-card"><div class="vx-home-live-label">${escapeHtml(label)}</div><div id="vx-home-live-${index}" class="vx-home-live-value${metricClass(raw)}">${escapeHtml(value)}</div></div>`).join("")}
  </div></section>`;
}

function renderServerEquitySvg(points) {
  const pts = (Array.isArray(points) ? points : []).map(point => ({ date: String(point?.date || ""), value: Number(point?.cumulative_pnl) })).filter(point => point.date && Number.isFinite(point.value));
  if (!pts.length) return "";
  const width = 640, height = 250, margin = { top: 18, right: 86, bottom: 30, left: 58 };
  const values = pts.map(point => point.value).concat([0]);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 1), pad = span * 0.12, yMin = min - pad, yMax = max + pad;
  const x = index => margin.left + (pts.length === 1 ? (width - margin.left - margin.right) / 2 : index * (width - margin.left - margin.right) / (pts.length - 1));
  const y = value => margin.top + (yMax - value) * (height - margin.top - margin.bottom) / (yMax - yMin);
  const grid = [];
  for (let i = 0; i < 4; i += 1) {
    const value = yMin + (yMax - yMin) * i / 3, yy = y(value);
    grid.push(`<line x1="${margin.left}" y1="${yy.toFixed(1)}" x2="${width - margin.right}" y2="${yy.toFixed(1)}" stroke="#edf3ef" stroke-width="1"/>`);
    grid.push(`<text x="${margin.left - 9}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="#87918d" font-size="9">$${escapeHtml(Math.round(value).toLocaleString("en-US"))}</text>`);
  }
  if (yMin <= 0 && yMax >= 0) {
    const zeroY = y(0);
    grid.push(`<line x1="${margin.left}" y1="${zeroY.toFixed(1)}" x2="${width - margin.right}" y2="${zeroY.toFixed(1)}" stroke="#9eaaa4" stroke-width="1" stroke-dasharray="5 5"/>`);
  }
  const path = pts.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const circles = pts.map((point, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${index === pts.length - 1 ? "4" : "2.6"}" fill="${index === pts.length - 1 ? "#078f51" : "#fff"}" stroke="#078f51" stroke-width="1.4"/>`).join("");
  const labelCount = Math.min(4, pts.length), labels = [];
  for (let i = 0; i < labelCount; i += 1) {
    const index = Math.round(i * (pts.length - 1) / Math.max(labelCount - 1, 1));
    const anchor = index === 0 ? "start" : index === pts.length - 1 ? "end" : "middle";
    labels.push(`<text x="${x(index).toFixed(1)}" y="${height - 7}" text-anchor="${anchor}" fill="#87918d" font-size="9">${escapeHtml(dateLabel(pts[index].date))}</text>`);
  }
  const last = pts[pts.length - 1];
  const lastLabel = `<text x="${(x(pts.length - 1) + 8).toFixed(1)}" y="${(y(last.value) + 4).toFixed(1)}" fill="#078f51" font-size="10" font-weight="600">${escapeHtml(formatMoney(last.value))}</text>`;
  return `<svg id="vx-home-equity-svg" class="vx-home-equity-svg" role="img" aria-label="Day Trading Equity Curve — Realized P&L" viewBox="0 0 ${width} ${height}">${grid.join("")}<path d="${path}" fill="none" stroke="#078f51" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${circles}${labels.join("")}${lastLabel}</svg>`;
}

function performanceCard(snapshot) {
  const points = snapshot?.equity_curve?.points || [];
  const svg = renderServerEquitySvg(points), hasPoints = Boolean(svg);
  const total = snapshot ? formatMoney(snapshot?.equity_curve?.total_realized_pnl) : "—";
  const status = snapshot ? (snapshot.stale ? "Last verified snapshot" : "Verified · Closed Trades ledger") : "Performance source unavailable";
  const emptyText = snapshot ? "No closed trades with realized P&L are available yet." : "Verified performance is temporarily unavailable. No simulated values are shown.";
  return `<section class="vx-home-equity-preview" aria-labelledby="vx-home-equity-title">
    <div class="vx-home-equity-head"><div><div class="vx-home-equity-kicker">Day Trading performance</div><h3 id="vx-home-equity-title">Equity Curve — Realized P&amp;L</h3><p>Day Trading closed trades only · Open P&amp;L excluded</p></div><div class="vx-home-equity-total"><span>Total realized P&amp;L</span><strong id="vx-home-equity-total">${escapeHtml(total)}</strong></div></div>
    <div id="vx-home-equity-stage" class="vx-home-equity-stage"${hasPoints ? "" : " hidden"}>${svg}</div>
    <div id="vx-home-equity-empty" class="vx-home-equity-empty"${hasPoints ? " hidden" : ""}>${escapeHtml(emptyText)}</div>
    <div class="vx-home-equity-foot"><span id="vx-home-equity-status">${escapeHtml(status)}</span><a href="${DAY_TRADING_PATH}">Explore Day Trading</a></div>
  </section>`;
}

function statusBadge(snapshot) {
  if (!snapshot) return `<span id="vx-home-day-badge" class="vx-home-day-badge unavailable">Status unavailable</span>`;
  if (snapshot.stale) return `<span id="vx-home-day-badge" class="vx-home-day-badge stale">Last verified</span>`;
  return `<span id="vx-home-day-badge" class="vx-home-day-badge"><i></i>Live</span>`;
}

function otherSystems() {
  return `<section class="vx-home-other-systems" aria-labelledby="vx-home-other-title">
    <div class="vx-home-other-head"><div><span>Explore other systems</span><h3 id="vx-home-other-title">Swing and Options have their own focused pages.</h3></div></div>
    <div class="vx-home-other-grid">
      <a class="vx-home-system-card" href="${SWING_TRADING_PATH}"><span>Multi-session</span><strong>Swing Trading</strong><p>Explore the Vixale Swing System and Swing Leaders.</p><b>Explore Swing Trading →</b></a>
      <a class="vx-home-system-card" href="${OPTIONS_PATH}"><span>Options</span><strong>Options</strong><p>Explore Options Straddles and the options-focused workflow.</p><b>Explore Options →</b></a>
    </div>
  </section>`;
}

function dayTradingSection(snapshot) {
  return `<section class="vx-home-day-trading" aria-labelledby="vx-home-day-title"><div class="wrap">
    <div class="vx-home-day-head"><div><div class="vx-home-day-kicker">Live Day Trading</div><h2 id="vx-home-day-title">Day Trading System Status</h2><p>Current status and realized performance for Vixale day-trading systems. Swing Trading and Options are presented separately.</p></div><div class="vx-home-day-actions">${statusBadge(snapshot)}<a href="${DAY_TRADING_PATH}">Day Trading details →</a></div></div>
    ${summaryStrip(snapshot)}
    <div class="vx-home-day-performance">${performanceCard(snapshot)}</div>
    <p class="vx-home-day-scope">Day Trading only · The status cards and equity curve on this page do not include Swing Trading or Options.</p>
    ${otherSystems()}
  </div></section>`;
}

function splitHomepageHero(html, snapshot = null) {
  if (typeof html !== "string" || html.includes(DAY_SCOPE_MARKER)) return html;
  const heroStart = html.indexOf(`<section ${HERO_MARKER}`);
  if (heroStart < 0) return html;
  const heroRange = findTagRangeFromOpen(html, "section", heroStart);
  if (!heroRange) return html;
  const copyRange = findTagByClass(html, "div", "vx-home-hero-copy", heroRange.start, heroRange.end);
  if (!copyRange) return html;
  const copyHtml = html.slice(copyRange.start, copyRange.end);
  const replacement = `<section class="vx-home-hero"><div class="wrap">${copyHtml}</div></section>${dayTradingSection(snapshot)}`;
  return html.slice(0, heroRange.start) + replacement + html.slice(heroRange.end);
}

const styles = `
<style id="${STYLE_ID}">
  .vx-home-day-trading{padding:46px 0 58px;border-top:1px solid #e3e9e5;border-bottom:1px solid #e3e9e5;background:linear-gradient(180deg,#f5fbf7 0%,#fbfdfc 58%,#fff 100%);color:#17211d}
  .vx-home-day-trading>.wrap{max-width:1180px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-home-day-head{display:flex;align-items:flex-end;justify-content:space-between;gap:28px}
  .vx-home-day-kicker{color:#176442;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .vx-home-day-head h2{margin:8px 0 0;font-size:clamp(30px,3.5vw,42px);font-weight:550;line-height:1.06;letter-spacing:-.035em}
  .vx-home-day-head p{max-width:720px;margin:10px 0 0;color:#68736f;font-size:14px;line-height:1.55}
  .vx-home-day-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}.vx-home-day-actions>a{color:#176442;font-size:12.5px;font-weight:700;text-decoration:none}.vx-home-day-actions>a:hover{text-decoration:underline;text-underline-offset:3px}
  .vx-home-day-badge{display:inline-flex;align-items:center;gap:7px;min-height:32px;padding:0 11px;border:1px solid #bfe4d2;border-radius:999px;background:#f4fbf7;color:#176442;font-size:10.5px;font-weight:700;letter-spacing:.055em;text-transform:uppercase}.vx-home-day-badge i{width:7px;height:7px;border-radius:50%;background:#0bcf74;box-shadow:0 0 0 4px rgba(11,207,116,.09)}.vx-home-day-badge.stale,.vx-home-day-badge.unavailable{border-color:#dde5e1;background:#fff;color:#77827d}.vx-home-day-badge.stale i,.vx-home-day-badge.unavailable i{display:none}
  .vx-home-live-strip-wrap{margin-top:24px;padding:0;background:none}
  .vx-home-live-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;max-width:none;margin:0;padding:0;box-sizing:border-box}
  .vx-home-live-card{min-height:112px;padding:20px 18px;border:1px solid #dce7e1;border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 12px 34px rgba(31,67,51,.04);box-sizing:border-box}
  .vx-home-live-label{color:#85918c;font-size:11px;letter-spacing:.055em;text-transform:uppercase;white-space:nowrap}
  .vx-home-live-value{margin-top:13px;color:#17211d;font-size:25px;font-weight:520;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.vx-home-live-value.positive{color:#009452}.vx-home-live-value.negative{color:#b33a3a}
  .vx-home-day-performance{margin-top:18px}
  .vx-home-equity-preview{display:flex;flex-direction:column;min-height:390px;padding:25px 26px 19px;border:1px solid #d8e6de;border-radius:28px;background:rgba(255,255,255,.98);box-shadow:0 18px 52px rgba(31,67,51,.065);box-sizing:border-box}
  .vx-home-equity-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
  .vx-home-equity-kicker{color:#23704f;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
  .vx-home-equity-head h3{margin:7px 0 0;color:#17211d;font-size:22px;line-height:1.15;font-weight:600;letter-spacing:-.025em}.vx-home-equity-head p{margin:6px 0 0;color:#87918d;font-size:11.5px;line-height:1.4}
  .vx-home-equity-total{text-align:right;white-space:nowrap}.vx-home-equity-total span{display:block;color:#87918d;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase}.vx-home-equity-total strong{display:block;margin-top:5px;color:#009452;font-size:22px;font-weight:550;font-variant-numeric:tabular-nums}
  .vx-home-equity-stage{flex:1;min-height:250px;margin-top:8px}.vx-home-equity-svg{display:block;width:100%;height:100%;min-height:250px;overflow:visible}
  .vx-home-equity-empty{display:flex;flex:1;align-items:center;justify-content:center;min-height:250px;margin-top:8px;border:1px dashed #d7e3dc;border-radius:18px;color:#7b8781;font-size:12px;text-align:center;padding:20px;box-sizing:border-box}
  .vx-home-equity-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px;padding-top:12px;border-top:1px solid #e8efeb;color:#8a9590;font-size:10.5px}.vx-home-equity-foot a{color:#176442;font-weight:650;text-underline-offset:3px}
  .vx-home-day-scope{margin:11px 0 0;color:#7f8a85;text-align:center;font-size:11px;line-height:1.5}
  .vx-home-other-systems{margin-top:34px;padding-top:28px;border-top:1px solid #e2ebe6}.vx-home-other-head span{color:#287153;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.vx-home-other-head h3{margin:7px 0 0;font-size:20px;font-weight:550;letter-spacing:-.025em}
  .vx-home-other-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}.vx-home-system-card{display:flex;min-height:145px;flex-direction:column;padding:20px 22px;border:1px solid #dce7e1;border-radius:22px;background:#fff;color:#17211d;text-decoration:none;box-shadow:0 12px 34px rgba(31,67,51,.035)}.vx-home-system-card>span{color:#287153;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.vx-home-system-card>strong{margin-top:9px;font-size:22px;font-weight:560;letter-spacing:-.025em}.vx-home-system-card>p{margin:7px 0 0;color:#68736f;font-size:12.5px;line-height:1.45}.vx-home-system-card>b{margin-top:auto;padding-top:14px;color:#176442;font-size:12px;font-weight:700}.vx-home-system-card:hover{border-color:#c9ded3;box-shadow:0 16px 40px rgba(31,67,51,.06)}
  @media(max-width:900px){.vx-home-day-head{align-items:flex-start;flex-direction:column}.vx-home-day-actions{justify-content:flex-start}.vx-home-live-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:640px){.vx-home-day-trading{padding:38px 0 46px}.vx-home-day-trading>.wrap{padding:0 16px}.vx-home-live-strip{gap:9px}.vx-home-live-card{min-height:92px;padding:16px 13px;border-radius:18px}.vx-home-live-label{font-size:9.5px;white-space:normal}.vx-home-live-value{font-size:21px}.vx-home-equity-preview{padding:18px 16px 14px;border-radius:22px}.vx-home-equity-head{flex-direction:column}.vx-home-equity-total{text-align:left}.vx-home-equity-stage,.vx-home-equity-svg,.vx-home-equity-empty{min-height:235px}.vx-home-equity-foot{align-items:flex-start;flex-direction:column}.vx-home-other-grid{grid-template-columns:1fr}.vx-home-system-card{min-height:130px}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const state={points:[]};
  const $=id=>document.getElementById(id);
  const money=value=>{const n=Number(value);if(!Number.isFinite(n))return '—';const sign=n>0?'+':n<0?'-':'';return sign+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
  const set=(id,text,value)=>{const el=$(id);if(!el)return;el.textContent=text;el.classList.remove('positive','negative');const n=Number(value);if(Number.isFinite(n)&&n>0)el.classList.add('positive');else if(Number.isFinite(n)&&n<0)el.classList.add('negative');};
  const dateLabel=value=>{const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);if(!m)return value;return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3])));};
  const node=(name,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;return n;};
  function render(){const stage=$('vx-home-equity-stage');if(!stage||!state.points.length)return;let svg=$('vx-home-equity-svg');if(!svg){svg=node('svg',{id:'vx-home-equity-svg',class:'vx-home-equity-svg',role:'img','aria-label':'Day Trading Equity Curve — Realized P&L'});stage.innerHTML='';stage.appendChild(svg);}const pts=state.points.map(p=>({date:String(p.date||''),v:Number(p.cumulative_pnl)})).filter(p=>p.date&&Number.isFinite(p.v));if(!pts.length)return;const w=Math.max(stage.clientWidth||0,320),h=Math.max(stage.clientHeight||0,245),m={t:18,r:w<520?78:92,b:32,l:w<520?52:62};const vals=pts.map(p=>p.v).concat([0]),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,1),pad=span*.12,yMin=min-pad,yMax=max+pad;const x=i=>m.l+(pts.length===1?(w-m.l-m.r)/2:i*(w-m.l-m.r)/(pts.length-1));const y=v=>m.t+(yMax-v)*(h-m.t-m.b)/(yMax-yMin);svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.innerHTML='';for(let i=0;i<4;i++){const value=yMin+(yMax-yMin)*i/3,yy=y(value);svg.appendChild(node('line',{x1:m.l,y1:yy,x2:w-m.r,y2:yy,stroke:'#edf3ef','stroke-width':1}));svg.appendChild(node('text',{x:m.l-9,y:yy+4,'text-anchor':'end',fill:'#87918d','font-size':9},'$'+Math.round(value).toLocaleString('en-US')));}if(yMin<=0&&yMax>=0){const zy=y(0);svg.appendChild(node('line',{x1:m.l,y1:zy,x2:w-m.r,y2:zy,stroke:'#9eaaa4','stroke-width':1,'stroke-dasharray':'5 5'}));}const d=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1)).join(' ');svg.appendChild(node('path',{d,fill:'none',stroke:'#078f51','stroke-width':2.4,'stroke-linecap':'round','stroke-linejoin':'round'}));pts.forEach((p,i)=>svg.appendChild(node('circle',{cx:x(i),cy:y(p.v),r:i===pts.length-1?4:2.6,fill:i===pts.length-1?'#078f51':'#fff',stroke:'#078f51','stroke-width':1.4})));const labelCount=Math.min(4,pts.length);for(let i=0;i<labelCount;i++){const idx=Math.round(i*(pts.length-1)/Math.max(labelCount-1,1));svg.appendChild(node('text',{x:x(idx),y:h-7,'text-anchor':idx===0?'start':idx===pts.length-1?'end':'middle',fill:'#87918d','font-size':9},dateLabel(pts[idx].date)));}const last=pts[pts.length-1];svg.appendChild(node('text',{x:x(pts.length-1)+8,y:y(last.v)+4,fill:'#078f51','font-size':10,'font-weight':600},money(last.v)));}
  function apply(data){if(!data||!data.ok)return;const s=data.summary||{},e=data.equity_curve||{},stage=$('vx-home-equity-stage'),empty=$('vx-home-equity-empty'),total=$('vx-home-equity-total'),status=$('vx-home-equity-status'),badge=$('vx-home-day-badge');set('vx-home-live-0',String(Number(s.open_count||0)),0);set('vx-home-live-1',String(Number(s.working_count||0)),0);set('vx-home-live-2',String(Number(s.closed_count_today||0)),0);set('vx-home-live-3',money(s.closed_pnl_today),s.closed_pnl_today);state.points=Array.isArray(e.points)?e.points:[];if(total)total.textContent=money(e.total_realized_pnl);if(status)status.textContent=data.stale?'Last verified snapshot':'Verified · Closed Trades ledger';if(badge){badge.classList.toggle('stale',Boolean(data.stale));badge.classList.remove('unavailable');badge.innerHTML=data.stale?'Last verified':'<i></i>Live';}if(stage&&empty){if(state.points.length){stage.hidden=false;empty.hidden=true;render();}else{stage.hidden=true;empty.hidden=false;empty.textContent='No closed trades with realized P&L are available yet.';}}}
  async function refresh(){if(document.hidden)return;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch('/public-performance.json',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)return;apply(await response.json());}catch(_){}finally{clearTimeout(timer);}}
  let resizeTimer=null;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});setTimeout(refresh,2500);setInterval(refresh,60000);
})();
</script>`;

function injectAssets(html) {
  let result = html;
  if (!result.includes(`id="${STYLE_ID}"`)) result = result.includes("</head>") ? result.replace("</head>", () => `${styles}\n</head>`) : `${styles}${result}`;
  if (!result.includes(`id="${SCRIPT_ID}"`)) result = result.includes("</body>") ? result.replace("</body>", () => `${script}\n</body>`) : `${result}${script}`;
  return result;
}

function refineHomePerformance(html, path, snapshot = null) {
  if (typeof html !== "string") return html;
  let result = refineTelegramNav(html);
  if (path !== HOME_PATH) return result;
  result = splitHomepageHero(result, snapshot);
  if (result.includes(DAY_SCOPE_MARKER)) result = injectAssets(result);
  return result;
}

function resolveSnapshotWithTimeout(provider = getPublicPerformanceSnapshot, timeoutMs = SNAPSHOT_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value || null); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    Promise.resolve().then(() => provider()).then(finish).catch(() => finish(null));
  });
}

function installHomePerformanceRefinement(app) {
  app.use((req, res, next) => {
    const originalPath = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();
    const originalSend = res.send.bind(res);
    const continueWith = snapshot => {
      res.send = function sendWithHomePerformance(body) {
        const type = String(res.getHeader("Content-Type") || "");
        if (typeof body === "string" && (!type || type.includes("html"))) body = refineHomePerformance(body, originalPath, snapshot);
        return originalSend(body);
      };
      next();
    };
    if (originalPath === HOME_PATH) { resolveSnapshotWithTimeout().then(continueWith); return; }
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleHomePerformanceWrapped) return expressFactory;
  function wrappedExpress(...args) { const app = expressFactory(...args); installHomePerformanceRefinement(app); return app; }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleHomePerformanceWrapped", { value: true });
  return wrappedExpress;
}
const originalLoad = Module._load;
Module._load = function vixaleHomePerformanceModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH, TELEGRAM_URL, DAY_TRADING_PATH, SWING_TRADING_PATH, OPTIONS_PATH,
  STYLE_ID, SCRIPT_ID, DAY_SCOPE_MARKER, SNAPSHOT_TIMEOUT_MS,
  refineTelegramNav, findTagRangeFromOpen, findTagByClass, summaryStrip, renderServerEquitySvg,
  performanceCard, statusBadge, otherSystems, dayTradingSection, splitHomepageHero, injectAssets,
  refineHomePerformance, resolveSnapshotWithTimeout, installHomePerformanceRefinement, wrapExpress,
};
