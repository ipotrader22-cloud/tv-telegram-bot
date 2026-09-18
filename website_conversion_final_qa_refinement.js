"use strict";

const fs = require("fs");
const Module = require("module");
const path = require("path");
const {
  DAY_TRIAL_DAYS,
  DAY_TRIAL_URL,
  SINGLE_SYSTEM_PRICE_MONTHLY,
  THREE_SYSTEM_BUNDLE_PRICE_MONTHLY,
  SYSTEMS,
} = require("./lib/website-commercial-offer");

const HOME_PATH = "/";
const GUIDE_PATH = "/trading-guide";
const SYSTEMS_PATH = "/trading-systems";
const PRICING_PATH = "/pricing";
const SITEMAP_PATH = "/sitemap.xml";
const PDF_ROUTE = "/download/trading-guide.pdf";
const PDF_SOURCE = path.join(__dirname, "Vixale_Trading_Guide.pdf.b64");
const CANONICAL_PRICING_URL = "https://www.vixale.com/pricing";
const PRICING_TITLE = "Vixale Pricing | $49 Single System & $99 Three-System Bundle";
const PRICING_DESCRIPTION = "Compare Vixale $49/month Single System and $99/month Three-System Bundle. Start the 30-day Day Trading Telegram signals trial; viewer access is separate.";
const STYLE_ID = "vx-issue123-pr7-final-style";
const SCRIPT_ID = "vx-issue123-pr7-final-script";

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0];
}

function loadGuidePdfBuffer() {
  const encoded = fs.readFileSync(PDF_SOURCE, "utf8").replace(/\s+/g, "");
  const pdf = Buffer.from(encoded, "base64");
  if (pdf.length < 8 || pdf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("Trading Guide PDF source is not a valid PDF payload");
  }
  return pdf;
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  const css = `<style id="${STYLE_ID}">
.vx-conversion-hero-copy h1{font-size:clamp(30px,3.5vw,42px)!important;font-weight:550!important;line-height:1.06!important;letter-spacing:-.035em!important;max-width:520px!important}
.vx-issue123-equity-svg{display:block;width:100%;height:100%}.vx-issue123-chart-empty{display:flex;height:100%;align-items:center;justify-content:center;color:#a9c3b7;font-size:12px}.quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.quick-item a{color:#d9f4e7;font-weight:750;text-decoration:underline;text-underline-offset:3px}
@media(max-width:720px){.quick-grid{grid-template-columns:1fr!important}.vx-guide-actions{width:100%}.vx-guide-actions a{width:100%;box-sizing:border-box}.guide-grid{grid-template-columns:1fr!important}}
</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${css}\n</head>`) : `${css}${html}`;
}

function renderCompactOptionsCard() {
  return `<article class="vx-guide-card" data-vx-final-options="protected-workflow">
        <p class="vx-guide-kicker">Options</p><h3 class="vx-guide-title">Protected journal → Daily updates → Closed evidence</h3>
        <div class="vx-guide-steps">
          <div class="vx-guide-step"><span class="vx-guide-num">1</span><div><strong>Start with the product overview</strong><span>Public visitors can see how the Options product is organized without exposing protected journal rows.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">2</span><div><strong>Request viewer access</strong><span>Free read-only viewer access is separate from the Day Trading Telegram trial and from paid subscriptions.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">3</span><div><strong>Check position updates</strong><span>Approved viewers can follow owner-entered position status through the existing protected Option Journal workflow.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">4</span><div><strong>Review closed evidence</strong><span>Closed-only realized P&amp;L and available owner-provided brokerage proof remain protected.</span></div></div>
        </div>
        <div class="vx-guide-example"><strong>Current release boundary</strong><code>Options is a website-update product. No public sample trade, execution recipe, or Swing/Options Telegram-delivery promise is added.</code></div>
        <a class="vx-guide-route" href="${SYSTEMS[2].path}">Open Options product →</a>
      </article>`;
}

