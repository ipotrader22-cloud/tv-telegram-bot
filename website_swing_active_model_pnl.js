"use strict";

const Module = require("module");
const { valuationNoticeParts, valuationTranslations } = require('./lib/swing-valuation-copy');

const SWING_PATH = "/trading-systems/swing-trading";
const QUOTE_API_PATH = "/api/swing-leaders";
const QUOTE_REFRESH_MS = 60 * 1000;
const MODEL_ALLOCATION_PER_POSITION = 10000;
const PAGE_MARKER = 'data-vx-swing-active-model-pnl="1"';
const STYLE_ID = "vx-swing-active-model-pnl-style";
const SCRIPT_ID = "vx-swing-active-quote-refresh-script";

const styles = `<style id="${STYLE_ID}">
tr[data-vx-model-entry-price] > td[data-label="Current"]{font-weight:700}
.vx-model-shares,.vx-model-open-pnl,.vx-model-reference-price{white-space:nowrap}
.vx-current-model-pnl-wrap{text-align:right}.equity-grid-line{stroke:#dfe8e3;stroke-width:.8}.equity-grid-vertical{stroke-dasharray:2 4}.equity-grid-label,.equity-date-tick{font-size:8.5px}
.vx-current-model-pnl{display:block;font-size:16px;font-weight:650}
@media(max-width:720px){.vx-model-shares,.vx-model-open-pnl{white-space:normal}}
</style>`;

