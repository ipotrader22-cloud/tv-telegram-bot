"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const health = require("../website_dashboard_access_health");
const securityPatcher = require("../website_dashboard_access_security");

assert(health.HEALTH_HELPERS.includes("VIXALE_DASHBOARD_ACCESS_HEALTH_MONITOR"));
assert(health.HEALTH_HELPERS.includes("30 * 60 * 1000"));
assert(health.HEALTH_HELPERS.includes("delivered@resend.dev"));
assert(health.HEALTH_HELPERS.includes("data-vixale-health=\"1\""));
assert(health.HEALTH_ROUTES.includes("app.get('/admin/access/health'"));
assert(health.HEALTH_ROUTES.includes("app.post('/admin/access/health/run'"));
assert(health.HEALTH_ROUTES.includes("adminAccessRequestAllowed(req, res)"));
assert(!health.HEALTH_ROUTES.includes("logDashboardAccessRequest("), "health test must not create customer access requests");
assert(!health.HEALTH_ROUTES.includes("createDashboardViewerCode("), "health test must never create viewer codes");
new vm.Script(health.HEALTH_HELPERS + "\n" + health.HEALTH_ROUTES, { filename: "dashboard-access-health.generated.js" });

const appPath = path.join(__dirname, "..", "app.js");
const rawApp = fs.readFileSync(appPath, "utf8");
const patchedApp = securityPatcher.patchAppSource(rawApp);
assert(patchedApp.includes("VIXALE_DASHBOARD_ACCESS_HEALTH_MONITOR"));
assert(patchedApp.includes("/admin/access/health/run"));
assert(patchedApp.includes("Run Test Now"));
assert(patchedApp.includes("app.post('/dashboard-login'"), "dashboard login must remain present");
assert(patchedApp.includes("app.post('/tv', handleTradingViewWebhook)"), "TradingView webhook must remain untouched");
new vm.Script(patchedApp, { filename: "app.js" });

console.log("Dashboard access health monitor: PASS");
