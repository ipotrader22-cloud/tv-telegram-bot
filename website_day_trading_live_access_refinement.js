"use strict";

const Module = require("module");

const DAY_PATH = "/trading-systems/day-trading";
const LIVE_ACCESS_HREF = "/#password-access";
const PAGE_MARKER = 'data-vx-conversion-system-page="day"';
const BUTTON_MARKER = 'data-vx-day-live-access="1"';
const ACTIONS_OPEN = '<div class="vx-conversion-system-actions">';
const RESULTS_LINK = '<a href="/results#day-trading">View Day Trading Results</a>';

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function insertDayTradingLiveAccess(html) {
  if (typeof html !== "string" || !html.includes(PAGE_MARKER) || html.includes(BUTTON_MARKER)) return html;
  const openStart = html.indexOf(ACTIONS_OPEN);
  if (openStart < 0) return html;
  const closeStart = html.indexOf("</div>", openStart + ACTIONS_OPEN.length);
  if (closeStart < 0) return html;

  const actionsEnd = closeStart + "</div>".length;
  const actions = html.slice(openStart, actionsEnd);
  if (!actions.includes("Get 30 Days Free") || !actions.includes(RESULTS_LINK)) return html;

  const liveAccess = `<a ${BUTTON_MARKER} href="${LIVE_ACCESS_HREF}">Live Access</a>`;
  const refinedActions = actions.replace(RESULTS_LINK, `${liveAccess}${RESULTS_LINK}`);
  return html.slice(0, openStart) + refinedActions + html.slice(actionsEnd);
}

function refineDayTradingLiveAccess(html, pathname = DAY_PATH) {
  return pathname === DAY_PATH ? insertDayTradingLiveAccess(html) : html;
}

function installDayTradingLiveAccessRefinement(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const pathname = requestPath(req);
    if ((method !== "GET" && method !== "HEAD") || pathname !== DAY_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendWithDayTradingLiveAccess(body) {
      const type = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (typeof body === "string" && (!type || type.includes("html"))) {
        body = refineDayTradingLiveAccess(body, pathname);
      }
      return send(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) {
      try { Object.defineProperty(target, key, descriptor); } catch (_) {}
    }
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleDayTradingLiveAccessWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installDayTradingLiveAccessRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleDayTradingLiveAccessWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleDayTradingLiveAccessModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  DAY_PATH,
  LIVE_ACCESS_HREF,
  PAGE_MARKER,
  BUTTON_MARKER,
  ACTIONS_OPEN,
  RESULTS_LINK,
  requestPath,
  insertDayTradingLiveAccess,
  refineDayTradingLiveAccess,
  installDayTradingLiveAccessRefinement,
  wrapExpress,
};
