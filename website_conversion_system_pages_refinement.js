"use strict";

const Module = require("module");
const { DAY_TRIAL_URL, SINGLE_SYSTEM_PRICE_MONTHLY, SYSTEMS } = require("./lib/website-commercial-offer");

const DAY_PATH = SYSTEMS[0].path;
const SWING_PATH = SYSTEMS[1].path;
const OPTIONS_PATH = SYSTEMS[2].path;
const PUBLIC_PERFORMANCE_PATH = "/public-performance.json";
const LIVE_OPEN_PNL_PATH = "/public-live-open-pnl.json";
const STYLE_ID = "vx-conversion-system-pages-style";
const DAY_SCRIPT_ID = "vx-conversion-day-page-script";
const PAGE_MARKER = "data-vx-conversion-system-page";
const SUPPORTED_PATHS = new Set([DAY_PATH, SWING_PATH, OPTIONS_PATH]);

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function tagRange(html, tag, start) {
  if (start < 0) return null;
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const re = new RegExp(`<\\/?${escapeRegex(tag)}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0, match;
  while ((match = re.exec(html))) {
    depth += new RegExp(`^<\\/${escapeRegex(tag)}\\b`, "i").test(match[0]) ? -1 : 1;
    if (depth === 0) return { start, end: re.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
  }
  return null;
}
function rangeByClass(html, tag, className) {
  const re = new RegExp(`<${escapeRegex(tag)}\\b[^>]*class=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "i");
  const match = re.exec(String(html || ""));
  return match ? tagRange(html, tag, match.index) : null;
}
function replaceMain(html, inner) {
  const start = String(html || "").search(/<main\b/i);
  const range = tagRange(html, "main", start);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${inner}\n` + html.slice(range.closeStart);
}
function removeClassBlock(html, tag, className) {
  const range = rangeByClass(html, tag, className);
  return range ? html.slice(0, range.start) + html.slice(range.end) : html;
}
function setTitle(html, title) {
  return /<title>[\s\S]*?<\/title>/i.test(html) ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`) : html;
}
function offerLine(label) {
  return `<div class="vx-conversion-offer-line"><strong>${label}</strong><span>$${SINGLE_SYSTEM_PRICE_MONTHLY}/month · Single System</span></div>`;
}
function renderDayMain() {
  return `<div class="vx-conversion-system-shell" ${PAGE_MARKER}="day">
    <section class="vx-conversion-system-hero"><div><span>DAY TRADING</span><h1>Live stock signals and P&amp;L.</h1><p>Follow entries, exits, targets, stop levels and current Day Trading performance. Start with the 30-day Day Trading Telegram signals trial or inspect the public results first.</p><div class="vx-conversion-system-actions"><a class="primary" href="${DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a><a href="/results#day-trading">View Day Trading Results</a></div>${offerLine("Day Trading")}</div></section>
    <section class="vx-conversion-working-screen" aria-labelledby="vx-day-live-title"><div class="vx-conversion-screen-head"><div><span>WORKING SCREEN</span><h2 id="vx-day-live-title">Day Trading — Live Overview</h2></div><div id="vx-day-source-state">Loading current public status…</div></div><div class="vx-conversion-metric-grid"><div><span>Open Positions</span><strong id="vx-day-open">—</strong></div><div><span>Open P&amp;L</span><strong id="vx-day-open-pnl">—</strong></div><div><span>Closed P&amp;L Today</span><strong id="vx-day-closed-today">—</strong></div><div><span>Total Realized P&amp;L</span><strong id="vx-day-total">—</strong></div></div><div class="vx-conversion-day-chart"><svg id="vx-day-chart" viewBox="0 0 720 220" role="img" aria-label="Day Trading realized P&L equity curve"></svg><div id="vx-day-chart-empty">Loading realized-results history…</div></div><div class="vx-conversion-screen-foot"><span id="vx-day-updated">Last updated: checking…</span><a href="/closed-trades">Open Closed Trades Archive →</a></div></section>
    <section class="vx-conversion-proof-row"><article><span>RESULTS</span><h2>See the record before subscribing.</h2><p>Review Day Trading realized results and the public Closed Trades archive. Open P&amp;L remains separate from realized P&amp;L.</p><a href="/results#day-trading">Day Trading Results →</a></article><article><span>HOW TO FOLLOW</span><h2>Watch the screen. Receive Day signals.</h2><p>Use the website for current Day Trading status and results. The 30-day free trial applies only to Day Trading Telegram signals.</p><a href="/trading-guide">Day Trading Guide →</a></article></section>
    <section class="vx-conversion-next"><div><span>SINGLE SYSTEM</span><strong>Day Trading · $${SINGLE_SYSTEM_PRICE_MONTHLY}/month</strong><p>Pricing is presented here for comparison; the existing website does not invent automatic checkout or billing behavior.</p></div><a href="/pricing?system=day-trading">View Pricing</a></section>
  </div>`;
}
function renderOptionsMain() {
  return `<div class="vx-conversion-system-shell" ${PAGE_MARKER}="options">
    <section class="vx-conversion-system-hero"><div><span>OPTIONS</span><h1>Follow positions from open to close.</h1><p>Track an actively managed Options workflow with daily position updates. Public visitors get the product overview; protected journal rows, closed-position details and supporting brokerage records remain behind existing viewer access.</p><div class="vx-conversion-system-actions"><a class="primary" href="/access?system=options">Get Dashboard Access</a><a href="/results#options">View Options Results</a></div>${offerLine("Options")}</div></section>
    <section class="vx-conversion-working-screen vx-options-screen" aria-labelledby="vx-options-screen-title"><div class="vx-conversion-screen-head"><div><span>POSITION WORKFLOW</span><h2 id="vx-options-screen-title">Options — Daily Position Updates</h2></div><div>Protected journal</div></div><div class="vx-options-flow"><article><span>OPEN</span><strong>New positions</strong><p>Owner-entered trade records are added through the existing Option Journal workflow.</p></article><article><span>UPDATE</span><strong>Position progress</strong><p>Trade status remains part of the existing protected viewer record.</p></article><article><span>CLOSE</span><strong>Completed trades</strong><p>Closed-only realized P&amp;L and available brokerage proof remain protected.</p></article></div><div class="vx-conversion-screen-foot"><span>No sample P&amp;L or fabricated trades are shown publicly.</span><a href="/trading-systems/options/viewer">Open Options Viewer →</a></div></section>
    <section class="vx-conversion-proof-row"><article><span>RESULTS</span><h2>Review the Options evidence boundary.</h2><p>The public Results page explains the owner-entered journal source. Approved viewers can inspect the protected record and available owner-provided brokerage screenshots.</p><a href="/results#options">Options Results →</a></article><article><span>HOW TO FOLLOW</span><h2>Check published position updates.</h2><p>Options remains a website-update product in this release. Swing and Options Telegram signal delivery is not being promised.</p><a href="/access?system=options">Request Viewer Access →</a></article></section>
    <section class="vx-conversion-next"><div><span>SINGLE SYSTEM</span><strong>Options · $${SINGLE_SYSTEM_PRICE_MONTHLY}/month</strong><p>Use Pricing to compare a single system with the three-system bundle.</p></div><a href="/pricing?system=options">View Pricing</a></section>
  </div>`;
}
function refineSwing(html) {
  let out = removeClassBlock(html, "div", "vx-swing-access");
  out = out.replace(/<div class="eyebrow">[\s\S]*?<\/div>\s*<h1>[\s\S]*?<\/h1>\s*(?:<div class="vx-swing-sequence-label">[\s\S]*?<\/div>)?\s*<p class="hero-copy">[\s\S]*?<\/p>/i,
    `<div class="eyebrow">SWING TRADING</div><h1>Follow a portfolio reviewed every day.</h1><p class="hero-copy">A public research/model portfolio built around Vixale's proprietary ranking system. Review open positions, potential candidates, completed trades and model equity history from the latest published update.</p><div class="vx-conversion-swing-actions"><a class="primary" href="#active-portfolio">View Active Portfolio</a><a href="/results#swing-trading">View Swing Results</a><a href="/pricing?system=swing-trading">$${SINGLE_SYSTEM_PRICE_MONTHLY}/month</a></div>`);
  out = out.replace(/Quotes\s+GOOGLEFINANCE\s+·\s+may be delayed/gi, "Latest published portfolio update");
  out = out.replace(/Quotes may be delayed; this is not broker execution\.?/gi, "Reviewed each trading morning; this is a research/model portfolio, not broker execution.");
  out = out.replace(/<main\b([^>]*)>/i, `<main$1 ${PAGE_MARKER}="swing">`);
  return out;
}

