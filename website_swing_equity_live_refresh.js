"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const SOURCE_PATH = "/swing-leaders";
const REFRESH_MS = 60 * 1000;
const SCRIPT_ID = "vx-swing-equity-live-refresh-script";

const equityRefreshScript = `<script id="${SCRIPT_ID}">(() => {
const SOURCE_PATH=${JSON.stringify(SOURCE_PATH)};
const REFRESH_MS=${REFRESH_MS};
const refresh=async()=>{if(document.visibilityState==="hidden")return;const current=document.querySelector(".equity-chart-card .equity-chart-svg");if(!current)return;try{const response=await fetch(SOURCE_PATH,{credentials:"same-origin",cache:"no-store",headers:{Accept:"text/html"}});if(!response.ok)return;const html=await response.text();const parsed=new DOMParser().parseFromString(html,"text/html");const fresh=parsed.querySelector(".equity-chart-card .equity-chart-svg");if(!fresh)return;if(fresh.outerHTML!==current.outerHTML){current.replaceWith(document.importNode(fresh,true))}const card=document.querySelector(".equity-chart-card");if(card)card.dataset.vxEquityRefreshAt=new Date().toISOString()}catch(_){}};
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
