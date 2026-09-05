"use strict";

const Module = require("module");
const { getPublicPerformanceSnapshot } = require("./website_public_performance");

const PRICING_PATH = "/pricing";
const STYLE_ID = "vx-pricing-performance-fix-style";
const SCRIPT_ID = "vx-pricing-performance-fix-script";
const LEGACY_SCRIPT_ID = "vx-watch-system-script";
const SNAPSHOT_TIMEOUT_MS = 4500;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function valueClass(value) {
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

function renderServerEquitySvg(points) {
  const pts = (Array.isArray(points) ? points : [])
    .map(point => ({ date: String(point?.date || ""), value: Number(point?.cumulative_pnl) }))
    .filter(point => point.date && Number.isFinite(point.value));
  if (!pts.length) return "";

  const width = 1100, height = 320, margin = { top: 24, right: 105, bottom: 38, left: 68 };
  const values = pts.map(point => point.value).concat([0]);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 1), pad = span * 0.12;
  const yMin = min - pad, yMax = max + pad;
  const x = index => margin.left + (pts.length === 1 ? (width - margin.left - margin.right) / 2 : index * (width - margin.left - margin.right) / (pts.length - 1));
  const y = value => margin.top + (yMax - value) * (height - margin.top - margin.bottom) / (yMax - yMin);

  const grid = [];
  for (let i = 0; i < 4; i += 1) {
    const value = yMin + (yMax - yMin) * i / 3;
    const yy = y(value);
    grid.push(`<line x1="${margin.left}" y1="${yy.toFixed(1)}" x2="${width - margin.right}" y2="${yy.toFixed(1)}" stroke="#edf3ef" stroke-width="1"/>`);
    grid.push(`<text x="${margin.left - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="#87918d" font-size="10">$${escapeHtml(Math.round(value).toLocaleString("en-US"))}</text>`);
  }
  if (yMin <= 0 && yMax >= 0) {
    const zeroY = y(0);
    grid.push(`<line x1="${margin.left}" y1="${zeroY.toFixed(1)}" x2="${width - margin.right}" y2="${zeroY.toFixed(1)}" stroke="#9eaaa4" stroke-width="1.1" stroke-dasharray="5 5"/>`);
  }

  const path = pts.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const circles = pts.map((point, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${index === pts.length - 1 ? "4.5" : "3"}" fill="${index === pts.length - 1 ? "#078f51" : "#fff"}" stroke="#078f51" stroke-width="1.5"/>`).join("");
  const labels = [];
  const labelCount = Math.min(5, pts.length);
  for (let i = 0; i < labelCount; i += 1) {
    const index = Math.round(i * (pts.length - 1) / Math.max(labelCount - 1, 1));
    const anchor = index === 0 ? "start" : index === pts.length - 1 ? "end" : "middle";
    labels.push(`<text x="${x(index).toFixed(1)}" y="${height - 10}" text-anchor="${anchor}" fill="#87918d" font-size="10">${escapeHtml(dateLabel(pts[index].date))}</text>`);
  }
  const last = pts[pts.length - 1];
  const lastLabel = `<text x="${(x(pts.length - 1) + 10).toFixed(1)}" y="${(y(last.value) + 4).toFixed(1)}" fill="#078f51" font-size="11" font-weight="600">${escapeHtml(formatMoney(last.value))}</text>`;

  return `<svg id="vx-watch-chart-svg" class="vx-chart-svg" role="img" aria-label="Equity Curve — Realized P&amp;L" viewBox="0 0 ${width} ${height}">${grid.join("")}<path d="${path}" fill="none" stroke="#078f51" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${circles}${labels.join("")}${lastLabel}</svg>`;
}

function replaceMetric(html, id, text, rawValue = 0) {
  const pattern = new RegExp(`<div id="${id}" class="vx-perf-value[^\"]*">[\\s\\S]*?<\\/div>`, "i");
  return html.replace(pattern, `<div id="${id}" class="vx-perf-value${valueClass(rawValue)}">${escapeHtml(text)}</div>`);
}

function snapshotStatus(snapshot) {
  if (!snapshot) return `<span><strong>Performance source unavailable</strong></span><span>Try again later or request dashboard access.</span>`;
  const when = snapshot.updated_at
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(snapshot.updated_at))
    : "recently";
  const label = snapshot.stale ? "Last verified snapshot" : "Verified performance data";
  return `<span><strong>${escapeHtml(label)}</strong> · ${escapeHtml(when)}</span><span>Closed Trades only · Open P&amp;L excluded</span>`;
}

function applySnapshot(html, snapshot) {
  let result = html;
  const summary = snapshot?.summary || {};
  const equity = snapshot?.equity_curve || {};
  const points = Array.isArray(equity.points) ? equity.points : [];

  if (snapshot) {
    result = replaceMetric(result, "vx-watch-closed-count", Number.isFinite(Number(summary.closed_count_today)) ? String(Number(summary.closed_count_today)) : "—");
    result = replaceMetric(result, "vx-watch-closed-today", formatMoney(summary.closed_pnl_today), summary.closed_pnl_today);
    result = replaceMetric(result, "vx-watch-total", formatMoney(summary.total_closed_pnl), summary.total_closed_pnl);
    result = replaceMetric(result, "vx-watch-win", formatPercent(summary.win_rate));
    result = result.replace(/<strong id="vx-watch-equity-total">[\s\S]*?<\/strong>/i, `<strong id="vx-watch-equity-total">${escapeHtml(formatMoney(equity.total_realized_pnl))}</strong>`);
  }

  result = result.replace(/<div id="vx-watch-status" class="vx-perf-status">[\s\S]*?<\/div>/i, `<div id="vx-watch-status" class="vx-perf-status">${snapshotStatus(snapshot)}</div>`);

  if (points.length) {
    const svg = renderServerEquitySvg(points);
    result = result.replace(/<div id="vx-watch-chart-stage" class="vx-chart-stage"\s+hidden>/i, `<div id="vx-watch-chart-stage" class="vx-chart-stage">`);
    result = result.replace(/<svg id="vx-watch-chart-svg"[\s\S]*?<\/svg>/i, svg);
    result = result.replace(/<div id="vx-watch-chart-empty" class="vx-chart-empty"[^>]*>[\s\S]*?<\/div>/i, `<div id="vx-watch-chart-empty" class="vx-chart-empty" hidden>No closed trades with realized P&amp;L are available yet.</div>`);
  } else {
    const message = snapshot ? "No closed trades with realized P&L are available yet." : "Verified performance is temporarily unavailable. No fallback or simulated values are shown.";
    result = result.replace(/<div id="vx-watch-chart-empty" class="vx-chart-empty"[^>]*>[\s\S]*?<\/div>/i, `<div id="vx-watch-chart-empty" class="vx-chart-empty">${escapeHtml(message)}</div>`);
  }
  return result;
}

const styles = `
<style id="${STYLE_ID}">
.vx-chart-empty[hidden]{display:none!important}
.vx-chart-empty:not([hidden]){display:block!important;min-height:0!important;margin:12px 0 0!important;border:0!important;border-radius:0!important;padding:8px 2px!important;background:transparent!important;text-align:left!important}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const state={points:[]};
  const $=id=>document.getElementById(id);
  const money=value=>{const n=Number(value);if(!Number.isFinite(n))return '—';const sign=n>0?'+':n<0?'-':'';return sign+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
  const pct=value=>Number.isFinite(Number(value))?Number(value).toFixed(2)+'%':'—';
  const set=(id,text,value)=>{const el=$(id);if(!el)return;el.textContent=text;el.classList.remove('positive','negative');const n=Number(value);if(Number.isFinite(n)&&n>0)el.classList.add('positive');else if(Number.isFinite(n)&&n<0)el.classList.add('negative');};
  const dateLabel=value=>{const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);if(!m)return value;return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3])));};
  const node=(name,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;return n;};
  function render(){const svg=$('vx-watch-chart-svg'),stage=$('vx-watch-chart-stage');if(!svg||!stage||!state.points.length)return;const pts=state.points.map(p=>({date:String(p.date||''),v:Number(p.cumulative_pnl)})).filter(p=>p.date&&Number.isFinite(p.v));if(!pts.length)return;const w=Math.max(stage.clientWidth||0,320),h=window.innerWidth<=600?280:320,m={t:24,r:w<=560?80:105,b:38,l:w<=560?54:68};const vals=pts.map(p=>p.v).concat([0]),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,1),pad=span*.12,yMin=min-pad,yMax=max+pad;const x=i=>m.l+(pts.length===1?(w-m.l-m.r)/2:i*(w-m.l-m.r)/(pts.length-1));const y=v=>m.t+(yMax-v)*(h-m.t-m.b)/(yMax-yMin);svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.innerHTML='';for(let i=0;i<4;i++){const value=yMin+(yMax-yMin)*i/3,yy=y(value);svg.appendChild(node('line',{x1:m.l,y1:yy,x2:w-m.r,y2:yy,stroke:'#edf3ef','stroke-width':1}));svg.appendChild(node('text',{x:m.l-10,y:yy+4,'text-anchor':'end',fill:'#87918d','font-size':10},'$'+Math.round(value).toLocaleString('en-US')));}if(yMin<=0&&yMax>=0){const zy=y(0);svg.appendChild(node('line',{x1:m.l,y1:zy,x2:w-m.r,y2:zy,stroke:'#9eaaa4','stroke-width':1.1,'stroke-dasharray':'5 5'}));}const d=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1)).join(' ');svg.appendChild(node('path',{d,fill:'none',stroke:'#078f51','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'}));pts.forEach((p,i)=>svg.appendChild(node('circle',{cx:x(i),cy:y(p.v),r:i===pts.length-1?4.5:3,fill:i===pts.length-1?'#078f51':'#fff',stroke:'#078f51','stroke-width':1.5})));const labelCount=Math.min(5,pts.length);for(let i=0;i<labelCount;i++){const idx=Math.round(i*(pts.length-1)/Math.max(labelCount-1,1));svg.appendChild(node('text',{x:x(idx),y:h-10,'text-anchor':idx===0?'start':idx===pts.length-1?'end':'middle',fill:'#87918d','font-size':10},dateLabel(pts[idx].date)));}const last=pts[pts.length-1];svg.appendChild(node('text',{x:x(pts.length-1)+10,y:y(last.v)+4,fill:'#078f51','font-size':11,'font-weight':600},money(last.v)));}
  function apply(data){if(!data||!data.ok)return;const s=data.summary||{},e=data.equity_curve||{},stage=$('vx-watch-chart-stage'),empty=$('vx-watch-chart-empty'),status=$('vx-watch-status');set('vx-watch-closed-count',String(Number(s.closed_count_today||0)),0);set('vx-watch-closed-today',money(s.closed_pnl_today),s.closed_pnl_today);set('vx-watch-total',money(s.total_closed_pnl),s.total_closed_pnl);set('vx-watch-win',pct(s.win_rate),0);set('vx-watch-equity-total',money(e.total_realized_pnl),e.total_realized_pnl);state.points=Array.isArray(e.points)?e.points:[];if(status){const when=data.updated_at?new Date(data.updated_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'recently';status.innerHTML='<span><strong>'+(data.stale?'Last verified snapshot':'Verified performance data')+'</strong> · '+when+'</span><span>Closed Trades only · Open P&amp;L excluded</span>';}if(stage&&empty){if(state.points.length){stage.hidden=false;empty.hidden=true;render();}else{stage.hidden=true;empty.hidden=false;empty.textContent='No closed trades with realized P&L are available yet.';}}}
  async function refresh(){if(document.hidden)return;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch('/public-performance.json',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)return;apply(await response.json());}catch(_){}finally{clearTimeout(timer);}}
  let resizeTimer=null;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});setTimeout(refresh,2500);setInterval(refresh,60000);
})();
</script>`;

function injectAssets(html) {
  let result = html;
  if (!result.includes(`id="${STYLE_ID}"`)) result = result.includes("</head>") ? result.replace("</head>", () => `${styles}\n</head>`) : `${styles}${result}`;
  if (!result.includes(`id="${SCRIPT_ID}"`)) result = result.includes("</body>") ? result.replace("</body>", () => `${script}\n</body>`) : `${result}${script}`;
  return result;
}

function removeLegacyBrokenScript(html) {
  return html.replace(new RegExp(`<script id="${LEGACY_SCRIPT_ID}">[\\s\\S]*?<\\/script>\\s*`, "i"), "");
}

function refinePricingPerformance(html, path, snapshot = null) {
  if (typeof html !== "string" || path !== PRICING_PATH || !html.includes('class="vx-perf"')) return html;
  let result = removeLegacyBrokenScript(html);
  result = applySnapshot(result, snapshot);
  return injectAssets(result);
}

function resolveSnapshotWithTimeout(provider = getPublicPerformanceSnapshot, timeoutMs = SNAPSHOT_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value || null); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    Promise.resolve().then(() => provider()).then(finish).catch(() => finish(null));
  });
}

function installPricingPerformanceFix(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || path !== PRICING_PATH) return next();
    const originalSend = res.send.bind(res);
    resolveSnapshotWithTimeout().then(snapshot => {
      res.send = function sendWithPricingPerformanceFix(body) {
        const type = String(res.getHeader("Content-Type") || "");
        if (typeof body === "string" && (!type || type.includes("html"))) body = refinePricingPerformance(body, path, snapshot);
        return originalSend(body);
      };
      next();
    });
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
  if (typeof expressFactory !== "function" || expressFactory.__vixalePricingPerformanceFixWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installPricingPerformanceFix(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixalePricingPerformanceFixWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixalePricingPerformanceFixModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  PRICING_PATH,
  STYLE_ID,
  SCRIPT_ID,
  SNAPSHOT_TIMEOUT_MS,
  formatMoney,
  formatPercent,
  renderServerEquitySvg,
  applySnapshot,
  removeLegacyBrokenScript,
  injectAssets,
  refinePricingPerformance,
  resolveSnapshotWithTimeout,
  installPricingPerformanceFix,
  wrapExpress,
};
