"use strict";

const Module = require("module");

const HOME_PATH = "/";
const PUBLIC_PERFORMANCE_PATH = "/public-performance.json";
const LEGACY_TARGET_ID = "vx-conversion-day-chart";
const TARGET_ID = "vx-conversion-day-feed-chart";
const SCRIPT_ID = "vx-home-day-preview-feed-script";

const runtimeScript = `<script id="${SCRIPT_ID}">(() => {
const targetId='${TARGET_ID}';
const performancePath='${PUBLIC_PERFORMANCE_PATH}';
const ns='http://www.w3.org/2000/svg';
let hasRendered=false,inFlight=null;
const money=v=>{const n=Number(v);if(!Number.isFinite(n))return'—';const a=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return n>0?'+$'+a:n<0?'-$'+a:'$0.00'};
const axisMoney=v=>{const n=Number(v);if(!Number.isFinite(n))return'';const rounded=Math.round(n);return n<0?'-$'+Math.abs(rounded).toLocaleString('en-US'):'$'+rounded.toLocaleString('en-US')};
const dateLabel=v=>{const m=String(v||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);if(!m)return String(v||'');return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3])))};
const svgNode=(name,attrs,text)=>{const node=document.createElementNS(ns,name);Object.entries(attrs||{}).forEach(([key,value])=>node.setAttribute(key,String(value)));if(text!=null)node.textContent=String(text);return node};
const unavailable=()=>{const target=document.getElementById(targetId);if(target&&!hasRendered)target.innerHTML='<div class="vx-conversion-chart-loading">Realized-results chart unavailable.</div>'};
const renderChart=points=>{const target=document.getElementById(targetId);if(!target)return;const rows=(Array.isArray(points)?points:[]).map(point=>({date:String(point&&point.date||''),value:Number(point&&point.cumulative_pnl)})).filter(point=>point.date&&Number.isFinite(point.value));if(!rows.length){unavailable();return}const w=720,h=220,m={t:16,r:82,b:28,l:62},values=rows.map(row=>row.value).concat([0]),min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,1),pad=span*.12,yMin=min-pad,yMax=max+pad,x=index=>m.l+(rows.length===1?(w-m.l-m.r)/2:index*(w-m.l-m.r)/(rows.length-1)),y=value=>m.t+(yMax-value)*(h-m.t-m.b)/(yMax-yMin);const svg=svgNode('svg',{id:'vx-conversion-day-equity-svg',viewBox:'0 0 '+w+' '+h,role:'img','aria-label':'Day Trading Equity Curve — Realized P&L; latest '+money(rows[rows.length-1].value)});svg.appendChild(svgNode('title',{},'Day Trading Equity Curve — Realized P&L; latest '+money(rows[rows.length-1].value)));for(let i=0;i<4;i+=1){const value=yMin+(yMax-yMin)*i/3,yy=y(value);svg.appendChild(svgNode('line',{x1:m.l,x2:w-m.r,y1:yy.toFixed(1),y2:yy.toFixed(1),stroke:'rgba(185,206,195,.48)','stroke-width':1}));svg.appendChild(svgNode('text',{x:m.l-9,y:(yy+4).toFixed(1),'text-anchor':'end',fill:'#9eb8ac','font-size':10,'font-family':'system-ui, sans-serif'},axisMoney(value)))}if(yMin<=0&&yMax>=0){const yy=y(0);svg.appendChild(svgNode('line',{x1:m.l,x2:w-m.r,y1:yy.toFixed(1),y2:yy.toFixed(1),stroke:'#9bb4a8','stroke-width':1,'stroke-dasharray':'4 4'}))}const path=rows.map((row,index)=>(index?'L':'M')+x(index).toFixed(1)+' '+y(row.value).toFixed(1)).join(' ');svg.appendChild(svgNode('path',{d:path,fill:'none',stroke:'#0ba35b','stroke-width':2.8,'stroke-linecap':'round','stroke-linejoin':'round'}));rows.forEach((row,index)=>svg.appendChild(svgNode('circle',{cx:x(index).toFixed(1),cy:y(row.value).toFixed(1),r:index===rows.length-1?4:2,fill:index===rows.length-1?'#0ba35b':'#123f30',stroke:'#69d99d','stroke-width':index===rows.length-1?1.5:1.2})));const labelCount=Math.min(4,rows.length);for(let i=0;i<labelCount;i+=1){const index=Math.round(i*(rows.length-1)/Math.max(labelCount-1,1)),anchor=index===0?'start':index===rows.length-1?'end':'middle';svg.appendChild(svgNode('text',{x:x(index).toFixed(1),y:h-7,'text-anchor':anchor,fill:'#9eb8ac','font-size':10,'font-family':'system-ui, sans-serif'},dateLabel(rows[index].date)))}const last=rows[rows.length-1];svg.appendChild(svgNode('text',{x:(x(rows.length-1)+8).toFixed(1),y:(y(last.value)+4).toFixed(1),fill:'#69d99d','font-size':10,'font-weight':600,'font-family':'system-ui, sans-serif'},money(last.value)));target.replaceChildren(svg);hasRendered=true};
const refresh=()=>{if(inFlight)return inFlight;inFlight=fetch(performancePath,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}).then(response=>response.ok?response.json():Promise.reject(new Error('performance_http_'+response.status))).then(data=>{if(!data||!data.ok)throw new Error('performance_unavailable');renderChart(data.equity_curve&&data.equity_curve.points)}).catch(()=>unavailable()).finally(()=>{inFlight=null});return inFlight};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
document.querySelector('[data-vx-preview-tab="day"]')?.addEventListener('click',refresh);
})();</script>`;

function refineHomeHtml(html, path = HOME_PATH) {
  if (typeof html !== "string" || path !== HOME_PATH) return html;
  if (!html.includes(`id="${LEGACY_TARGET_ID}"`) && !html.includes(`id="${TARGET_ID}"`)) return html;
  let out = html;
  if (!out.includes(`id="${TARGET_ID}"`)) out = out.replace(`id="${LEGACY_TARGET_ID}"`, `id="${TARGET_ID}" data-vx-day-preview-feed="${PUBLIC_PERFORMANCE_PATH}"`);
  if (!out.includes(`id="${SCRIPT_ID}"`)) out = out.includes("</body>") ? out.replace("</body>", `${runtimeScript}\n</body>`) : `${out}${runtimeScript}`;
  return out;
}

function installHomeDayPreviewFeedRefinement(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "/").split("?")[0];
    const method = String(req.method || "GET").toUpperCase();
    if (path !== HOME_PATH || (method !== "GET" && method !== "HEAD")) return next();
    const send = res.send.bind(res);
    res.send = function sendWithHomeDayPreviewFeed(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineHomeHtml(body, path);
      return send(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleHomeDayPreviewFeedWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installHomeDayPreviewFeedRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleHomeDayPreviewFeedWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleHomeDayPreviewFeedLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  PUBLIC_PERFORMANCE_PATH,
  LEGACY_TARGET_ID,
  TARGET_ID,
  SCRIPT_ID,
  refineHomeHtml,
  installHomeDayPreviewFeedRefinement,
  wrapExpress,
};
