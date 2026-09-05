"use strict";

const Module = require("module");

const PRICING_PATH = "/pricing";
const STYLE_ID = "vx-watch-system-style";
const SCRIPT_ID = "vx-watch-system-script";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceDirectTextLink(html, oldText, href, newText) {
  const pattern = new RegExp(`<a\\b([^>]*)>\\s*${escapeRegex(oldText)}\\s*<\\/a>`, "g");
  return html.replace(pattern, `<a href="${href}">${newText}</a>`);
}

function refinePublicNav(html) {
  if (typeof html !== "string") return html;
  let result = html;
  result = replaceDirectTextLink(result, "7 Days Free", PRICING_PATH, "Watch System for Free");
  result = replaceDirectTextLink(result, "Creators", PRICING_PATH, "Watch System for Free");
  return result;
}

function findMainRange(html) {
  const openStart = html.search(/<main\b/i);
  if (openStart < 0) return null;
  const openEnd = html.indexOf(">", openStart);
  if (openEnd < 0) return null;
  const closeStart = html.lastIndexOf("</main>");
  if (closeStart < openEnd) return null;
  return { openEnd: openEnd + 1, closeStart };
}

function replaceMainContents(html, innerHtml) {
  const range = findMainRange(html);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${innerHtml}\n` + html.slice(range.closeStart);
}

const styles = `
<style id="${STYLE_ID}">
.vx-watch-page{padding:54px 0 84px;background:linear-gradient(180deg,#f3faf6 0%,#edf8f2 34%,#fff 80%)}
.vx-watch-page .wrap{max-width:1180px;margin:0 auto;padding:0 24px;box-sizing:border-box}
.vx-watch-hero{max-width:900px;margin:0 auto;text-align:center}
.vx-watch-kicker{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border:1px solid #bfe8d4;border-radius:999px;background:#f8fcfa;color:#176442;font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
.vx-watch-hero h1{max-width:860px;margin:16px auto 0;color:#101413;font-size:clamp(40px,5vw,58px);font-weight:500;line-height:1.04;letter-spacing:-.04em;text-wrap:balance}
.vx-watch-lead{max-width:740px;margin:17px auto 0;color:#68736f;font-size:17px;line-height:1.55}
.vx-watch-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:23px}
.vx-watch-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border:1px solid #cbdad2;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:13px;font-weight:650;transition:transform .16s ease,box-shadow .16s ease}
.vx-watch-btn:hover{transform:translateY(-1px)}.vx-watch-btn.primary{border-color:#078f51;background:#078f51;color:#fff;box-shadow:0 10px 24px rgba(7,143,81,.14)}
.vx-watch-note{margin:13px auto 0;color:#7f8a85;font-size:12.5px}
.vx-perf{margin:40px auto 0;overflow:hidden;border:1px solid #d8e6de;border-radius:28px;background:rgba(255,255,255,.97);box-shadow:0 22px 60px rgba(31,67,51,.08)}
.vx-perf-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:23px 25px 19px;border-bottom:1px solid #e5eee9}
.vx-perf-head h2{margin:0;color:#17211d;font-size:23px;font-weight:550;letter-spacing:-.025em}.vx-perf-head p{margin:6px 0 0;color:#7a8580;font-size:13px}
.vx-perf-source{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;color:#287153;font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}.vx-perf-source:before{content:"";width:8px;height:8px;border-radius:50%;background:#0aa25f;box-shadow:0 0 0 4px rgba(10,162,95,.09)}
.vx-perf-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:18px 20px;background:#f8fbf9}
.vx-perf-card{padding:16px 18px;border:1px solid #e0e9e4;border-radius:18px;background:#fff}.vx-perf-label{color:#87918d;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase}.vx-perf-value{margin-top:8px;color:#17211d;font-size:25px;font-weight:500;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.vx-perf-value.positive{color:#009452}.vx-perf-value.negative{color:#b33a3a}
.vx-chart{padding:22px 22px 18px}.vx-chart-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.vx-chart-title{color:#17211d;font-size:16px;font-weight:600}.vx-chart-subtitle{margin-top:5px;color:#87918d;font-size:12px}.vx-chart-total{text-align:right}.vx-chart-total span{display:block;color:#87918d;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase}.vx-chart-total strong{display:block;margin-top:5px;color:#009452;font-size:24px;font-weight:520;font-variant-numeric:tabular-nums}
.vx-chart-stage{width:100%;min-height:320px;margin-top:8px}.vx-chart-svg{display:block;width:100%;height:320px;overflow:visible}.vx-chart-empty{display:flex;align-items:center;justify-content:center;min-height:250px;margin-top:12px;border:1px dashed #d7e3dc;border-radius:18px;color:#7b8781;font-size:13px;text-align:center;padding:22px;box-sizing:border-box}
.vx-perf-status{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:0 22px 19px;color:#8a9590;font-size:11.5px}.vx-perf-status strong{color:#59655f;font-weight:550}
.vx-perf-cta{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 24px;border-top:1px solid #e6eee9;background:linear-gradient(90deg,#f7fcf9,#fff)}.vx-perf-cta strong{display:block;color:#17211d;font-size:16px}.vx-perf-cta span{display:block;margin-top:4px;color:#7a8580;font-size:12.5px}
.vx-watch-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;max-width:1000px;margin:24px auto 0}.vx-watch-step{display:flex;gap:12px;padding:17px 18px;border:1px solid #e0e9e4;border-radius:18px;background:rgba(255,255,255,.88)}.vx-watch-step b{display:flex;flex:0 0 29px;height:29px;align-items:center;justify-content:center;border:1px solid #cce8d9;border-radius:50%;background:#f4fbf7;color:#176442;font-size:11px}.vx-watch-step strong{display:block;color:#17211d;font-size:13.5px}.vx-watch-step span{display:block;margin-top:3px;color:#78837e;font-size:12.5px;line-height:1.4}
.vx-watch-risk{max-width:920px;margin:22px auto 0;color:#86908c;text-align:center;font-size:11.5px;line-height:1.5}
@media(max-width:820px){.vx-perf-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-watch-steps{grid-template-columns:1fr}.vx-perf-head,.vx-perf-cta,.vx-chart-head{align-items:flex-start;flex-direction:column}.vx-chart-total{text-align:left}}
@media(max-width:600px){.vx-watch-page{padding:42px 0 66px}.vx-watch-page .wrap{padding:0 16px}.vx-watch-hero h1{font-size:clamp(36px,10vw,44px)}.vx-watch-actions{flex-direction:column}.vx-watch-btn{width:100%;box-sizing:border-box}.vx-perf{border-radius:22px}.vx-perf-metrics{grid-template-columns:1fr 1fr;padding:12px;gap:9px}.vx-perf-card{padding:13px}.vx-perf-value{font-size:21px}.vx-chart{padding:18px 12px 14px}.vx-chart-stage,.vx-chart-svg{height:280px;min-height:280px}.vx-perf-head{padding:20px 18px 16px}.vx-perf-cta{padding:18px}.vx-perf-cta .vx-watch-btn{width:100%}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const state = { points: [] };
  const $ = id => document.getElementById(id);
  const money = value => { const n=Number(value); if(!Number.isFinite(n)) return '—'; const sign=n>0?'+':n<0?'-':''; return sign+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); };
  const pct = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2)+'%' : '—';
  const set = (id,text,n) => { const el=$(id); if(!el)return; el.textContent=text; el.classList.remove('positive','negative'); if(Number(n)>0)el.classList.add('positive'); else if(Number(n)<0)el.classList.add('negative'); };
  const dateLabel = value => { const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/); if(!m)return value; return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3]))); };
  const svgNode = (name,attrs,text) => { const n=document.createElementNS('http://www.w3.org/2000/svg',name); Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v))); if(text!==undefined)n.textContent=text; return n; };
  function renderChart(){
    const svg=$('vx-watch-chart-svg'), stage=$('vx-watch-chart-stage'); if(!svg||!stage||!state.points.length)return;
    const pts=state.points.map(p=>({date:String(p.date||''),v:Number(p.cumulative_pnl)})).filter(p=>p.date&&Number.isFinite(p.v)); if(!pts.length)return;
    const w=Math.max(stage.clientWidth||0,320), h=window.innerWidth<=600?280:320, m={t:24,r:w<=560?80:105,b:38,l:w<=560?54:68};
    const vals=pts.map(p=>p.v).concat([0]), min=Math.min(...vals), max=Math.max(...vals), span=Math.max(max-min,1), pad=span*.12, yMin=min-pad, yMax=max+pad;
    const x=i=>m.l+(pts.length===1?(w-m.l-m.r)/2:i*(w-m.l-m.r)/(pts.length-1)); const y=v=>m.t+(yMax-v)*(h-m.t-m.b)/(yMax-yMin);
    svg.setAttribute('viewBox','0 0 '+w+' '+h); svg.innerHTML='';
    for(let i=0;i<4;i++){const value=yMin+(yMax-yMin)*i/3, yy=y(value); svg.appendChild(svgNode('line',{x1:m.l,y1:yy,x2:w-m.r,y2:yy,stroke:'#edf3ef','stroke-width':1})); svg.appendChild(svgNode('text',{x:m.l-10,y:yy+4,'text-anchor':'end',fill:'#87918d','font-size':10},'$'+Math.round(value).toLocaleString('en-US')));}
    if(yMin<=0&&yMax>=0){const zy=y(0);svg.appendChild(svgNode('line',{x1:m.l,y1:zy,x2:w-m.r,y2:zy,stroke:'#9eaaa4','stroke-width':1.1,'stroke-dasharray':'5 5'}));}
    const d=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1)).join(' '); svg.appendChild(svgNode('path',{d,fill:'none',stroke:'#078f51','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'}));
    pts.forEach((p,i)=>svg.appendChild(svgNode('circle',{cx:x(i),cy:y(p.v),r:i===pts.length-1?4.5:3,fill:i===pts.length-1?'#078f51':'#fff',stroke:'#078f51','stroke-width':1.5})));
    const labelCount=Math.min(5,pts.length); for(let i=0;i<labelCount;i++){const idx=Math.round(i*(pts.length-1)/Math.max(labelCount-1,1));svg.appendChild(svgNode('text',{x:x(idx),y:h-10,'text-anchor':idx===0?'start':idx===pts.length-1?'end':'middle',fill:'#87918d','font-size':10},dateLabel(pts[idx].date)));}
    const last=pts[pts.length-1]; svg.appendChild(svgNode('text',{x:x(pts.length-1)+10,y:y(last.v)+4,fill:'#078f51','font-size':11,'font-weight':600},money(last.v)));
  }
  async function load(){
    const empty=$('vx-watch-chart-empty'), stage=$('vx-watch-chart-stage'), status=$('vx-watch-status');
    try{
      const response=await fetch('/public-performance.json',{credentials:'same-origin',cache:'no-store'}); if(!response.ok)throw new Error('unavailable'); const data=await response.json(); if(!data||!data.ok)throw new Error('unavailable');
      const s=data.summary||{}, e=data.equity_curve||{}; state.points=Array.isArray(e.points)?e.points:[];
      set('vx-watch-closed-count',String(Number(s.closed_count_today||0)),0); set('vx-watch-closed-today',money(s.closed_pnl_today),s.closed_pnl_today); set('vx-watch-total',money(s.total_closed_pnl),s.total_closed_pnl); set('vx-watch-win',pct(s.win_rate),0); set('vx-watch-equity-total',money(e.total_realized_pnl),e.total_realized_pnl);
      if(status){const when=data.updated_at?new Date(data.updated_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'recently';status.innerHTML='<span><strong>'+(data.stale?'Last verified snapshot':'Verified performance data')+'</strong> · '+when+'</span><span>Closed Trades only · Open P&amp;L excluded</span>';}
      if(state.points.length){stage.hidden=false;empty.hidden=true;renderChart();}else{stage.hidden=true;empty.hidden=false;empty.textContent='No closed trades with realized P&L are available yet.';}
    }catch(_){stage.hidden=true;empty.hidden=false;empty.textContent='Verified performance is temporarily unavailable. No fallback or simulated values are shown.';if(status)status.innerHTML='<span><strong>Performance source unavailable</strong></span><span>Try again later or request dashboard access.</span>';}
  }
  let timer=null; window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(renderChart,120);}); load();
})();
</script>`;

function injectAssets(html) {
  let result = html;
  if (!result.includes(`id="${STYLE_ID}"`)) result = result.includes("</head>") ? result.replace("</head>", `${styles}\n</head>`) : `${styles}${result}`;
  if (!result.includes(`id="${SCRIPT_ID}"`)) result = result.includes("</body>") ? result.replace("</body>", `${script}\n</body>`) : `${result}${script}`;
  return result;
}

function pricingContent() {
  return `<section class="vx-watch-page"><div class="wrap">
  <div class="vx-watch-hero"><div class="vx-watch-kicker">Watch System for Free</div><h1>See the performance. Then watch the system live.</h1><p class="vx-watch-lead">This preview uses the same Closed Trades ledger as the dashboard Equity Curve. It shows aggregate performance only — no trade list, symbols, or open positions.</p><div class="vx-watch-actions"><a class="vx-watch-btn primary" href="/#password-access">Request 7-Day Access</a><a class="vx-watch-btn" href="/dashboard">Dashboard Login</a></div><p class="vx-watch-note">Read-only access · Manual approval · Individual dashboard code</p></div>
  <section class="vx-perf" aria-labelledby="vx-watch-performance-title"><div class="vx-perf-head"><div><h2 id="vx-watch-performance-title">Verified performance preview</h2><p>Realized results, aggregated from the dashboard data source.</p></div><div class="vx-perf-source">Closed Trades ledger</div></div>
  <div class="vx-perf-metrics"><div class="vx-perf-card"><div class="vx-perf-label">Closed trades today</div><div id="vx-watch-closed-count" class="vx-perf-value">—</div></div><div class="vx-perf-card"><div class="vx-perf-label">Closed P&amp;L today</div><div id="vx-watch-closed-today" class="vx-perf-value">—</div></div><div class="vx-perf-card"><div class="vx-perf-label">Total closed P&amp;L</div><div id="vx-watch-total" class="vx-perf-value">—</div></div><div class="vx-perf-card"><div class="vx-perf-label">Win rate</div><div id="vx-watch-win" class="vx-perf-value">—</div></div></div>
  <div class="vx-chart"><div class="vx-chart-head"><div><div class="vx-chart-title">Equity Curve — Realized P&amp;L</div><div class="vx-chart-subtitle">Cumulative realized P&amp;L · closed trades only · Open P&amp;L excluded</div></div><div class="vx-chart-total"><span>Total Realized P&amp;L</span><strong id="vx-watch-equity-total">—</strong></div></div><div id="vx-watch-chart-stage" class="vx-chart-stage" hidden><svg id="vx-watch-chart-svg" class="vx-chart-svg" role="img" aria-label="Equity Curve — Realized P&L"></svg></div><div id="vx-watch-chart-empty" class="vx-chart-empty">Loading verified performance…</div></div>
  <div id="vx-watch-status" class="vx-perf-status"><span><strong>Loading verified performance</strong></span><span>Closed Trades only · Open P&amp;L excluded</span></div><div class="vx-perf-cta"><div><strong>Want to see the system operating live?</strong><span>Watch the read-only dashboard for 7 days before deciding what to do next.</span></div><a class="vx-watch-btn primary" href="/#password-access">Watch System for Free</a></div></section>
  <div class="vx-watch-steps"><div class="vx-watch-step"><b>1</b><div><strong>Request access</strong><span>Send the short dashboard access form.</span></div></div><div class="vx-watch-step"><b>2</b><div><strong>Receive your code</strong><span>Approved viewers receive an individual login code.</span></div></div><div class="vx-watch-step"><b>3</b><div><strong>Watch for 7 days</strong><span>Follow the read-only dashboard, then decide whether Vixale fits you.</span></div></div></div>
  <div class="vx-watch-risk">Performance figures are provided for transparency, tracking, education, and research. Past performance is not a guarantee of future results. Trading involves risk.</div>
  </div></section>`;
}

function refineWatchSystemPage(html, path) {
  if (typeof html !== "string") return html;
  let result = refinePublicNav(html);
  if (path !== PRICING_PATH) return result;
  result = replaceMainContents(result, pricingContent());
  result = result.replace(/<title>[\s\S]*?<\/title>/i, "<title>Vixale | Watch System for Free</title>");
  return injectAssets(result);
}

function installWatchSystemRefinement(app) {
  app.use((req, res, next) => {
    const originalPath = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithWatchSystem(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineWatchSystemPage(body, originalPath);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleWatchSystemWrapped) return expressFactory;
  function wrappedExpress(...args) { const app = expressFactory(...args); installWatchSystemRefinement(app); return app; }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleWatchSystemWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleWatchSystemModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = { PRICING_PATH, STYLE_ID, SCRIPT_ID, refinePublicNav, replaceMainContents, pricingContent, refineWatchSystemPage, installWatchSystemRefinement, wrapExpress };
