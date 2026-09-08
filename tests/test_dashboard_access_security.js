"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const core = require("../lib/dashboard-access-security");
const { APP_PATCH_MARKER, patchAppSource } = require("../website_dashboard_access_security");

(async () => {
  assert.strictEqual(core.normalizeAccessEmail("  Foo@Example.COM  "), "foo@example.com");

  let nowMs = 1_000_000;
  const ipLimiter = core.createBoundedRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000, now: () => nowMs, maxKeys: 10 });
  for (let i = 0; i < 5; i++) assert.strictEqual(ipLimiter.consume("1.2.3.4").allowed, true);
  const blockedIp = ipLimiter.consume("1.2.3.4");
  assert.strictEqual(blockedIp.allowed, false);
  assert(blockedIp.retryAfterSeconds > 0);
  nowMs += 15 * 60 * 1000 + 1;
  assert.strictEqual(ipLimiter.consume("1.2.3.4").allowed, true);

  nowMs = 2_000_000;
  const emailLimiter = core.createBoundedRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000, now: () => nowMs, maxKeys: 2 });
  for (let i = 0; i < 3; i++) assert.strictEqual(emailLimiter.consume("test@example.com").allowed, true);
  assert.strictEqual(emailLimiter.consume("test@example.com").allowed, false);
  emailLimiter.consume("a@example.com");
  emailLimiter.consume("b@example.com");
  emailLimiter.consume("c@example.com");
  assert(emailLimiter.size() <= 2, "rate limiter Map must remain bounded");

  const token = "a".repeat(64);
  assert(core.isVerificationTokenFormat(token));
  assert(!core.isVerificationTokenFormat("bad-token"));
  assert.strictEqual(core.hashToken("secret").length, 64);

  let fetchBody = "";
  const success = await core.verifyTurnstileToken({
    token: "turnstile-token",
    secretKey: "secret-key",
    remoteIp: "203.0.113.5",
    fetchImpl: async (_url, options) => {
      fetchBody = options.body;
      return { ok: true, json: async () => ({ success: true, action: "dashboard_access" }) };
    },
  });
  assert.strictEqual(success.ok, true);
  assert(fetchBody.includes("secret=secret-key"));
  assert(fetchBody.includes("response=turnstile-token"));
  assert(fetchBody.includes("remoteip=203.0.113.5"));
  const invalid = await core.verifyTurnstileToken({ token: "x", secretKey: "y", fetchImpl: async () => ({ ok: true, json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) }) });
  assert.strictEqual(invalid.ok, false);
  const wrongAction = await core.verifyTurnstileToken({ token: "x", secretKey: "y", fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, action: "other" }) }) });
  assert.strictEqual(wrongAction.ok, false);

  const emailHtml = core.verificationEmailHtml({ name: '<User>', verificationUrl: 'https://example.test/dashboard-access/verify?token=' + token });
  assert(emailHtml.includes("Confirm Email"));
  assert(!emailHtml.includes("<User>"), "user-controlled names must be escaped");
  assert(!emailHtml.includes("email="), "verification URL must not contain email PII");
  const sentHtml = core.verificationSentHtml({ email: 'foo@example.com', name: '<User>' });
  assert(sentHtml.includes("manual review"));
  assert(!sentHtml.includes("<User>"));
  assert(core.verifiedHtml().includes("Access is not granted automatically"));

  const fixture = `
const DASHBOARD_REQUEST_EMAIL = process.env.DASHBOARD_REQUEST_EMAIL || PASSWORD_REQUEST_BCC || '';
const DASHBOARD_ACCESS_REQUESTS_HEADERS = ['ID', 'Requested At', 'Name', 'Email', 'Telegram', 'Source', 'Status', 'Code ID', 'Reviewed At'];
async function logDashboardAccessRequest(request) { oldWriter(); }
function normalizeDashboardAccessCode(value) { return value; }
function parseDashboardAccessRequestRow(row, rowNumber) { return {id: row[0], row_number: rowNumber}; }
function parseDashboardAccessCodeRow(row, rowNumber) { return {}; }
async function dashboardAccessAdminData(){ const x=readSheet(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, 'A:I'); return x; }
async function updateDashboardAccessRequest(request, fields = {}) { oldUpdate(); }
async function createDashboardViewerCode(opts) { return opts; }
function render(){ return \`<form class="strategy-form" method="POST" action="/password-request">
          <div class="form-grid">x</div></form>\`; }
function adminRows(request){ return \`<div class="access-row-actions">
      <form method="post" action="/admin/access/requests/\${encodeURIComponent(request.id)}/approve"><button>Create 30-Day Code</button></form>
      <form method="post" action="/admin/access/requests/\${encodeURIComponent(request.id)}/reject" onsubmit="return confirm('Reject this dashboard access request?')"><button class="table-action" type="submit">Reject</button></form>
    </div>\`; }
const css = \`    .access-row-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
    .access-row-actions form { margin:0; }
    .access-approve { color:var(--green); border-color:#bfe9d2; background:var(--green-soft); }
    .access-disable { color:var(--red); }\`;
app.post('/password-request', async (req, res) => { oldPasswordRequest(); });
app.post('/strategy-review', async (req, res) => { strategyReview(); });
function adminAccessRequestAllowed(req,res){ return true; }
app.post('/admin/access/requests/:id/approve', async (req, res) => { createDashboardViewerCode({ name: request.name, email: request.email, telegram: request.telegram, sourceRequestId: request.id, days: req.body.days }); });
app.post('/admin/access/requests/:id/reject', async (req, res) => { reject(); });
app.post('/admin/access/codes/create', async (req, res) => { createCode(); });
app.post('/dashboard-login', async (req,res)=>{ viewerLogin(); });
app.post('/tv', handleTradingViewWebhook);
`;

  const repoAppPath = path.join(__dirname, "..", "app.js");
  const appSource = fs.existsSync(repoAppPath) ? fs.readFileSync(repoAppPath, "utf8") : fixture;
  assert(appSource.includes("app.post('/password-request'"), "existing public access route must be inspected");
  assert(appSource.includes("app.post('/admin/access/requests/:id/approve'"), "existing Approve route must remain");
  assert(appSource.includes("app.post('/admin/access/requests/:id/reject'"), "existing Reject route must remain");
  assert(appSource.includes("app.post('/dashboard-login'"), "existing viewer login must remain");
  assert(appSource.includes("app.post('/tv', handleTradingViewWebhook)"), "existing TradingView webhook must remain");
  const patched = patchAppSource(appSource);
  assert(patched.includes(APP_PATCH_MARKER));
  assert(patched.includes("TURNSTILE_SITE_KEY"));
  assert(patched.includes("TURNSTILE_SECRET_KEY"));
  assert(patched.includes('data-action="dashboard_access"'));
  assert(patched.includes("body.website"), "honeypot must remain first in the public flow");
  assert(patched.indexOf("body.website") < patched.indexOf("dashboardAccessIpLimiter.consume"));
  assert(patched.includes("limit: 5, windowMs: 15 * 60 * 1000"));
  assert(patched.includes("limit: 3, windowMs: 60 * 60 * 1000"));
  assert(patched.includes("'Awaiting Verification'"));
  assert(patched.includes("verification_token_hash: verificationTokenHash"));
  assert(!patched.includes("verification_token: verificationToken"), "raw verification token must not be stored");
  assert(patched.includes("'Dashboard Access Requests'!A:L"));
  assert(patched.includes("Verification Token Hash"));
  assert(patched.includes("app.get('/dashboard-access/verify'"));
  assert(patched.includes("status: 'Pending'"));
  assert(patched.includes("verification_token_hash: ''"));
  assert(patched.includes("verified_at: verifiedAt"));
  assert(patched.includes("notifyDashboardAccessOwner(verifiedRequest)"));
  assert(!patched.includes("createDashboardViewerCode({\n      name: request.name,\n      email: request.email,\n      telegram: request.telegram,\n      sourceRequestId: request.id,\n      days: req.body.days,\n    });\n    await notifyDashboardAccessOwner"), "verification must not create viewer codes");
  assert(patched.includes("app.post('/admin/access/requests/:id/delete'"));
  assert(patched.includes("if (!adminAccessRequestAllowed(req, res)) return;"), "Delete must reuse existing owner guard");
  assert(patched.includes("deleteDimension"));
  assert(patched.includes("linkedCode"));
  assert(patched.includes("access-delete"));
  assert(patched.includes("Permanently delete this dashboard access request?\\nThis cannot be undone."));
  assert(patched.includes("app.post('/dashboard-login'"), "dashboard login must remain present");
  assert(patched.includes("app.post('/tv', handleTradingViewWebhook)"), "TradingView webhook must remain untouched");
  assert.strictEqual(patchAppSource(patched), patched, "patch must be idempotent");

  new vm.Script(patched, { filename: fs.existsSync(repoAppPath) ? "patched-app.js" : "patched-app-fixture.js" });
  console.log("Dashboard access security hardening: PASS");
})().catch(error => { console.error(error); process.exit(1); });