function renderFullOptionsSection() {
  const steps = [
    ["Review the public overview", "Use the Options product page and Results page to understand the workflow and evidence boundary."],
    ["Request free viewer access", "Viewer access is read-only and separate from the 30-day Day Trading Telegram signals trial and from paid subscriptions."],
    ["Follow protected position updates", "Approved viewers can inspect owner-entered open, updated and closed position records in the existing protected viewer."],
    ["Review closed evidence", "Closed-only realized P&L and available owner-provided brokerage proof remain inside the protected record."],
  ];
  const rows = steps.map((item, index) => `<div class="guide-step"><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></div>`).join("");
  return `<section class="section" id="options" aria-labelledby="vx-guide-options-title" data-vx-final-options="protected-workflow"><div class="wrap"><div class="section-head"><div><div class="kicker">Options · Protected workflow</div><h2 id="vx-guide-options-title">Follow positions from open to close.</h2></div><p>Options remains a website-update product in this release. Public visitors get the overview; protected Option Journal rows, closed-position evidence and available owner-provided brokerage records require existing viewer access.</p></div><div class="guide-grid"><article class="guide-card"><div class="guide-steps">${rows}</div></article><aside class="example"><h3>Access &amp; pricing</h3><div class="rows"><div class="row"><span>Viewer access</span><b>Free · read-only</b></div><div class="row"><span>Single System</span><b>$${SINGLE_SYSTEM_PRICE_MONTHLY}/month</b></div><div class="row"><span>Three-System Bundle</span><b>$${THREE_SYSTEM_BUNDLE_PRICE_MONTHLY}/month</b></div><div class="row"><span>Current delivery</span><b>Website updates</b></div></div><div class="note">No public sample P&amp;L or fabricated Options trades are shown. Swing and Options Telegram signal delivery is not promised in this release.</div><div class="vx-guide-actions" style="margin-top:14px"><a class="vx-guide-btn primary" href="/access?system=options">Request Viewer Access</a><a class="vx-guide-btn" href="${SYSTEMS[2].path}">Open Options</a></div></aside></div></div></section>`;
}

function renderCommerceSection() {
  return `<section class="wrap quick" aria-labelledby="vx-guide-choose-title" data-vx-final-commerce="1"><h2 id="vx-guide-choose-title">Choose how you want to follow Vixale</h2><p>There are exactly three trading systems. The free trial, viewer access, paid subscriptions and custom Services are separate paths.</p><div class="quick-grid"><div class="quick-item"><strong>${DAY_TRIAL_DAYS}-day Day Trading trial</strong><span>Free Day Trading Telegram signals only. <a href="${DAY_TRIAL_URL}" target="_blank" rel="noopener noreferrer">Get 30 Days Free →</a></span></div><div class="quick-item"><strong>Single System · $${SINGLE_SYSTEM_PRICE_MONTHLY}/month</strong><span>Choose Day Trading, Swing Trading, or Options. <a href="/pricing">Compare pricing →</a></span></div><div class="quick-item"><strong>Three-System Bundle · $${THREE_SYSTEM_BUNDLE_PRICE_MONTHLY}/month</strong><span>Includes exactly Day Trading, Swing Trading, and Options. <a href="/pricing">View bundle →</a></span></div><div class="quick-item"><strong>Viewer access &amp; Services</strong><span>Viewer access is free and read-only. Bespoke setup, development and automation Services remain separate. <a href="/access">Viewer access →</a> · <a href="/services">Services →</a></span></div></div></section>`;
}

function refineGuideHtml(html) {
  if (typeof html !== "string") return html;
  let out = html;
  out = out.replace(/Beginner-friendly Vixale execution guide for Prime, Edge, Swing Trading, and Options Straddles\./g, "Vixale guide for Day Trading, Swing Trading, Options, the 30-day Day Trading Telegram trial, viewer access, pricing, and Services.");
  out = out.replace(/<h1>How to Trade Vixale<\/h1><p>[\s\S]*?<\/p><div class="flow"><b>VIXALE SIGNAL<\/b><i>→<\/i><b>YOUR BROKER<\/b><i>→<\/i><b>POSITION MANAGEMENT<\/b><\/div>/i, '<h1>How to Trade Vixale</h1><p>Use this guide to understand how to follow Day Trading and Swing instructions, how Options position updates are presented, and where the trial, pricing, viewer access, and Services fit.</p><div class="flow"><b>CHOOSE A SYSTEM</b><i>→</i><b>FOLLOW ITS UPDATE</b><i>→</i><b>REVIEW RESULTS</b></div>');
  out = out.replace(/<a href="#options"><span>Straddles<\/span><b>Options<\/b><\/a>/i, '<a href="#options"><span>Protected journal</span><b>Options</b></a>');
  out = out.replace(/<section class="section" id="options">[\s\S]*?<\/section>/i, renderFullOptionsSection());
  out = out.replace(/<section class="wrap quick">[\s\S]*?<\/section>/i, renderCommerceSection());
  out = out.replace(/<footer class="footer"><div class="wrap">Examples are educational and illustrative\.[\s\S]*?<\/div><\/footer>/i, '<footer class="footer"><div class="wrap">Day Trading and Swing examples are educational and illustrative. Actual fills can differ because of market movement, slippage, spreads, commissions, and position size. Options public content intentionally avoids an execution example.</div></footer>');
  return injectStyles(out);
}