const styles = `<style id="${STYLE_ID}">
.vx-conversion-system-shell{max-width:1160px;margin:0 auto;padding:46px 24px 72px;box-sizing:border-box;color:#17211d}.vx-conversion-system-hero{display:grid;grid-template-columns:minmax(0,1fr);padding:14px 0 34px}.vx-conversion-system-hero>div{max-width:850px}.vx-conversion-system-hero span,.vx-conversion-working-screen .vx-conversion-screen-head span,.vx-conversion-proof-row article>span,.vx-conversion-next span{color:#287153;font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.vx-conversion-system-hero h1{max-width:760px;margin:10px 0 0;font-size:clamp(42px,5vw,62px);font-weight:530;line-height:1.02;letter-spacing:-.045em;text-wrap:balance}.vx-conversion-system-hero p{max-width:760px;margin:15px 0 0;color:#596761;font-size:16px;line-height:1.62}.vx-conversion-system-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.vx-conversion-system-actions a,.vx-conversion-next>a,.vx-conversion-swing-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 17px;border:1px solid #c7d8cf;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:12.5px;font-weight:750}.vx-conversion-system-actions a.primary,.vx-conversion-swing-actions a.primary{border-color:#078f51;background:#078f51;color:#fff}.vx-conversion-offer-line{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px;color:#5f6d67;font-size:12.5px}.vx-conversion-offer-line strong{color:#176442}.vx-conversion-working-screen{margin-top:8px;padding:26px;border:1px solid #194c39;border-radius:25px;background:linear-gradient(145deg,#0e3024,#174b38);color:#fff;box-shadow:0 20px 50px rgba(13,48,35,.14)}.vx-conversion-screen-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.vx-conversion-screen-head h2{margin:6px 0 0;color:#fff;font-size:29px;font-weight:560;letter-spacing:-.025em}.vx-conversion-screen-head>div:last-child{color:#bdd3c8;font-size:11.5px}.vx-conversion-metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:20px}.vx-conversion-metric-grid>div{padding:14px;border:1px solid rgba(255,255,255,.11);border-radius:14px;background:rgba(255,255,255,.05)}.vx-conversion-metric-grid span{display:block;color:#b9cec3;font-size:10.5px}.vx-conversion-metric-grid strong{display:block;margin-top:7px;font-size:20px;font-weight:580;font-variant-numeric:tabular-nums}.vx-conversion-metric-grid strong.positive{color:#7fe4ac}.vx-conversion-metric-grid strong.negative{color:#ffaaa7}.vx-conversion-day-chart{position:relative;height:220px;margin-top:14px;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:rgba(255,255,255,.035);overflow:hidden}.vx-conversion-day-chart svg{width:100%;height:100%;display:block}.vx-conversion-day-chart>div{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#aac2b6;font-size:12px}.vx-conversion-screen-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:13px;color:#b9cec3;font-size:11.5px}.vx-conversion-screen-foot a{color:#e2f4eb;text-decoration:none;font-weight:700}.vx-conversion-proof-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:28px}.vx-conversion-proof-row article{padding:23px;border:1px solid #dce6e1;border-radius:20px;background:#fff}.vx-conversion-proof-row h2{margin:8px 0 0;font-size:24px;font-weight:560;letter-spacing:-.025em}.vx-conversion-proof-row p{margin:9px 0 0;color:#5f6d67;font-size:13.5px;line-height:1.55}.vx-conversion-proof-row a{display:inline-block;margin-top:15px;color:#176442;font-size:12.5px;font-weight:750;text-decoration:none}.vx-conversion-next{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:18px;padding:21px 23px;border:1px solid #cfe4d8;border-radius:20px;background:#f3faf6}.vx-conversion-next strong{display:block;margin-top:5px;font-size:19px}.vx-conversion-next p{margin:5px 0 0;color:#65716c;font-size:12.5px}.vx-options-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:20px}.vx-options-flow article{padding:17px;border:1px solid rgba(255,255,255,.11);border-radius:14px;background:rgba(255,255,255,.05)}.vx-options-flow article span{color:#98d5b7;font-size:10px;font-weight:800;letter-spacing:.08em}.vx-options-flow article strong{display:block;margin-top:6px;font-size:18px}.vx-options-flow article p{margin:7px 0 0;color:#c0d4c9;font-size:12px;line-height:1.5}.vx-conversion-swing-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.hero-layout .vx-conversion-swing-actions a{color:#17211d}.hero-layout .vx-conversion-swing-actions a.primary{color:#fff}@media(max-width:760px){.vx-conversion-system-shell{padding:28px 16px 54px}.vx-conversion-metric-grid,.vx-options-flow,.vx-conversion-proof-row{grid-template-columns:1fr 1fr}.vx-conversion-next{align-items:flex-start;flex-direction:column}.vx-conversion-next>a{width:100%;box-sizing:border-box}}@media(max-width:520px){.vx-conversion-system-hero h1{font-size:38px}.vx-conversion-metric-grid,.vx-options-flow,.vx-conversion-proof-row{grid-template-columns:1fr}.vx-conversion-working-screen{padding:18px}.vx-conversion-screen-head{flex-direction:column}.vx-conversion-day-chart{height:180px}.vx-conversion-system-actions a{width:100%;box-sizing:border-box}}
</style>`;

