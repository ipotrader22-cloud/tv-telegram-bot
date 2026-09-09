"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const metrics = require("../lib/website-funnel-metrics");
const { injectFunnelAccessScript, FUNNEL_SCRIPT_ID } = require("../lib/website-funnel-client");
const funnelPatch = require("../lib/website-funnel-source-patch");
const accessPatch = require("../website_dashboard_access_security");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vixale-funnel-"));
  const filePath = path.join(dir, "metrics.json");
  const initial = await metrics.snapshot({ filePath });
  for (const event of metrics.EVENT_NAMES) assert.strictEqual(initial.counts[event], 0);

  await metrics.record("access_cta_click", {}, { filePath });
  await metrics.record("access_form_submitted", {}, { filePath });
  await metrics.record("verification_email_sent", {}, { filePath });
  await metrics.record("email_verified", {}, { filePath });
  await metrics.record("owner_approved", {}, { filePath });
  await metrics.record("first_viewer_login", {}, { filePath });
  await metrics.record("service_enquiry", { kind: "appointment" }, { filePath });
  await metrics.record("service_enquiry", { kind: "bot" }, { filePath });
  await metrics.record("service_enquiry", { kind: "strategy" }, { filePath });
  assert.strictEqual(await metrics.record("not_allowed", {}, { filePath }), false);

  const snapshot = await metrics.snapshot({ filePath });
  assert.strictEqual(snapshot.version, 1);
  assert(snapshot.started_at && snapshot.updated_at);
  assert.strictEqual(snapshot.counts.access_cta_click, 1);
  assert.strictEqual(snapshot.counts.first_viewer_login, 1);
  assert.strictEqual(snapshot.counts.service_enquiry, 3);
  assert.deepStrictEqual(snapshot.service_enquiry_by_kind, { appointment: 1, bot: 1, strategy: 1 });
  const persisted = fs.readFileSync(filePath, "utf8");
  for (const forbidden of ["email", "token", "password", "access_code", "ip", "user_agent"]) {
    assert(!persisted.toLowerCase().includes(`\"${forbidden}\"`), `metrics file must not store ${forbidden}`);
  }

  const html = '<html><body><a href="/#password-access">Request Free Access</a></body></html>';
  const measuredHtml = injectFunnelAccessScript(html);
  assert(measuredHtml.includes(`id="${FUNNEL_SCRIPT_ID}"`));
  assert(measuredHtml.includes("/website-funnel/access-cta"));
  assert.strictEqual(injectFunnelAccessScript(measuredHtml), measuredHtml, "client injection must be idempotent");
  assert.strictEqual(injectFunnelAccessScript("<html><body>No access CTA</body></html>"), "<html><body>No access CTA</body></html>");

  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const accessPatched = accessPatch.patchAppSource(appSource);
  assert(accessPatched.includes(funnelPatch.APP_PATCH_MARKER));
  for (const event of metrics.EVENT_NAMES) assert(accessPatched.includes(`'${event}'`), `missing source hook for ${event}`);
  assert(accessPatched.includes("app.post('/website-funnel/access-cta'"));
  assert(accessPatched.includes("app.get('/admin/funnel.json'"));
  assert(accessPatched.includes("if (!isAdminAuthorized(req))"));
  assert(accessPatched.includes("!String(viewerCode.last_login_at || '').trim()"));
  assert(accessPatched.includes("recordWebsiteFunnelEvent('service_enquiry', { kind: 'appointment' })"));
  assert(accessPatched.includes("recordWebsiteFunnelEvent('service_enquiry', { kind: 'bot' })"));
  assert(accessPatched.includes("recordWebsiteFunnelEvent('service_enquiry', { kind: 'strategy' })"));
  assert(!accessPatched.includes("websiteFunnelMetrics.record(event, { email"));
  assert.strictEqual(accessPatch.patchAppSource(accessPatched), accessPatched, "combined access/funnel source patch must be idempotent");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("Website funnel measurement: PASS");
})().catch(error => { console.error(error); process.exit(1); });