function refineSystemsHtml(html) {
  if (typeof html !== "string") return html;
  let out = html;
  out = out.replace(/Vixale delivers the signal or portfolio instruction\. You execute and manage the order in your own broker platform\./g, "Day Trading and Swing publish followable instructions; Options uses protected position updates. Choose the system that matches how you want to follow Vixale.");
  out = out.replace(/<article class="vx-guide-card">\s*<p class="vx-guide-kicker">Options · Straddles<\/p>[\s\S]*?<\/article>/i, renderCompactOptionsCard());
  return injectStyles(out);
}

function refinePricingSeo(html) {
  if (typeof html !== "string") return html;
  let out = html;
  out = replaceTag(out, /<title>[\s\S]*?<\/title>/i, `<title>${PRICING_TITLE}</title>`);
  out = replaceTag(out, /<meta\b[^>]*name=["']description["'][^>]*>/i, `<meta name="description" content="${PRICING_DESCRIPTION}">`);
  out = replaceTag(out, /<meta\b[^>]*property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${PRICING_TITLE}">`);
  out = replaceTag(out, /<meta\b[^>]*property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${PRICING_DESCRIPTION}">`);
  out = replaceTag(out, /<meta\b[^>]*property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${CANONICAL_PRICING_URL}">`);
  out = replaceTag(out, /<link\b[^>]*rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${CANONICAL_PRICING_URL}">`);
  return out;
}

function refineSitemapXml(xml) {
  if (typeof xml !== "string" || xml.includes(`<loc>${CANONICAL_PRICING_URL}</loc>`)) return xml;
  const entry = `  <url><loc>${CANONICAL_PRICING_URL}</loc></url>\n`;
  return xml.includes("</urlset>") ? xml.replace("</urlset>", `${entry}</urlset>`) : `${xml}\n${entry}`;
}

const homeChartScript = `<script id="${SCRIPT_ID}">(() => {
const ns='http://www.w3.org/2000/svg';
const money=v=>{const n=Number(v);if(!Number.isFinite(n))return'—';const a=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});return(n<0?'-$':'$')+a};
const date=v=>{const m=String(v||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);if(!m)return String(v||'');return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3])))};
function chart(points,id){const pts=(Array.isArray(points)?points:[]).map(p=>({date:String(p&&p.date||''),value:Number(p&&p.cumulative_pnl)})).filter(p=>p.date&&Number.isFinite(p.value));if(!pts.length)return null;const w=720,h=220,m={t:16,r:78,b:28,l:62};const vals=pts.map(p=>p.value).concat([0]),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,1),pad=span*.1,y0=min-pad,y1=max+pad;const x=i=>m.l+(pts.length===1?(w-m.l-m.r)/2:i*(w-m.l-m.r)/(pts.length-1));const y=v=>m.t+(y1-v)*(h-m.t-m.b)/(y1-y0);const svg=document.createElementNS(ns,'svg');svg.setAttribute('id',id);svg.setAttribute('class','vx-issue123-equity-svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('role','img');svg.setAttribute('aria-label','Day Trading realized P&L equity curve');for(let i=0;i<4;i++){const v=y0+(y1-y0)*i/3,yy=y(v),line=document.createElementNS(ns,'line');line.setAttribute('x1',m.l);line.setAttribute('x2',w-m.r);line.setAttribute('y1',yy.toFixed(1));line.setAttribute('y2',yy.toFixed(1));line.setAttribute('stroke','rgba(255,255,255,.12)');svg.appendChild(line);const t=document.createElementNS(ns,'text');t.setAttribute('x',m.l-8);t.setAttribute('y',(yy+4).toFixed(1));t.setAttribute('text-anchor','end');t.setAttribute('fill','#9eb8ac');t.setAttribute('font-size','10');t.textContent=money(v);svg.appendChild(t)}const p=document.createElementNS(ns,'path');p.setAttribute('d',pts.map((q,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(q.value).toFixed(1)).join(' '));p.setAttribute('fill','none');p.setAttribute('stroke','#69d99d');p.setAttribute('stroke-width','2.5');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.appendChild(p);const indexes=[0,Math.floor((pts.length-1)/2),pts.length-1].filter((v,i,a)=>a.indexOf(v)===i);indexes.forEach((idx,pos)=>{const t=document.createElementNS(ns,'text');t.setAttribute('x',x(idx).toFixed(1));t.setAttribute('y',h-7);t.setAttribute('text-anchor',pos===0?'start':pos===indexes.length-1?'end':'middle');t.setAttribute('fill','#9eb8ac');t.setAttribute('font-size','10');t.textContent=date(pts[idx].date);svg.appendChild(t)});return svg}
function apply(points){const top=document.getElementById('vx-conversion-day-chart');const bottom=document.getElementById('vx-home-equity-stage');const empty=document.getElementById('vx-home-equity-empty');const a=chart(points,'vx-conversion-day-equity-svg'),b=chart(points,'vx-home-equity-svg');if(top){if(a)top.replaceChildren(a);else top.innerHTML='<div class="vx-issue123-chart-empty">Realized-results chart unavailable.</div>'}if(bottom){if(b){bottom.hidden=false;bottom.replaceChildren(b);if(empty)empty.hidden=true}else if(empty){empty.hidden=false}}const title=document.getElementById('vx-home-equity-title');if(title&&/Open P&L Equity Curve/i.test(title.textContent||''))title.textContent='Realized P&L Equity Curve'}
async function refresh(){try{const r=await fetch('/public-performance.json',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)return;const d=await r.json();if(d&&d.ok)apply(d.equity_curve&&d.equity_curve.points)}catch(_){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();</script>`;

function refineHomeHtml(html) {
  if (typeof html !== "string") return html;
  let out = injectStyles(html);
  out = out.replace(/>Open P&amp;L Equity Curve</gi, ">Realized P&amp;L Equity Curve");
  out = out.replace(/>Open P&L Equity Curve</gi, ">Realized P&L Equity Curve");
  if (!out.includes(`id="${SCRIPT_ID}"`)) out = out.includes("</body>") ? out.replace("</body>", `${homeChartScript}\n</body>`) : `${out}${homeChartScript}`;
  return out;
}

function refineHtml(html, pathname) {
  if (pathname === HOME_PATH) return refineHomeHtml(html);
  if (pathname === GUIDE_PATH) return refineGuideHtml(html);
  if (pathname === SYSTEMS_PATH) return refineSystemsHtml(html);
  if (pathname === PRICING_PATH) return refinePricingSeo(html);
  return html;
}

function installFinalQaRefinement(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const method = String(req.method || "GET").toUpperCase();
    const isRead = method === "GET" || method === "HEAD";
    if (!isRead) return next();

    if (pathname === PDF_ROUTE) {
      try {
        const pdf = loadGuidePdfBuffer();
        res.status(200);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="Vixale_Trading_Guide.pdf"');
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Content-Length", String(pdf.length));
        return method === "HEAD" ? res.end() : res.end(pdf);
      } catch (error) {
        return next(error);
      }
    }

    if (![HOME_PATH, GUIDE_PATH, SYSTEMS_PATH, PRICING_PATH, SITEMAP_PATH].includes(pathname)) return next();
    const send = res.send.bind(res);
    res.send = function sendWithFinalQa(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (pathname === SITEMAP_PATH && typeof body === "string") body = refineSitemapXml(body);
      else if (typeof body === "string" && (!type || type.includes("html"))) body = refineHtml(body, pathname);
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
  if (typeof factory !== "function" || factory.__vixaleIssue123Pr7Wrapped) return factory;
  function wrapped(...args) { const app = factory(...args); installFinalQaRefinement(app); return app; }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleIssue123Pr7Wrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleIssue123Pr7ModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  GUIDE_PATH,
  SYSTEMS_PATH,
  PRICING_PATH,
  SITEMAP_PATH,
  PDF_ROUTE,
  PDF_SOURCE,
  CANONICAL_PRICING_URL,
  PRICING_TITLE,
  PRICING_DESCRIPTION,
  loadGuidePdfBuffer,
  renderCompactOptionsCard,
  renderFullOptionsSection,
  renderCommerceSection,
  refineGuideHtml,
  refineSystemsHtml,
  refinePricingSeo,
  refineSitemapXml,
  refineHomeHtml,
  refineHtml,
  installFinalQaRefinement,
  wrapExpress,
};