const quoteRefreshScript = `<script id="${SCRIPT_ID}">(() => {
const API_PATH=${JSON.stringify(QUOTE_API_PATH)};
const REFRESH_MS=${QUOTE_REFRESH_MS};
const ALLOCATION=${MODEL_ALLOCATION_PER_POSITION};
const valuationNoticeParts=${valuationNoticeParts.toString()};
const valuationTranslations=new Map(${JSON.stringify(valuationTranslations)});
const localized=value=>document.documentElement.lang==="ru"?(valuationTranslations.get(value)||value):value;
const clean=value=>String(value==null?"":value).trim();
const moneyNumber=value=>{const text=clean(value).replace(/,/g,"");const accounting=text.match(/^\\(\\s*\\$?\\s*(\\d+(?:\\.\\d+)?)\\s*\\)$/);if(accounting)return-Number(accounting[1]);const standard=text.match(/^([+-]?)\\s*\\$?\\s*(\\d+(?:\\.\\d+)?)$/);if(!standard)return NaN;const number=Number(standard[2]);return standard[1]==="-"?-number:number};
const percentNumber=value=>{const match=clean(value).match(/^([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))%$/);return match?Number(match[1]):NaN};
const stateClass=value=>Number(value)>0?"gain":Number(value)<0?"loss":"flat";
const money=value=>{const number=Number(value);if(!Number.isFinite(number))return"—";const absolute=Math.abs(number).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});return number>0?"+$"+absolute:number<0?"-$"+absolute:"$0.00"};
const setState=(node,value)=>{if(!node)return;node.classList.remove("gain","loss","flat");node.classList.add(stateClass(value))};
const SVG_NS="http://www.w3.org/2000/svg";
const shortDate=value=>{const m=clean(value).match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);return m?(m[2]+"/"+m[3]):clean(value)};
const enhanceEquityChart=()=>{const svg=document.querySelector(".equity-chart-card .equity-chart-svg");if(!svg||svg.dataset.vxAxes==="1")return;const vb=(svg.getAttribute("viewBox")||"0 0 430 210").split(/\\s+/).map(Number);const width=vb[2]||430,height=vb[3]||210;const points=Array.from(svg.querySelectorAll("circle.equity-point"));if(!points.length)return;const baseline=svg.querySelector(".zero-baseline");const left=Number(baseline?.getAttribute("x1"))||52;const right=width-(Number(baseline?.getAttribute("x2"))||width-14);const topLabel=Array.from(svg.querySelectorAll(".equity-axis-label")).find(n=>n!==svg.querySelector(".equity-zero-label")&&Number(n.getAttribute("y"))<height/2);const bottomLabel=Array.from(svg.querySelectorAll(".equity-axis-label")).filter(n=>n!==svg.querySelector(".equity-zero-label")).sort((a,b)=>Number(b.getAttribute("y"))-Number(a.getAttribute("y")))[0];const upper=moneyNumber(topLabel?.textContent),lower=moneyNumber(bottomLabel?.textContent);const top=Number(topLabel?.getAttribute("y"))-4||42;const bottomY=Number(bottomLabel?.getAttribute("y"))-4||height-34;const plotHeight=bottomY-top;const grid=document.createElementNS(SVG_NS,"g");grid.setAttribute("class","equity-grid");for(let i=0;i<=4;i++){const y=top+(plotHeight*i/4);const value=Number.isFinite(upper)&&Number.isFinite(lower)?upper+((lower-upper)*i/4):NaN;const line=document.createElementNS(SVG_NS,"line");line.setAttribute("x1",left);line.setAttribute("x2",width-right);line.setAttribute("y1",y.toFixed(2));line.setAttribute("y2",y.toFixed(2));line.setAttribute("class","equity-grid-line");grid.appendChild(line);if(Number.isFinite(value)){const label=document.createElementNS(SVG_NS,"text");label.setAttribute("x",left-8);label.setAttribute("y",(y+3).toFixed(2));label.setAttribute("text-anchor","end");label.setAttribute("class","equity-axis-label equity-grid-label");label.textContent=formatAxisMoney(value);grid.appendChild(label)}}const picks=[0,Math.round((points.length-1)*.25),Math.round((points.length-1)*.5),Math.round((points.length-1)*.75),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);for(const idx of picks){const p=points[idx];const x=Number(p.getAttribute("cx"));const line=document.createElementNS(SVG_NS,"line");line.setAttribute("x1",x);line.setAttribute("x2",x);line.setAttribute("y1",top);line.setAttribute("y2",bottomY);line.setAttribute("class","equity-grid-line equity-grid-vertical");grid.appendChild(line);const title=clean(p.querySelector("title")?.textContent).split("\\n")[0];const rawDate=title.split("·")[0].trim();const label=document.createElementNS(SVG_NS,"text");label.setAttribute("x",x);label.setAttribute("y",height-8);label.setAttribute("text-anchor",idx===0?"start":idx===points.length-1?"end":"middle");label.setAttribute("class","equity-date-label equity-date-tick");label.textContent=idx===0&&/Inception/i.test(title)?"Inception":shortDate(rawDate);grid.appendChild(label)}svg.querySelectorAll(".equity-axis-label,.equity-date-label").forEach(n=>{if(!n.classList.contains("equity-grid-label")&&!n.classList.contains("equity-date-tick"))n.style.display="none"});svg.insertBefore(grid,svg.firstChild);svg.dataset.vxAxes="1"};
const formatAxisMoney=value=>{const n=Number(value);if(!Number.isFinite(n))return"";if(Math.abs(n)>=1000)return(n<0?"-":"+")+"$"+Math.round(Math.abs(n)/1000)+"k";return(n<0?"-":n>0?"+":"")+"$"+Math.round(Math.abs(n))};
const activeSection=()=>document.getElementById("active-portfolio")?.closest("section.section")||null;
const displayedRows=section=>Array.from(section.querySelectorAll("tbody tr")).map(row=>{const ticker=clean(row.querySelector('td[data-label="Ticker"] strong')?.textContent).toUpperCase();const entry=Number(row.dataset.vxModelEntryPrice);return{row,ticker,entry}}).filter(item=>item.ticker&&Number.isFinite(item.entry));
const sameEntry=(left,right)=>Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left-right)<0.005;
const valuationRows=section=>displayedRows(section);
const invalidate=section=>{
 if(!section?.querySelector(".vx-valuation-evidence"))return;
 for(const item of valuationRows(section)){
  const current=item.row.querySelector('td[data-label="Current"]');
  const profit=item.row.querySelector('td[data-label="P&L, $"]');
  const ret=item.row.querySelector('td[data-label="Return"]');
  if(current){current.textContent="—";const note=document.createElement("span");note.className="vx-valuation-evidence";note.hidden=true;current.appendChild(note)}
  if(profit){profit.textContent="—";setState(profit,0)}
  if(ret){ret.textContent="—";setState(ret,0)}
 }
 const metric=section.querySelector(".section-metric strong");if(metric){metric.textContent="—";setState(metric,0)}
 const total=document.querySelector(".vx-current-model-pnl");if(total){total.textContent="—";setState(total,0)}
 const notice=section.querySelector(".vx-valuation-notice");if(notice)notice.textContent=localized("Quotes temporarily unavailable; unrealized P&L is withheld.");
};
const refresh=async()=>{
 if(document.visibilityState==="hidden")return;
 const section=activeSection();if(!section)return;
 try{
  const response=await fetch(API_PATH,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json","Cache-Control":"no-cache"}});
  if(!response.ok)throw Error("QUOTE_REFRESH_HTTP_FAILED");
  const data=await response.json(),active=Array.isArray(data?.active_portfolio)?data.active_portfolio:null;
  if(!active)throw Error("QUOTE_REFRESH_FEED_MISSING");
  const rows=valuationRows(section),feed=new Map(active.map(item=>[clean(item?.ticker).toUpperCase(),item]));
  if(rows.length!==active.length||feed.size!==active.length)throw Error("QUOTE_REFRESH_MEMBERSHIP_CHANGED");
  for(const item of rows){const q=feed.get(item.ticker);if(!q||!sameEntry(item.entry,moneyNumber(q.entry_price)))throw Error("QUOTE_REFRESH_ENTRY_CHANGED")}
  const projected=data.valuation_read_only===true;
  if(section.querySelector(".vx-valuation-evidence")&&!projected)throw Error("QUOTE_REFRESH_PROJECTION_MISSING");
  for(const item of rows){
   const quote=feed.get(item.ticker);
   const fresh=projected&&["FRESH_DELAYED","FRESH_MINUTE_BAR","LAST_SESSION_QUOTE"].includes(quote.valuation_status);
   const current=projected?quote.current_valuation_price:moneyNumber(quote.current_price);
   const ret=projected?quote.valuation_return_pct:percentNumber(quote.return_pct);
   const pnl=projected?quote.unrealized_model_pnl:(current-item.entry)*(ALLOCATION/item.entry);
   const valid=Number.isFinite(current)&&current>0&&Number.isFinite(ret)&&Number.isFinite(pnl)&&(!projected||fresh);
   const currentCell=item.row.querySelector('td[data-label="Current"]');
   const returnCell=item.row.querySelector('td[data-label="Return"]');
   const pnlCell=item.row.querySelector('td[data-label="P&L, $"]');
   if(currentCell){
    currentCell.textContent=valid?(projected?"$"+current.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):clean(quote.current_price)):"—";
    if(projected){const note=document.createElement("span");note.className="vx-valuation-evidence";note.hidden=true;currentCell.appendChild(note)}
   }
   if(returnCell){returnCell.textContent=valid?(projected?(ret>0?"+":"")+ret.toFixed(2)+"%":clean(quote.return_pct)):"—";setState(returnCell,valid?ret:0)}
   if(pnlCell){pnlCell.textContent=valid?money(pnl):"—";setState(pnlCell,valid?pnl:0)}
   // News is a separate public display overlay; never use morning brief_note.
   const newsCell=item.row.querySelector('td[data-label="Research Note"]');
   if(newsCell&&typeof quote.company_news_status==="string"){
    const items=Array.isArray(quote.company_news)?quote.company_news.slice(0,2):[];
    newsCell.textContent="";
    let appended=0;
    for(const story of items){
     let target;try{target=new URL(story.url)}catch{continue}
     if(target.protocol!=="https:"||target.username||target.password||target.port||
        !story.summary||!story.published_et||!story.publisher)continue;
     const entry=document.createElement("div");entry.className="vx-company-news-entry";
     const link=document.createElement("a");link.href=target.href;link.target="_blank";
     link.rel="noopener noreferrer";link.textContent=story.summary;
     const posted=document.createElement("span");
     posted.textContent=(story.news_is_older?"Earlier news · ":"")+story.publisher+" · "+story.published_et;
     entry.appendChild(link);entry.appendChild(posted);newsCell.appendChild(entry);appended++;
    }
    if(!appended){
     const unavailable=quote.company_news_status==="PENDING"?"Checking Google Finance company news…":
      quote.company_news_status==="UNAVAILABLE"?"Google Finance company news temporarily unavailable.":
      "No matching Google Finance company news verified for "+(quote.company_news_session_date||"previous trading session")+".";
     const status=document.createElement("span");status.className="vx-company-news-status";
     status.textContent=unavailable;newsCell.appendChild(status);
    }
   }
  }
  const aggregate=data.active_unrealized_model_pnl;
  const notice=section.querySelector(".vx-valuation-notice");
  if(projected&&notice)notice.textContent=valuationNoticeParts(data).map(localized).join(" ");
  const amount=typeof aggregate==="number"&&Number.isFinite(aggregate)?aggregate:null;
  const metric=section.querySelector(".section-metric strong");
  if(metric){metric.textContent=amount===null?"—":money(amount);setState(metric,amount??0)}
  const realized=data.closed_realized_model_pnl,totalMetric=document.querySelector(".vx-current-model-pnl");
  if(totalMetric){const total=amount!==null&&typeof realized==="number"&&Number.isFinite(realized)?amount+realized:null;totalMetric.textContent=total===null?"—":money(total);setState(totalMetric,total??0)}
  section.dataset.vxQuoteRefreshAt=new Date().toISOString();
 }catch(_){invalidate(section)}
};
let timer=null;
const start=()=>{if(timer!==null)return;enhanceEquityChart();refresh();timer=window.setInterval(()=>{enhanceEquityChart();refresh()},REFRESH_MS)};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
})();</script>`;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "").split("?")[0];
}

