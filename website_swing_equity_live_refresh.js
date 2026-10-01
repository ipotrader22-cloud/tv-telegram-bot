"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const SOURCE_PATH = SWING_PATH;
const REFRESH_MS = 60 * 1000;
const SCRIPT_ID = "vx-swing-equity-live-refresh-script";

const equityRefreshScript = `<script id="${SCRIPT_ID}">(() => {
const SOURCE_PATH=${JSON.stringify(SOURCE_PATH)};
const REFRESH_MS=${REFRESH_MS};
const clean=value=>String(value==null?"":value).trim();
const tickers=root=>Array.from(root.querySelectorAll("main table tbody tr td:first-child strong")).map(node=>clean(node.textContent).toUpperCase()).filter(Boolean).join(",");
const signature=root=>[clean(root.querySelector("footer.footer .wrap")?.textContent),tickers(root)].join("|");
const replaceSnapshot=parsed=>{const currentMain=document.querySelector("main.wrap")||document.querySelector("main");const freshMain=parsed.querySelector("main.wrap")||parsed.querySelector("main");if(!currentMain||!freshMain)return false;if(signature(document)===signature(parsed))return false;currentMain.replaceWith(document.importNode(freshMain,true));const currentFooter=document.querySelector("footer.footer");const freshFooter=parsed.querySelector("footer.footer");if(currentFooter&&freshFooter)currentFooter.replaceWith(document.importNode(freshFooter,true));document.body.dataset.vxSnapshotRefreshAt=new Date().toISOString();return true};
const refreshChart=parsed=>{const current=document.querySelector(".equity-chart-card .equity-chart-svg");const fresh=parsed.querySelector(".equity-chart-card .equity-chart-svg");if(!current||!fresh)return;if(fresh.outerHTML!==current.outerHTML)current.replaceWith(document.importNode(fresh,true));const card=document.querySelector(".equity-chart-card");if(card)card.dataset.vxEquityRefreshAt=new Date().toISOString()};
const refresh=async()=>{if(document.visibilityState==="hidden")return;try{const separator=SOURCE_PATH.includes("?")?"&":"?";const url=SOURCE_PATH+separator+"vx_snapshot_refresh="+Date.now();const response=await fetch(url,{credentials:"same-origin",cache:"no-store",headers:{Accept:"text/html","Cache-Control":"no-cache"}});if(!response.ok)return;const html=await response.text();const parsed=new DOMParser().parseFromString(html,"text/html");if(!replaceSnapshot(parsed))refreshChart(parsed)}catch(_){}};
let timer=null;
const start=()=>{if(timer!==null)return;refresh();timer=window.setInterval(refresh,REFRESH_MS)};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
})();</script>`;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "").split("?")[0];
}

function injectEquityRefreshScript(html) {
  if (typeof html !== "string" || html.includes(`id="${SCRIPT_ID}"`)) return html;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${equityRefreshScript}\n</body>`)
    : `${html}${equityRefreshScript}`;
}

function installSwingEquityLiveRefresh(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || pathname !== SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingEquityLiveRefresh(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = injectEquityRefreshScript(body);
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
  if (typeof factory !== "function" || factory.__vixaleSwingEquityLiveRefreshWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installSwingEquityLiveRefresh(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleSwingEquityLiveRefreshWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingEquityLiveRefreshModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  SOURCE_PATH,
  REFRESH_MS,
  SCRIPT_ID,
  equityRefreshScript,
  requestPath,
  injectEquityRefreshScript,
  installSwingEquityLiveRefresh,
  wrapExpress,
};
