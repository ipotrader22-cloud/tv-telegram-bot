"use strict";

const Module = require("module");

const HOME_PATH = "/";
const TELEGRAM_URL = "https://t.me/tradervip22";
const STYLE_ID = "vx-home-performance-style";
const SCRIPT_ID = "vx-home-performance-script";
const HERO_MARKER = 'class="vx-home-hero"';
const SPLIT_MARKER = 'class="vx-home-split"';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function performanceCard() {
  return `<section class="vx-home-equity-preview" aria-labelledby="vx-home-equity-title">
    <div class="vx-home-equity-head"><div><div class="vx-home-equity-kicker">Verified performance</div><h2 id="vx-home-equity-title">Equity Curve — Realized P&amp;L</h2><p>Closed trades only · Open P&amp;L excluded</p></div><div class="vx-home-equity-total"><span>Total realized P&amp;L</span><strong id="vx-home-equity-total">—</strong></div></div>
    <div id="vx-home-equity-stage" class="vx-home-equity-stage" hidden><svg id="vx-home-equity-svg" class="vx-home-equity-svg" role="img" aria-label="Equity Curve — Realized P&L"></svg></div>
    <div id="vx-home-equity-empty" class="vx-home-equity-empty">Loading verified performance…</div>
    <div class="vx-home-equity-foot"><span id="vx-home-equity-status">Closed Trades ledger</span><a href="/pricing">View performance details</a></div>
  </section>`;
}

function splitHomepageHero(html) {
  if (typeof html !== "string" || html.includes(SPLIT_MARKER)) return html;
  const heroStart = html.indexOf(`<section ${HERO_MARKER}`);
  if (heroStart < 0) return html;
  const heroRange = findTagRangeFromOpen(html, "section", heroStart);
  if (!heroRange) return html;
  const copyRange = findTagByClass(html, "div", "vx-home-hero-copy", heroRange.start, heroRange.end);
  if (!copyRange) return html;
  const copyHtml = html.slice(copyRange.start, copyRange.end);
  const replacement = `<section class="vx-home-hero"><div class="wrap"><div class="vx-home-split">${performanceCard()}${copyHtml}</div></div></section>`;
  return html.slice(0, heroRange.start) + replacement + html.slice(heroRange.end);
}