function parseMoney(text) {
  const normalized = String(text || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim();
  const accounting = normalized.match(/\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\)/);
  if (accounting) return -Number(accounting[1].replace(/,/g, ""));
  const standard = normalized.match(/([+-]?)\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!standard) return NaN;
  const value = Number(standard[2].replace(/,/g, ""));
  return standard[1] === "-" ? -value : value;
}

function formatShares(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Math.round(number).toLocaleString("en-US");
}

function formatMoney(value) {
  if (value === null || value === undefined) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const absolute = Math.abs(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (number > 0) return `+$${absolute}`;
  if (number < 0) return `-$${absolute}`;
  return "$0.00";
}

function formatReferencePrice(value) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pnlClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "flat";
  return number > 0 ? "gain" : "loss";
}

function modelShares(entryPrice) {
  const entry = Number(entryPrice);
  if (!Number.isFinite(entry) || entry <= 0) return NaN;
  return MODEL_ALLOCATION_PER_POSITION / entry;
}

function modelOpenPnl(entryPrice, currentPrice) {
  const entry = Number(entryPrice);
  const current = Number(currentPrice);
  const shares = modelShares(entry);
  if (!Number.isFinite(current) || !Number.isFinite(shares)) return NaN;
  return (current - entry) * shares;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findSectionByHeading(html, heading) {
  const sections = String(html || "").match(/<section\b[^>]*class=["'][^"']*\bsection\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi) || [];
  const pattern = new RegExp(`<h2\\b[^>]*>\\s*${escapeRegExp(heading)}\\s*<\\/h2>`, "i");
  return sections.find(section => pattern.test(section)) || "";
}

function sectionMetricValue(html, heading) {
  const section = findSectionByHeading(html, heading);
  if (!section) return NaN;
  const metric = section.match(/<div\b[^>]*class=["'][^"']*\bsection-metric\b[^"']*["'][^>]*>[\s\S]*?<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
  return metric ? parseMoney(metric[1]) : NaN;
}

function enhanceCurrentModelPnl(html) {
  if (typeof html !== "string" || html.includes('class="vx-current-model-pnl ')) return html;
  const unrealized = sectionMetricValue(html, "Active Portfolio");
  const realized = sectionMetricValue(html, "Closed Trades");
  if (!Number.isFinite(realized)) return html;

  const total = Number.isFinite(unrealized) ? unrealized + realized : null;
  return html.replace(
    /(<div\b[^>]*class=["'][^"']*\bequity-chart-head\b[^"']*["'][^>]*>\s*<div>\s*<small>\s*Equity History\s*<\/small>\s*<strong>\s*Model P&amp;L\s*<\/strong>\s*<\/div>\s*)<span\b[^>]*>[\s\S]*?<\/span>(\s*<\/div>)/i,
    (_match, before, after) => `${before}<div class="vx-current-model-pnl-wrap"><small>Total Model P&L</small><span class="vx-current-model-pnl ${pnlClass(total)}">${formatMoney(total)}</span></div>${after}`
  );
}

function enhanceActiveRow(rowHtml) {
  if (typeof rowHtml !== "string" || /class=["'][^"']*\bempty\b/i.test(rowHtml)) return rowHtml;
  if (/data-label=["']Quantity["']/i.test(rowHtml)) return rowHtml;

  const entryCell = rowHtml.match(/<td\b[^>]*data-label=["']Entry["'][^>]*>([\s\S]*?)<\/td>/i);
  const currentCell = rowHtml.match(/<td\b[^>]*data-label=["']Current["'][^>]*>([\s\S]*?)<\/td>/i);
  if (!entryCell || !currentCell) return rowHtml;

  const entryPrice = parseMoney(entryCell[1]);
  const currentPrice = /^\s*—/.test(currentCell[1]) ? NaN : parseMoney(currentCell[1]);
  const shares = modelShares(entryPrice);
  // Projected marks can have sub-cent precision; use the validated model value,
  // not the already rounded display price, to match API and browser refresh.
  const projectedPnl = rowHtml.match(/data-vx-valuation-pnl="([^"]*)"/);
  const pnl = projectedPnl ? (projectedPnl[1] === '' ? NaN : Number(projectedPnl[1])) : modelOpenPnl(entryPrice, currentPrice);
  if (!Number.isFinite(shares)) return rowHtml;

  const insertion = `<td data-label="Quantity" class="vx-model-shares">${formatShares(shares)}</td>`
    + `<td data-label="TP" class="vx-model-reference-price">${formatReferencePrice(entryPrice * 1.10)}</td>`
    + `<td data-label="SL" class="vx-model-reference-price">${formatReferencePrice(entryPrice * 0.95)}</td>`
    + `<td data-label="P&L, $" class="vx-model-open-pnl ${pnlClass(pnl)}">${formatMoney(pnl)}</td>`;
  const withEntryMetadata = rowHtml.replace(/<tr\b([^>]*)>/i, `<tr$1 data-vx-model-entry-price="${entryPrice}">`);
  return withEntryMetadata.replace(currentCell[0], `${currentCell[0]}${insertion}`);
}

function enhanceActiveSection(sectionHtml) {
  if (typeof sectionHtml !== "string") return sectionHtml;
  let out = sectionHtml;
  out = out.replace(
    /<th>Current<\/th>\s*<th>Return<\/th>/i,
    "<th>Current</th><th>Quantity</th><th>TP</th><th>SL</th><th>P&amp;L, $</th><th>Return</th>"
  );
  out = out.replace(/<tbody>([\s\S]*?)<\/tbody>/i, (tbody, body) => {
    const enhanced = body.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, row => enhanceActiveRow(row));
    return `<tbody>${enhanced}</tbody>`;
  });
  out = out.replace(/colspan=["']6["']/gi, 'colspan="10"');
  return out;
}

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function injectQuoteRefreshScript(html) {
  if (typeof html !== "string" || html.includes(`id="${SCRIPT_ID}"`)) return html;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${quoteRefreshScript}\n</body>`) : `${html}${quoteRefreshScript}`;
}

function enhanceActivePortfolioTable(html) {
  if (typeof html !== "string" || html.includes(PAGE_MARKER)) return html;
  let out = html.replace(
    /<section\b[^>]*class=["'][^"']*\bsection\b[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>\s*Active Portfolio\s*<\/h2>[\s\S]*?<\/section>/i,
    section => enhanceActiveSection(section)
  );
  out = enhanceCurrentModelPnl(out);
  out = out.replace(/<strong>\s*Model P&amp;L\s*<\/strong>/i, "<strong>Portfolio P&amp;L</strong>");
  out = out.replace(/<small>\s*Total Model P&L\s*<\/small>/i, "<small>Total P&amp;L</small>");
  out = injectStyles(out);
  out = injectQuoteRefreshScript(out);
  return out.replace(/<body(\s[^>]*)?>/i, match => (
    match.includes(PAGE_MARKER) ? match : match.replace("<body", `<body ${PAGE_MARKER}`)
  ));
}

function installSwingActiveModelPnl(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || pathname !== SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingActiveModelPnl(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = enhanceActivePortfolioTable(body);
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
  if (typeof factory !== "function" || factory.__vixaleSwingActiveModelPnlWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installSwingActiveModelPnl(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleSwingActiveModelPnlWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingActiveModelPnlModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  QUOTE_API_PATH,
  QUOTE_REFRESH_MS,
  MODEL_ALLOCATION_PER_POSITION,
  PAGE_MARKER,
  STYLE_ID,
  SCRIPT_ID,
  requestPath,
  parseMoney,
  formatShares,
  formatMoney,
  pnlClass,
  modelShares,
  modelOpenPnl,
  escapeRegExp,
  findSectionByHeading,
  sectionMetricValue,
  enhanceCurrentModelPnl,
  enhanceActiveRow,
  enhanceActiveSection,
  enhanceActivePortfolioTable,
  injectStyles,
  injectQuoteRefreshScript,
  installSwingActiveModelPnl,
  wrapExpress,
};
