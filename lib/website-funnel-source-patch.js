"use strict";

const APP_PATCH_MARKER = "VIXALE_WEBSITE_FUNNEL_MEASUREMENT_PATCH";

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Funnel patch anchor missing: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

function insertBeforeOnce(source, needle, insertion, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Funnel patch anchor missing: ${label}`);
  return source.slice(0, index) + insertion + source.slice(index);
}

function insertAfterWithin(source, startNeedle, endNeedle, needle, insertion, label) {
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`Funnel patch start anchor missing: ${label}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Funnel patch end anchor missing: ${label}`);
  const index = source.indexOf(needle, start);
  if (index < 0 || index >= end) throw new Error(`Funnel patch inner anchor missing: ${label}`);
  const after = index + needle.length;
  return source.slice(0, after) + insertion + source.slice(after);
}

function patchAppSource(source) {
  if (typeof source !== "string") throw new TypeError("app source must be a string");
  if (source.includes(APP_PATCH_MARKER)) return source;
  let out = source;

  out = replaceOnce(
    out,
    "const dashboardAccessSecurity = require('./lib/dashboard-access-security');",
    "const dashboardAccessSecurity = require('./lib/dashboard-access-security');\nconst websiteFunnelMetrics = require('./lib/website-funnel-metrics');\n// VIXALE_WEBSITE_FUNNEL_MEASUREMENT_PATCH",
    "metrics require"
  );

  out = insertBeforeOnce(
    out,
    "function pruneUsedTurnstileTokenHashes(nowMs = Date.now()) {",
    String.raw`function recordWebsiteFunnelEvent(event, metadata) {
  void websiteFunnelMetrics.record(event, metadata).catch(error => {
    console.error('Website funnel metric write failed:', error);
  });
}

function websiteFunnelAccessClickAllowed(req) {
  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}

`,
    "metrics helpers"
  );

  out = replaceOnce(
    out,
    "    if (!stored) return dashboardAccessUnavailable(res, lang);",
    "    if (!stored) return dashboardAccessUnavailable(res, lang);\n    recordWebsiteFunnelEvent('access_form_submitted');",
    "accepted access form"
  );

  out = replaceOnce(
    out,
    "        text: dashboardAccessSecurity.verificationEmailText({ verificationUrl }),\n      });",
    "        text: dashboardAccessSecurity.verificationEmailText({ verificationUrl }),\n      });\n      recordWebsiteFunnelEvent('verification_email_sent');",
    "verification email sent"
  );

  out = insertAfterWithin(
    out,
    "app.get('/dashboard-access/verify', async (req, res) => {",
    "\n});\n\napp.post('/strategy-review'",
    "      verified_at: verifiedAt,\n    });",
    "\n    recordWebsiteFunnelEvent('email_verified');",
    "email verified"
  );

  const clickRoute = String.raw`app.post('/website-funnel/access-cta', (req, res) => {
  if (websiteFunnelAccessClickAllowed(req)) recordWebsiteFunnelEvent('access_cta_click');
  return res.status(204).end();
});

`;
  out = insertBeforeOnce(out, "app.post('/strategy-review', async (req, res) => {", clickRoute, "CTA click route");

  const adminRoute = String.raw`app.get('/admin/funnel.json', async (req, res) => {
  try {
    setPrivateNoStoreHeaders(res);
    if (!isAdminAuthorized(req)) return res.status(401).json({ ok: false, error: 'admin_unauthorized' });
    const metrics = await websiteFunnelMetrics.snapshot();
    return res.status(200).json({ ok: true, metrics });
  } catch (error) {
    console.error('Website funnel metrics read failed:', error);
    return res.status(500).json({ ok: false, error: 'funnel_metrics_unavailable' });
  }
});

`;
  out = insertBeforeOnce(out, "app.post('/admin/access/requests/:id/approve', async (req, res) => {", adminRoute, "owner metrics route");

  out = insertAfterWithin(
    out,
    "app.post('/admin/access/requests/:id/approve', async (req, res) => {",
    "\n});\n\napp.post('/admin/access/requests/:id/reject'",
    "    await updateDashboardAccessRequest(request, { status: 'Approved', code_id: code.id, reviewed_at: new Date().toISOString() });",
    "\n    recordWebsiteFunnelEvent('owner_approved');",
    "owner approval"
  );

  out = replaceOnce(
    out,
    "    void touchDashboardViewerCodeLogin(viewerCode);",
    "    if (!String(viewerCode.last_login_at || '').trim()) recordWebsiteFunnelEvent('first_viewer_login');\n    void touchDashboardViewerCodeLogin(viewerCode);",
    "first viewer login"
  );

  for (const [startNeedle, endNeedle, kind] of [
    ["app.post('/strategy-review', async (req, res) => {", "\n});\n\napp.post('/appointment-request'", "strategy"],
    ["app.post('/appointment-request', async (req, res) => {", "\n});\n\napp.post('/bot-request'", "appointment"],
    ["app.post('/bot-request', async (req, res) => {", "\n});\n", "bot"],
  ]) {
    out = insertAfterWithin(
      out,
      startNeedle,
      endNeedle,
      "    await sendAdminTelegram(message);",
      `\n    recordWebsiteFunnelEvent('service_enquiry', { kind: '${kind}' });`,
      `${kind} service enquiry`
    );
  }

  return out;
}

module.exports = { APP_PATCH_MARKER, patchAppSource };