const styles = `
<style id="${STYLE_ID}">
  .vx-home-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);gap:38px;align-items:stretch;min-height:410px}
  .vx-home-equity-preview{display:flex;flex-direction:column;min-height:410px;padding:24px 24px 18px;border:1px solid #d8e6de;border-radius:28px;background:rgba(255,255,255,.98);box-shadow:0 22px 60px rgba(31,67,51,.08);box-sizing:border-box}
  .vx-home-equity-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
  .vx-home-equity-kicker{color:#23704f;font-size:10.5px;font-weight:650;letter-spacing:.07em;text-transform:uppercase}
  .vx-home-equity-head h2{margin:7px 0 0;color:#17211d;font-size:20px;line-height:1.15;font-weight:600;letter-spacing:-.025em}
  .vx-home-equity-head p{margin:6px 0 0;color:#87918d;font-size:11.5px;line-height:1.4}
  .vx-home-equity-total{text-align:right;white-space:nowrap}.vx-home-equity-total span{display:block;color:#87918d;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase}.vx-home-equity-total strong{display:block;margin-top:5px;color:#009452;font-size:22px;font-weight:550;font-variant-numeric:tabular-nums}
  .vx-home-equity-stage{flex:1;min-height:245px;margin-top:8px}.vx-home-equity-svg{display:block;width:100%;height:100%;min-height:245px;overflow:visible}
  .vx-home-equity-empty{display:flex;flex:1;align-items:center;justify-content:center;min-height:245px;margin-top:8px;border:1px dashed #d7e3dc;border-radius:18px;color:#7b8781;font-size:12px;text-align:center;padding:20px;box-sizing:border-box}
  .vx-home-equity-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px;padding-top:12px;border-top:1px solid #e8efeb;color:#8a9590;font-size:10.5px}.vx-home-equity-foot a{color:#4e6157;text-underline-offset:3px}
  .vx-home-split .vx-home-hero-copy{max-width:none;margin:0;padding:28px 8px;display:flex;min-height:410px;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box}
  .vx-home-split h1{max-width:610px;font-size:clamp(38px,4vw,52px);line-height:1.04}
  .vx-home-split .vx-home-hero-lead{max-width:590px}
  @media(max-width:940px){.vx-home-split{grid-template-columns:1fr;gap:24px;min-height:0}.vx-home-equity-preview,.vx-home-split .vx-home-hero-copy{min-height:0}.vx-home-split .vx-home-hero-copy{padding:14px 0 0}.vx-home-equity-stage,.vx-home-equity-svg,.vx-home-equity-empty{min-height:280px}}
  @media(max-width:600px){.vx-home-equity-preview{padding:18px 16px 14px;border-radius:22px}.vx-home-equity-head{flex-direction:column}.vx-home-equity-total{text-align:left}.vx-home-equity-stage,.vx-home-equity-svg,.vx-home-equity-empty{min-height:240px}.vx-home-equity-foot{align-items:flex-start;flex-direction:column}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const state={points:[]};
  const $=id=>document.getElementById(id);
  const money=value=>{const n=Number(value);if(!Number.isFinite(n))return '—';const sign=n>0?'+':n<0?'-':'';return sign+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
  const dateLabel=value=>{const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);if(!m)return value;return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3])));};
  const node=(name,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;return n;};
  function render(){
    const svg=$('vx-home-equity-svg'),stage=$('vx-home-equity-stage');if(!svg||!stage||!state.points.length)return;
    const pts=state.points.map(p=>({date:String(p.date||''),v:Number(p.cumulative_pnl)})).filter(p=>p.date&&Number.isFinite(p.v));if(!pts.length)return;
    const w=Math.max(stage.clientWidth||0,320),h=Math.max(stage.clientHeight||0,245),m={t:18,r:w<520?78:92,b:32,l:w<520?52:62};
    const vals=pts.map(p=>p.v).concat([0]),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,1),pad=span*.12,yMin=min-pad,yMax=max+pad;
    const x=i=>m.l+(pts.length===1?(w-m.l-m.r)/2:i*(w-m.l-m.r)/(pts.length-1));const y=v=>m.t+(yMax-v)*(h-m.t-m.b)/(yMax-yMin);
    svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.innerHTML='';
    for(let i=0;i<4;i++){const value=yMin+(yMax-yMin)*i/3,yy=y(value);svg.appendChild(node('line',{x1:m.l,y1:yy,x2:w-m.r,y2:yy,stroke:'#edf3ef','stroke-width':1}));svg.appendChild(node('text',{x:m.l-9,y:yy+4,'text-anchor':'end',fill:'#87918d','font-size':9},'$'+Math.round(value).toLocaleString('en-US')));}
    if(yMin<=0&&yMax>=0){const zy=y(0);svg.appendChild(node('line',{x1:m.l,y1:zy,x2:w-m.r,y2:zy,stroke:'#9eaaa4','stroke-width':1,'stroke-dasharray':'5 5'}));}
    const d=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1)).join(' ');svg.appendChild(node('path',{d,fill:'none',stroke:'#078f51','stroke-width':2.4,'stroke-linecap':'round','stroke-linejoin':'round'}));
    pts.forEach((p,i)=>svg.appendChild(node('circle',{cx:x(i),cy:y(p.v),r:i===pts.length-1?4:2.6,fill:i===pts.length-1?'#078f51':'#fff',stroke:'#078f51','stroke-width':1.4})));
    const labelCount=Math.min(4,pts.length);for(let i=0;i<labelCount;i++){const idx=Math.round(i*(pts.length-1)/Math.max(labelCount-1,1));svg.appendChild(node('text',{x:x(idx),y:h-7,'text-anchor':idx===0?'start':idx===pts.length-1?'end':'middle',fill:'#87918d','font-size':9},dateLabel(pts[idx].date)));}
    const last=pts[pts.length-1];svg.appendChild(node('text',{x:x(pts.length-1)+8,y:y(last.v)+4,fill:'#078f51','font-size':10,'font-weight':600},money(last.v)));
  }
  async function load(){
    const stage=$('vx-home-equity-stage'),empty=$('vx-home-equity-empty'),total=$('vx-home-equity-total'),status=$('vx-home-equity-status');if(!stage||!empty)return;
    try{const response=await fetch('/public-performance.json',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('unavailable');const data=await response.json();if(!data||!data.ok)throw new Error('unavailable');const e=data.equity_curve||{};state.points=Array.isArray(e.points)?e.points:[];if(total)total.textContent=money(e.total_realized_pnl);if(status)status.textContent=data.stale?'Last verified snapshot':'Verified · Closed Trades ledger';if(state.points.length){stage.hidden=false;empty.hidden=true;render();}else{stage.hidden=true;empty.hidden=false;empty.textContent='No closed trades with realized P&L are available yet.';}}
    catch(_){stage.hidden=true;empty.hidden=false;empty.textContent='Verified performance is temporarily unavailable. No simulated values are shown.';if(total)total.textContent='—';if(status)status.textContent='Performance source unavailable';}
  }
  let timer=null;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(render,120);});load();
})();
</script>`;

