"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const APP_PATCH_MARKER = "VIXALE_DASHBOARD_ACCESS_SECURITY_PATCH";

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Access Guard patch anchor missing: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

function insertBeforeOnce(source, needle, insertion, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Access Guard patch anchor missing: ${label}`);
  return source.slice(0, index) + insertion + source.slice(index);
}

function replaceBlockOnce(source, startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`Access Guard patch start anchor missing: ${label}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Access Guard patch end anchor missing: ${label}`);
  return source.slice(0, start) + replacement + "\n\n" + source.slice(end);
}

const { ACCESS_HELPERS, NEW_PASSWORD_AND_VERIFY_ROUTES, DELETE_ROUTE } = require("./lib/dashboard-access-security-source-blocks");
const { HEALTH_HELPERS, HEALTH_ROUTES } = require("./lib/dashboard-access-health-source-blocks");
const websiteFunnelSourcePatch = require("./lib/website-funnel-source-patch");

function patchAppSource(source) {
  if (typeof source !== "string") throw new TypeError("app source must be a string");
  if (source.includes(APP_PATCH_MARKER)) return websiteFunnelSourcePatch.patchAppSource(source);
  let out = source;

  out = replaceOnce(
    out,
    "const DASHBOARD_REQUEST_EMAIL = process.env.DASHBOARD_REQUEST_EMAIL || PASSWORD_REQUEST_BCC || '';",
    "const DASHBOARD_REQUEST_EMAIL = process.env.DASHBOARD_REQUEST_EMAIL || PASSWORD_REQUEST_BCC || '';\nconst TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || '').trim();\nconst TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || '').trim();\nconst dashboardAccessSecurity = require('./lib/dashboard-access-security');",
    "Turnstile env constants"
  );

  out = replaceOnce(
    out,
    "const DASHBOARD_ACCESS_REQUESTS_HEADERS = ['ID', 'Requested At', 'Name', 'Email', 'Telegram', 'Source', 'Status', 'Code ID', 'Reviewed At'];",
    "const DASHBOARD_ACCESS_REQUESTS_HEADERS = ['ID', 'Requested At', 'Name', 'Email', 'Telegram', 'Source', 'Status', 'Code ID', 'Reviewed At', 'Verification Token Hash', 'Verification Expires At', 'Verified At'];",
    "access request headers"
  );

  out = insertBeforeOnce(out, "async function logDashboardAccessRequest(request) {", ACCESS_HELPERS + "\n" + HEALTH_HELPERS + "\n", "access security and health helpers");

  out = replaceBlockOnce(
    out,
    "async function logDashboardAccessRequest(request) {",
    "\nfunction normalizeDashboardAccessCode(value) {",
    String.raw`async function logDashboardAccessRequest(request) {
  const sheets = await getSheetsClient();
  if (!sheets) return false;
  await ensureDashboardAccessVerificationHeaders(sheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "'Dashboard Access Requests'!A:L",
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[
      request.id, request.requested_at, request.name, request.email, request.telegram, request.source,
      request.status, '', '', request.verification_token_hash || '', request.verification_expires_at || '', request.verified_at || '',
    ]] },
  });
  return true;
}`,
    "access request writer"
  );

  out = replaceBlockOnce(
    out,
    "function parseDashboardAccessRequestRow(row, rowNumber) {",
    "\nfunction parseDashboardAccessCodeRow(row, rowNumber) {",
    String.raw`function parseDashboardAccessRequestRow(row, rowNumber) {
  return {
    id: String(row[0] || ''), requested_at: String(row[1] || ''), name: String(row[2] || ''),
    email: String(row[3] || ''), telegram: String(row[4] || ''), source: String(row[5] || ''),
    status: String(row[6] || 'Pending'), code_id: String(row[7] || ''), reviewed_at: String(row[8] || ''),
    verification_token_hash: String(row[9] || ''), verification_expires_at: String(row[10] || ''),
    verified_at: String(row[11] || ''), row_number: rowNumber,
  };
}`,
    "access request parser"
  );

  out = replaceOnce(out, "readSheet(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, 'A:I')", "readSheet(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, 'A:L')", "access request reader range");

  out = replaceBlockOnce(
    out,
    "async function updateDashboardAccessRequest(request, fields = {}) {",
    "\nasync function createDashboardViewerCode(",
    String.raw`async function updateDashboardAccessRequest(request, fields = {}) {
  if (!request || !request.row_number) return false;
  const sheets = await getSheetsClient();
  if (!sheets) return false;
  await ensureDashboardAccessVerificationHeaders(sheets);
  const status = fields.status ?? request.status;
  const codeId = fields.code_id ?? request.code_id;
  const reviewedAt = fields.reviewed_at ?? request.reviewed_at;
  const verificationTokenHash = fields.verification_token_hash ?? request.verification_token_hash ?? '';
  const verificationExpiresAt = fields.verification_expires_at ?? request.verification_expires_at ?? '';
  const verifiedAt = fields.verified_at ?? request.verified_at ?? '';
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "'Dashboard Access Requests'!G" + request.row_number + ':L' + request.row_number,
    valueInputOption: 'RAW',
    requestBody: { values: [[status, codeId, reviewedAt, verificationTokenHash, verificationExpiresAt, verifiedAt]] },
  });
  return true;
}`,
    "access request updater"
  );

  out = replaceOnce(
    out,
    '<form class="strategy-form" method="POST" action="/password-request">\n          <div class="form-grid">',
    '<form class="strategy-form" method="POST" action="/password-request">\n          <div class="form-grid">\n            ${TURNSTILE_SITE_KEY ? \'<div class="form-field full"><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><div class="cf-turnstile" data-sitekey="\' + escapeHtml(TURNSTILE_SITE_KEY) + \'" data-action="dashboard_access"></div></div>\' : \'\'}',
    "public access Turnstile widget"
  );

  out = replaceBlockOnce(out, "app.post('/password-request', async (req, res) => {", "\napp.post('/strategy-review', async (req, res) => {", NEW_PASSWORD_AND_VERIFY_ROUTES, "password request workflow");

  out = replaceOnce(
    out,
    "    const ipLimit = dashboardAccessIpLimiter.consume(req.ip || 'unknown');",
    "    dashboardAccessHealthRecord('request', true);\n    const ipLimit = dashboardAccessIpLimiter.consume(req.ip || 'unknown');",
    "access health request timestamp"
  );
  out = replaceOnce(
    out,
    "      stored = await logDashboardAccessRequest(request);",
    "      stored = await logDashboardAccessRequest(request);\n      if (stored) dashboardAccessHealthRecord('sheet', true, 'Request stored in Google Sheets');",
    "access health sheet success"
  );
  out = replaceOnce(
    out,
    "      console.error('Dashboard access request sheet logging failed:', sheetError);",
    "      console.error('Dashboard access request sheet logging failed:', sheetError);\n      dashboardAccessHealthFailure('sheet', sheetError);",
    "access health sheet failure"
  );
  out = replaceOnce(
    out,
    "    if (!stored) return dashboardAccessUnavailable(res, lang);",
    "    if (!stored) {\n      dashboardAccessHealthFailure('sheet', 'Dashboard access request was not stored.');\n      return dashboardAccessUnavailable(res, lang);\n    }",
    "access health sheet unavailable"
  );
  out = replaceOnce(
    out,
    "        text: dashboardAccessSecurity.verificationEmailText({ verificationUrl }),\n      });",
    "        text: dashboardAccessSecurity.verificationEmailText({ verificationUrl }),\n      });\n      dashboardAccessHealthRecord('verification_email', true, 'Verification email accepted by Resend');",
    "access health verification email success"
  );
  out = replaceOnce(
    out,
    "      console.error('Dashboard access verification email failed:', emailError);",
    "      console.error('Dashboard access verification email failed:', emailError);\n      dashboardAccessHealthFailure('verification_email', emailError);",
    "access health verification email failure"
  );
  out = replaceOnce(
    out,
    "      emailed = true;",
    "      emailed = true;\n      dashboardAccessHealthRecord('owner_notification', true, 'Owner notification accepted by Resend');",
    "access health owner notification success"
  );
  out = replaceOnce(
    out,
    "      console.error('Dashboard access verified owner email failed:', emailError);",
    "      console.error('Dashboard access verified owner email failed:', emailError);\n      dashboardAccessHealthFailure('owner_notification', emailError);",
    "access health owner notification failure"
  );
  out = replaceOnce(
    out,
    "    await notifyDashboardAccessOwner(verifiedRequest);",
    "    await notifyDashboardAccessOwner(verifiedRequest);\n    dashboardAccessHealthRecord('verified', true);",
    "access health verified timestamp"
  );

  out = insertBeforeOnce(out, "app.post('/admin/access/codes/create', async (req, res) => {", HEALTH_ROUTES + DELETE_ROUTE, "access health and delete routes");

  out = replaceOnce(
    out,
    "  const dashboardAccess = data.dashboard_access || { requests: [], codes: [], configured: false };",
    "  const dashboardAccess = data.dashboard_access || { requests: [], codes: [], configured: false };\n  const dashboardAccessHealth = dashboardAccessHealthSnapshot();",
    "admin access health snapshot"
  );

  out = replaceOnce(
    out,
    "      <div class=\"access-manager\">\n        <div class=\"access-manager-grid\">",
    "      <div class=\"access-manager\">\n        <div class=\"access-health-card\" id=\"dashboard-access-health-card\">\n          <div class=\"access-health-head\"><div><h3>Dashboard Access System</h3><p>Live health of the request → verification → owner-notification path.</p></div><span class=\"access-health-badge ${String(dashboardAccessHealth.status || 'READY').toLowerCase()}\" id=\"access-health-overall\">${escapeHtml(dashboardAccessHealth.status || 'READY')}</span></div>\n          <div class=\"access-health-grid\">\n            <div><span>Access form</span><strong id=\"access-health-form\">${escapeHtml(dashboardAccessHealth.components.access_form)}</strong></div>\n            <div><span>Turnstile</span><strong id=\"access-health-turnstile\">${escapeHtml(dashboardAccessHealth.components.turnstile)}</strong></div>\n            <div><span>Google Sheets</span><strong id=\"access-health-sheets\">${escapeHtml(dashboardAccessHealth.components.google_sheets)}</strong></div>\n            <div><span>Verification email</span><strong id=\"access-health-verification\">${escapeHtml(dashboardAccessHealth.components.verification_email)}</strong></div>\n            <div><span>Owner notification</span><strong id=\"access-health-owner\">${escapeHtml(dashboardAccessHealth.components.owner_notification)}</strong></div>\n          </div>\n          <div class=\"access-health-meta\">\n            <span>Last real request: <b id=\"access-health-last-request\">${dashboardAccessHealth.last_request_at ? escapeHtml(safeDateText(dashboardAccessHealth.last_request_at)) : 'No request since restart'}</b></span>\n            <span>Last verified activity: <b id=\"access-health-last-verified\">${dashboardAccessHealth.last_verified_at ? escapeHtml(safeDateText(dashboardAccessHealth.last_verified_at)) : 'No successful activity since restart'}</b></span>\n            <span>Last failure: <b id=\"access-health-last-failure\">${dashboardAccessHealth.last_failure ? escapeHtml(safeDateText(dashboardAccessHealth.last_failure.at) + ' · ' + dashboardAccessHealth.last_failure.component) : 'None since restart'}</b></span>\n            <span>Last system test: <b id=\"access-health-last-test\">${dashboardAccessHealth.last_test ? escapeHtml(safeDateText(dashboardAccessHealth.last_test.at) + (dashboardAccessHealth.last_test.ok ? ' · PASS' : ' · FAILED')) : 'Not run since restart'}</b></span>\n          </div>\n          <div class=\"access-health-actions\"><form method=\"post\" action=\"/admin/access/health/test\" onsubmit=\"return confirm('Run a safe Dashboard Access system test? A SYSTEM TEST email will be sent to the configured owner address; no customer request or viewer code will be created.')\"><button class=\"table-action access-approve\" type=\"submit\">Run Test Now</button></form><span>Auto-refreshes every 30 seconds. Email checks report Resend acceptance; inbox delivery is not claimed here.</span></div>\n          <script>(function(){function txt(id,value){var el=document.getElementById(id);if(el)el.textContent=value||'—';}function when(value,fallback){if(!value)return fallback;var d=new Date(value);return isNaN(d.getTime())?value:d.toLocaleString();}async function refresh(){try{var response=await fetch('/admin/access/health',{cache:'no-store',credentials:'same-origin'});if(!response.ok)return;var h=await response.json();var badge=document.getElementById('access-health-overall');if(badge){badge.textContent=h.status||'READY';badge.className='access-health-badge '+String(h.status||'READY').toLowerCase();}txt('access-health-form',h.components&&h.components.access_form);txt('access-health-turnstile',h.components&&h.components.turnstile);txt('access-health-sheets',h.components&&h.components.google_sheets);txt('access-health-verification',h.components&&h.components.verification_email);txt('access-health-owner',h.components&&h.components.owner_notification);txt('access-health-last-request',when(h.last_request_at,'No request since restart'));txt('access-health-last-verified',when(h.last_verified_at,'No successful activity since restart'));txt('access-health-last-failure',h.last_failure?when(h.last_failure.at,'')+' · '+h.last_failure.component:'None since restart');txt('access-health-last-test',h.last_test?when(h.last_test.at,'')+(h.last_test.ok?' · PASS':' · FAILED'):'Not run since restart');}catch(_error){}}setInterval(refresh,30000);})();</script>\n        </div>\n        <div class=\"access-manager-grid\">",
    "admin access health card"
  );

  out = replaceOnce(
    out,
    "    .access-row-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }\n    .access-row-actions form { margin:0; }\n    .access-approve { color:var(--green); border-color:#bfe9d2; background:var(--green-soft); }\n    .access-disable { color:var(--red); }",
    "    .access-health-card { border:1px solid var(--line); border-radius:18px; padding:16px; background:#fff; box-shadow:0 10px 30px rgba(16,38,29,.04); }\n    .access-health-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }\n    .access-health-head h3 { margin:0 0 5px; font-size:16px; font-weight:600; }\n    .access-health-head p { margin:0; color:var(--muted); font-size:12px; line-height:1.45; }\n    .access-health-badge { display:inline-flex; align-items:center; padding:6px 10px; border:1px solid var(--line); border-radius:999px; font-size:10px; font-weight:700; letter-spacing:.05em; white-space:nowrap; }\n    .access-health-badge.operational { color:var(--green); background:var(--green-soft); border-color:#bfe9d2; }\n    .access-health-badge.ready { color:#76500a; background:#fff9e8; border-color:#ecd49b; }\n    .access-health-badge.issue { color:var(--red); background:#fff1f2; border-color:#f1c4c9; }\n    .access-health-grid { margin-top:14px; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }\n    .access-health-grid>div { padding:10px; border:1px solid var(--line); border-radius:12px; background:#fbfefd; }\n    .access-health-grid span { display:block; color:var(--muted2); font-size:9px; text-transform:uppercase; letter-spacing:.05em; margin-bottom:5px; }\n    .access-health-grid strong { display:block; font-size:11px; font-weight:600; overflow-wrap:anywhere; }\n    .access-health-meta { margin-top:10px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 14px; color:var(--muted); font-size:10px; line-height:1.4; }\n    .access-health-meta b { color:var(--text); font-weight:550; }\n    .access-health-actions { margin-top:12px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }\n    .access-health-actions form { margin:0; }\n    .access-health-actions span { color:var(--muted2); font-size:10px; line-height:1.35; }\n    .access-row-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; min-width:250px; }\n    .access-row-actions form { margin:0; flex:0 1 auto; }\n    .access-row-actions .table-action { white-space:normal; line-height:1.2; }\n    .access-approve { color:var(--green); border-color:#bfe9d2; background:var(--green-soft); }\n    .access-delete,.access-disable { color:var(--red); }\n    .access-delete { border-color:#efc8cc; background:#fff5f6; }\n    @media(max-width:900px){.access-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.access-health-meta{grid-template-columns:1fr}}\n    @media(max-width:760px){.access-health-head{align-items:flex-start;flex-direction:column}.access-health-grid{grid-template-columns:1fr}.access-row-actions{justify-content:flex-start;min-width:220px}}",
    "access health and action responsive styles"
  );

  out = replaceOnce(
    out,
    "      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/reject\" onsubmit=\"return confirm('Reject this dashboard access request?')\"><button class=\"table-action\" type=\"submit\">Reject</button></form>",
    "      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/reject\" onsubmit=\"return confirm('Reject this dashboard access request?')\"><button class=\"table-action\" type=\"submit\">Reject</button></form>\n      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/delete\" onsubmit=\"return confirm('Permanently delete this dashboard access request?\\nThis cannot be undone.')\"><button class=\"table-action access-delete\" type=\"submit\">Delete</button></form>",
    "access request delete button"
  );

  out = websiteFunnelSourcePatch.patchAppSource(out);
  return out;
}

function installAppSourcePatch() {
  const appPath = path.resolve(__dirname, "app.js");
  const originalLoader = Module._extensions[".js"];
  if (originalLoader && originalLoader.__vixaleDashboardAccessSecurityWrapped) return;

  function accessGuardJsLoader(module, filename) {
    if (path.resolve(filename) !== appPath) return originalLoader(module, filename);
    const source = fs.readFileSync(filename, "utf8");
    module._compile(patchAppSource(source), filename);
  }
  Object.defineProperty(accessGuardJsLoader, "__vixaleDashboardAccessSecurityWrapped", { value: true });
  Module._extensions[".js"] = accessGuardJsLoader;
}

installAppSourcePatch();

module.exports = { APP_PATCH_MARKER, patchAppSource };