const dayScript = `<script id="${DAY_SCRIPT_ID}">(() => {
const ids={open:'vx-day-open',openPnl:'vx-day-open-pnl',closedToday:'vx-day-closed-today',total:'vx-day-total',state:'vx-day-source-state',updated:'vx-day-updated',chart:'vx-day-chart',empty:'vx-day-chart-empty'};const el=k=>document.getElementById(ids[k]);if(!el('open'))return;
const money=v=>{const n=Number(v);if(!Number.isFinite(n))return'—';const a=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return n>0?'+$'+a:n<0?'-$'+a:'$0.00'};const applyClass=(node,v)=>{node.classList.remove('positive','negative');const n=Number(v);if(n>0)node.classList.add('positive');if(n<0)node.classList.add('negative')};
const renderChart=points=>{const svg=el('chart'),empty=el('empty');const p=(Array.isArray(points)?points:[]).map(x=>({v:Number(x.cumulative_pnl)})).filter(x=>Number.isFinite(x.v));if(!svg||!p.length){if(empty)empty.textContent='No realized-results history is available.';return}if(empty)empty.remove();const w=720,h=220,l=44,r=18,t=18,b=28,vals=p.map(x=>x.v).concat([0]),min0=Math.min(...vals),max0=Math.max(...vals),span=Math.max(max0-min0,1),pad=span*.1,min=min0-pad,max=max0+pad,x=i=>l+(p.length===1?(w-l-r)/2:i*(w-l-r)/(p.length-1)),y=v=>t+(max-v)*(h-t-b)/(max-min),zy=y(0),ns='http://www.w3.org/2000/svg';svg.replaceChildren();const line=document.createElementNS(ns,'line');[['x1',l],['x2',w-r],['y1',zy],['y2',zy],['stroke','#9bb4a8'],['stroke-dasharray','5 5']].forEach(([k,v])=>line.setAttribute(k,v));svg.appendChild(line);const poly=document.createElementNS(ns,'polyline');poly.setAttribute('fill','none');poly.setAttribute('stroke','#66d99d');poly.setAttribute('stroke-width','3');poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');poly.setAttribute('points',p.map((q,i)=>x(i)+','+y(q.v)).join(' '));svg.appendChild(poly)};
Promise.allSettled([fetch('${PUBLIC_PERFORMANCE_PATH}',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():Promise.reject()),fetch('${LIVE_OPEN_PNL_PATH}',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():Promise.reject())]).then(([perf,live])=>{if(perf.status==='fulfilled'&&perf.value&&perf.value.ok){const d=perf.value,s=d.summary||{},eq=d.equity_curve||{};el('open').textContent=Number.isFinite(Number(s.open_count))?String(Number(s.open_count)):'—';el('closedToday').textContent=money(s.closed_pnl_today);applyClass(el('closedToday'),s.closed_pnl_today);el('total').textContent=money(eq.total_realized_pnl);applyClass(el('total'),eq.total_realized_pnl);el('state').textContent=d.stale?'Last validated public snapshot':'Public source loaded';el('updated').textContent='Last updated: '+(d.updated_at?new Date(d.updated_at).toLocaleString():'unavailable');renderChart(eq.points)}else{el('state').textContent='Public Day Trading status unavailable';el('updated').textContent='Last updated: unavailable';renderChart([])}if(live.status==='fulfilled'&&live.value&&live.value.ok){el('openPnl').textContent=money(live.value.open_pnl);applyClass(el('openPnl'),live.value.open_pnl)}});
})();</script>`;