function injectAssets(html) {
  let result = html;
  if (!result.includes(`id="${STYLE_ID}"`)) result = result.includes("</head>") ? result.replace("</head>", `${styles}\n</head>`) : `${styles}${result}`;
  if (!result.includes(`id="${SCRIPT_ID}"`)) result = result.includes("</body>") ? result.replace("</body>", `${script}\n</body>`) : `${result}${script}`;
  return result;
}

function refineHomePerformance(html, path) {
  if (typeof html !== "string") return html;
  let result = refineTelegramNav(html);
  if (path !== HOME_PATH) return result;
  result = splitHomepageHero(result);
  if (result.includes(SPLIT_MARKER)) result = injectAssets(result);
  return result;
}

function installHomePerformanceRefinement(app) {
  app.use((req,res,next)=>{
    const originalPath=String(req.originalUrl||req.url||"").split("?")[0];
    const isRead=req.method==="GET"||req.method==="HEAD";
    if(!isRead)return next();
    const originalSend=res.send.bind(res);
    res.send=function sendWithHomePerformance(body){const type=String(res.getHeader("Content-Type")||"");if(typeof body==="string"&&(!type||type.includes("html")))body=refineHomePerformance(body,originalPath);return originalSend(body);};
    next();
  });
}

function copyExpressStatics(target,source){for(const key of Reflect.ownKeys(source)){if(["length","name","prototype","arguments","caller"].includes(String(key)))continue;const descriptor=Object.getOwnPropertyDescriptor(source,key);if(!descriptor)continue;try{Object.defineProperty(target,key,descriptor);}catch(_){}}Object.setPrototypeOf(target,Object.getPrototypeOf(source));}
function wrapExpress(expressFactory){if(typeof expressFactory!=="function"||expressFactory.__vixaleHomePerformanceWrapped)return expressFactory;function wrappedExpress(...args){const app=expressFactory(...args);installHomePerformanceRefinement(app);return app;}copyExpressStatics(wrappedExpress,expressFactory);Object.defineProperty(wrappedExpress,"__vixaleHomePerformanceWrapped",{value:true});return wrappedExpress;}

const originalLoad=Module._load;
Module._load=function vixaleHomePerformanceModuleLoad(request,parent,isMain){const loaded=originalLoad.call(this,request,parent,isMain);return request==="express"?wrapExpress(loaded):loaded;};

module.exports={HOME_PATH,TELEGRAM_URL,STYLE_ID,SCRIPT_ID,refineTelegramNav,findTagRangeFromOpen,findTagByClass,performanceCard,splitHomepageHero,injectAssets,refineHomePerformance,installHomePerformanceRefinement,wrapExpress};
