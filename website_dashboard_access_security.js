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

function patchAppSource(source) {
  if (typeof source !== "string") throw new TypeError("app source must be a string");
  if (source.includes(APP_PATCH_MARKER)) return source;
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

  out = insertBeforeOnce(out, "async function logDashboardAccessRequest(request) {", ACCESS_HELPERS + "\n", "access security helpers");

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

  out = insertBeforeOnce(out, "app.post('/admin/access/codes/create', async (req, res) => {", DELETE_ROUTE, "access request delete route");

  out = replaceOnce(
    out,
    "      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/reject\" onsubmit=\"return confirm('Reject this dashboard access request?')\"><button class=\"table-action\" type=\"submit\">Reject</button></form>",
    "      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/reject\" onsubmit=\"return confirm('Reject this dashboard access request?')\"><button class=\"table-action\" type=\"submit\">Reject</button></form>\n      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/delete\" onsubmit=\"return confirm('Permanently delete this dashboard access request?\\nThis cannot be undone.')\"><button class=\"table-action access-delete\" type=\"submit\">Delete</button></form>",
    "access request delete button"
  );

  out = replaceOnce(
    out,
    "    .access-row-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }\n    .access-row-actions form { margin:0; }\n    .access-approve { color:var(--green); border-color:#bfe9d2; background:var(--green-soft); }\n    .access-disable { color:var(--red); }",
    "    .access-row-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; min-width:250px; }\n    .access-row-actions form { margin:0; flex:0 1 auto; }\n    .access-row-actions .table-action { white-space:normal; line-height:1.2; }\n    .access-approve { color:var(--green); border-color:#bfe9d2; background:var(--green-soft); }\n    .access-delete,.access-disable { color:var(--red); }\n    .access-delete { border-color:#efc8cc; background:#fff5f6; }\n    @media(max-width:760px){.access-row-actions{justify-content:flex-start;min-width:220px}}",
    "access action responsive styles"
  );

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
