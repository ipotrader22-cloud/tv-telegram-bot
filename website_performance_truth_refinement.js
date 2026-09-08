"use strict";

const Module = require("module");

const HOME_PATH = "/";
const STYLE_ID = "vx-performance-truth-style";
const SCRIPT_ID = "vx-performance-truth-script";
const HOME_MARKER = 'class="vx-home-day-trading"';

const styles = `
<style id="${STYLE_ID}">
  .vx-home-day-freshness{display:flex;justify-content:flex-end;color:#65716c;font-size:11.5px;line-height:1.4;font-variant-numeric:tabular-nums}
  .vx-home-equity-coverage{margin:6px 0 0;color:#68736f;font-size:11.5px;line-height:1.45}
  @media(max-width:900px){.vx-home-day-freshness{justify-content:flex-start}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const badge=document.getElementById('vx-home-day-badge');
  const updated=document.getElementById('vx-home-day-updated');
  const coverage=document.getElementById('vx-home-equity-coverage');
  const equityStatus=document.getElementById('vx-home-equity-status');
  if(!badge&&!updated&&!coverage)return;
  let failures=0;
  let hasUpdatedAt=false;

  const dateLabel=value=>{
    const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
    if(!m)return '';
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3])));
  };
  const timeLabel=value=>{
    const d=new Date(value);
    if(!Number.isFinite(d.getTime()))return '';
    return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(d);
  };
  const setBadge=(text,kind)=>{
    if(!badge)return;
    badge.classList.toggle('stale',kind==='stale');
    badge.classList.toggle('unavailable',kind==='unavailable');
    badge.innerHTML=kind==='fresh'?'<i></i>'+text:text;
  };
  const setCoverage=data=>{
    if(!coverage)return;
    const c=data&&data.equity_curve&&data.equity_curve.coverage||{};
    const first=dateLabel(c.first_close_date),last=dateLabel(c.last_close_date);
    const included=Number(c.included_trade_count),omitted=Number(c.omitted_row_count);
    if(!Number.isFinite(included)||!Number.isFinite(omitted)){
      coverage.textContent='Coverage unavailable · Open P&L excluded';
      return;
    }
    const range=first&&last?(first===last?first:first+' – '+last):'No included realized closes yet';
    coverage.textContent='Coverage: '+range+' · '+included+' included closed trade'+(included===1?'':'s')+' · '+omitted+' omitted row'+(omitted===1?'':'s')+' · Open P&L excluded';
  };
  const apply=data=>{
    failures=0;
    const time=timeLabel(data&&data.updated_at);
    if(updated&&time){updated.textContent='Last updated: '+time;updated.dataset.hasValue='1';hasUpdatedAt=true;}
    setCoverage(data);
    if(data&&data.stale){
      setBadge('Update delayed','stale');
      if(equityStatus)equityStatus.textContent='Last verified snapshot · update delayed';
    }else{
      setBadge('Data current','fresh');
      if(equityStatus)equityStatus.textContent='Verified · Closed Trades ledger';
    }
  };
  const fail=()=>{
    failures+=1;
    const repeated=failures>=2;
    setBadge(repeated?'Data unavailable':'Update delayed',repeated?'unavailable':'stale');
    if(updated&&!hasUpdatedAt&&updated.dataset.hasValue!=='1')updated.textContent='Last updated: unavailable';
    if(equityStatus)equityStatus.textContent=repeated?'Performance update unavailable':'Performance update delayed';
  };
  async function refresh(){
    if(document.hidden)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch('/public-performance.json',{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('performance_http_'+response.status);
      const data=await response.json();
      if(!data||!data.ok)throw new Error('performance_payload_unavailable');
      apply(data);
    }catch(_){fail();}finally{clearTimeout(timer);}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setTimeout(refresh,100);
  setInterval(refresh,60000);
})();
</script>`;

function transformHomepagePerformanceTruth(html, path = HOME_PATH) {
  if (typeof html !== "string" || path !== HOME_PATH || !html.includes(HOME_MARKER)) return html;
  let result = html;

  const oldBadgeClient = "if(badge){badge.classList.toggle('stale',Boolean(data.stale));badge.classList.remove('unavailable');badge.innerHTML=data.stale?'Last verified':'<i></i>Live';}";
  if (result.includes(oldBadgeClient)) result = result.replace(oldBadgeClient, "if(badge){}" );

  result = result.replace('<div class="vx-home-live-label">Working Orders</div>', '<div class="vx-home-live-label">Pending Setups</div>');
  result = result.split("s.working_count").join("s.pending_count");
  result = result.replace('<span id="vx-home-day-badge" class="vx-home-day-badge"><i></i>Live</span>', '<span id="vx-home-day-badge" class="vx-home-day-badge"><i></i>Data current</span>');
  result = result.replace('<span id="vx-home-day-badge" class="vx-home-day-badge stale">Last verified</span>', '<span id="vx-home-day-badge" class="vx-home-day-badge stale">Update delayed</span>');
  result = result.replace('<span id="vx-home-day-badge" class="vx-home-day-badge unavailable">Status unavailable</span>', '<span id="vx-home-day-badge" class="vx-home-day-badge unavailable">Data unavailable</span>');

  if (!result.includes('id="vx-home-day-updated"')) {
    const marker = '</div><a class="vx-home-day-dashboard-link"';
    if (result.includes(marker)) result = result.replace(marker, '</div><div class="vx-home-day-freshness"><span id="vx-home-day-updated">Last updated: checking…</span></div><a class="vx-home-day-dashboard-link"');
  }

  if (!result.includes('id="vx-home-equity-coverage"')) {
    const marker = '<p>Day Trading closed trades only · Open P&amp;L excluded</p>';
    if (result.includes(marker)) result = result.replace(marker, `${marker}<p id="vx-home-equity-coverage" class="vx-home-equity-coverage">Coverage: awaiting Closed Trades ledger · Open P&amp;L excluded</p>`);
  }

  if (!result.includes(`id="${STYLE_ID}"`)) result = result.includes("</head>") ? result.replace("</head>", `${styles}\n</head>`) : `${styles}${result}`;
  if (!result.includes(`id="${SCRIPT_ID}"`)) result = result.includes("</body>") ? result.replace("</body>", `${script}\n</body>`) : `${result}${script}`;
  return result;
}

function installPerformanceTruthRefinement(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    if (path !== HOME_PATH || (req.method !== "GET" && req.method !== "HEAD")) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithPerformanceTruth(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = transformHomepagePerformanceTruth(body, path);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixalePerformanceTruthWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installPerformanceTruthRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixalePerformanceTruthWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixalePerformanceTruthModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  STYLE_ID,
  SCRIPT_ID,
  transformHomepagePerformanceTruth,
  installPerformanceTruthRefinement,
  wrapExpress,
};
