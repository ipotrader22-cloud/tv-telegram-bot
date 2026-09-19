"use strict";

const Module = require("module");

const HOME_PATH = "/";
const STYLE_ID = "vx-home-preview-chart-readability-style";
const SCRIPT_ID = "vx-home-preview-chart-readability-script";
const TARGET_ID = "vx-conversion-day-chart";

function computePreviewScale(viewBoxWidth, viewBoxHeight, targetWidth, targetHeight) {
  const sourceWidth = Number(viewBoxWidth);
  const sourceHeight = Number(viewBoxHeight);
  const width = Number(targetWidth);
  const height = Number(targetHeight);
  if (![sourceWidth, sourceHeight, width, height].every(Number.isFinite)) return 1;
  if (sourceWidth <= 0 || sourceHeight <= 0 || width <= 0 || height <= 0) return 1;
  return Math.max(sourceWidth / width, sourceHeight / height, 1);
}

const styles = `<style id="${STYLE_ID}">
#${TARGET_ID} svg text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
</style>`;

const runtimeScript = `<script id="${SCRIPT_ID}">(() => {
${computePreviewScale.toString()}
const targetId='${TARGET_ID}';
const originalAttr=(node,attr)=>{const key='data-vx-preview-original-'+attr;let raw=node.getAttribute(key);if(raw==null){raw=node.getAttribute(attr);if(raw!=null)node.setAttribute(key,raw)}return Number(raw)};
const scaledAttr=(node,attr,factor)=>{const base=originalAttr(node,attr);if(Number.isFinite(base))node.setAttribute(attr,String(Math.max(base*factor,.1)))};
const normalize=()=>{const target=document.getElementById(targetId);if(!target)return;const svg=target.querySelector('svg');if(!svg)return;const parts=String(svg.getAttribute('viewBox')||'').trim().split(/\\s+/).map(Number);if(parts.length!==4||!parts.every(Number.isFinite))return;const rect=target.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return;const factor=computePreviewScale(parts[2],parts[3],rect.width,rect.height);svg.querySelectorAll('text[font-size]').forEach(node=>scaledAttr(node,'font-size',factor));svg.querySelectorAll('[stroke-width]').forEach(node=>scaledAttr(node,'stroke-width',factor));svg.querySelectorAll('circle[r]').forEach(node=>scaledAttr(node,'r',factor));const circles=Array.from(svg.querySelectorAll('circle'));if(circles.length>24)circles.slice(0,-1).forEach(node=>node.remove());svg.setAttribute('data-vx-preview-readable','1')};
const install=()=>{const target=document.getElementById(targetId);if(!target)return;normalize();new MutationObserver(()=>normalize()).observe(target,{childList:true,subtree:false});let timer=null;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(normalize,120)},{passive:true})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();</script>`;

function refineHomeHtml(html, path) {
  if (typeof html !== "string" || path !== HOME_PATH || !html.includes(`id="${TARGET_ID}"`)) return html;
  let out = html;
  if (!out.includes(`id="${STYLE_ID}"`)) out = out.includes("</head>") ? out.replace("</head>", `${styles}\n</head>`) : `${styles}${out}`;
  if (!out.includes(`id="${SCRIPT_ID}"`)) out = out.includes("</body>") ? out.replace("</body>", () => `${runtimeScript}\n</body>`) : `${out}${runtimeScript}`;
  return out;
}

function installHomePreviewChartReadabilityFix(app) {
  app.use((req, res, next) => {
    const requestPath = String(req.originalUrl || req.url || "/").split("?")[0];
    const method = String(req.method || "GET").toUpperCase();
    if (requestPath !== HOME_PATH || (method !== "GET" && method !== "HEAD")) return next();
    const send = res.send.bind(res);
    res.send = function sendWithHomePreviewChartReadability(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineHomeHtml(body, requestPath);
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
  if (typeof factory !== "function" || factory.__vixaleHomePreviewChartReadabilityWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installHomePreviewChartReadabilityFix(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleHomePreviewChartReadabilityWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleHomePreviewChartReadabilityLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  STYLE_ID,
  SCRIPT_ID,
  TARGET_ID,
  computePreviewScale,
  refineHomeHtml,
  installHomePreviewChartReadabilityFix,
  wrapExpress,
};