function injectAssets(html, path) {
  let out = html;
  if (!out.includes(`id="${STYLE_ID}"`)) out = out.includes("</head>") ? out.replace("</head>", `${styles}\n</head>`) : `${styles}${out}`;
  if (path === DAY_PATH && !out.includes(`id="${DAY_SCRIPT_ID}"`)) out = out.includes("</body>") ? out.replace("</body>", `${dayScript}\n</body>`) : `${out}${dayScript}`;
  return out;
}
function refineSystemPage(html, path) {
  if (typeof html !== "string" || !SUPPORTED_PATHS.has(path)) return html;
  let out = html;
  if (path === DAY_PATH) out = replaceMain(setTitle(out, "Vixale | Day Trading"), renderDayMain());
  else if (path === OPTIONS_PATH) out = replaceMain(setTitle(out, "Vixale | Options"), renderOptionsMain());
  else out = refineSwing(setTitle(out, "Vixale | Swing Trading"));
  return injectAssets(out, path);
}
function installConversionSystemPages(app) {
  app.use((req,res,next)=>{const method=String(req.method||"GET").toUpperCase(),path=String(req.path||req.url||"/").split("?")[0];if((method!=="GET"&&method!=="HEAD")||!SUPPORTED_PATHS.has(path))return next();const send=res.send.bind(res);res.send=function(body){const type=String(res.getHeader?.("Content-Type")||"");if(typeof body==="string"&&(!type||type.includes("html"))&&res.statusCode<300)body=refineSystemPage(body,path);return send(body)};return next()});
}
function copyExpressStatics(target,source){for(const key of Reflect.ownKeys(source)){if(["length","name","prototype","arguments","caller"].includes(String(key)))continue;const descriptor=Object.getOwnPropertyDescriptor(source,key);if(descriptor)try{Object.defineProperty(target,key,descriptor)}catch(_){}}Object.setPrototypeOf(target,Object.getPrototypeOf(source))}
function wrapExpress(factory){if(typeof factory!=="function"||factory.__vixaleConversionSystemPagesWrapped)return factory;function wrapped(...args){const app=factory(...args);installConversionSystemPages(app);return app}copyExpressStatics(wrapped,factory);Object.defineProperty(wrapped,"__vixaleConversionSystemPagesWrapped",{value:true});return wrapped}
const originalLoad=Module._load;Module._load=function(request,parent,isMain){const loaded=originalLoad.call(this,request,parent,isMain);return request==="express"?wrapExpress(loaded):loaded};
module.exports={DAY_PATH,SWING_PATH,OPTIONS_PATH,PUBLIC_PERFORMANCE_PATH,LIVE_OPEN_PNL_PATH,STYLE_ID,DAY_SCRIPT_ID,PAGE_MARKER,SUPPORTED_PATHS,tagRange,rangeByClass,replaceMain,removeClassBlock,renderDayMain,renderOptionsMain,refineSwing,injectAssets,refineSystemPage,installConversionSystemPages,wrapExpress};
