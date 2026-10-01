"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const core = require("../lib/dashboard-access-security");

const APP_PATCH_MARKER = "VIXALE_DASHBOARD_ACCESS_SECURITY_PATCH";

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

  const emailHtml = core.verificationEmailHtml({ name: "<User>", verificationUrl: "https://example.test/dashboard-access/verify?token=" + token });
  assert(emailHtml.includes("Confirm Email"));
  assert(!emailHtml.includes("<User>"), "user-controlled names must be escaped");
  assert(!emailHtml.includes("email="), "verification URL must not contain email PII");

  const sentHtml = core.verificationSentHtml({ email: "foo@example.com", name: "<User>" });
  assert(sentHtml.includes("manual review"));
  assert(sentHtml.includes("Spam/Junk"));
  const sentHtmlRu = core.verificationSentHtml({ email: "foo@example.com", lang: "ru" });
  assert(sentHtmlRu.includes("Спам"));
  const verifiedHtml = core.verifiedHtml();
  assert(verifiedHtml.includes("Your email is confirmed. Your access request is awaiting manual review."));
  assert(verifiedHtml.includes("Access is not granted automatically"));
  assert(verifiedHtml.includes("personal viewer code"));

  const appPath = path.join(__dirname, "..", "app.js");
  let appSource = fs.readFileSync(appPath, "utf8");
  if (!appSource.includes(APP_PATCH_MARKER)) {
    const patcherPath = path.join(__dirname, "..", "website_dashboard_access_security.js");
    assert(fs.existsSync(patcherPath), "Access Guard direct patch marker missing and migration patcher unavailable");
    const { patchAppSource } = require(patcherPath);
    appSource = patchAppSource(appSource);
  }

  assert(appSource.includes(APP_PATCH_MARKER));
  assert(appSource.includes("app.set('trust proxy', 1)"), "proxy-aware req.ip behavior must remain");
  assert(appSource.includes("TURNSTILE_SITE_KEY"));
  assert(appSource.includes("TURNSTILE_SECRET_KEY"));
  assert(appSource.includes('data-action="dashboard_access"'));
  assert(appSource.includes("body.website"), "honeypot must remain");
  assert(appSource.indexOf("body.website") < appSource.indexOf("dashboardAccessIpLimiter.consume"));
  assert(appSource.includes("limit: 5, windowMs: 15 * 60 * 1000"));
  assert(appSource.includes("limit: 3, windowMs: 60 * 60 * 1000"));
  assert(appSource.includes("'Awaiting Verification'"));
  assert(appSource.includes("verification_token_hash: verificationTokenHash"));
  assert(!appSource.includes("verification_token: verificationToken"), "raw verification token must not be stored");
  assert(appSource.includes("'Dashboard Access Requests'!A:L"));
  assert(appSource.includes("Verification Token Hash"));
  assert(appSource.includes("app.get('/dashboard-access/verify'"));
  assert(appSource.includes("status: 'Pending'"));
  assert(appSource.includes("verification_token_hash: ''"));
  assert(appSource.includes("verified_at: verifiedAt"));
  assert(appSource.includes("notifyDashboardAccessOwner(verifiedRequest)"));
  assert(appSource.includes("app.post('/admin/access/requests/:id/approve'"));
  assert(appSource.includes("app.post('/admin/access/requests/:id/reject'"));
  assert(appSource.includes("app.post('/admin/access/requests/:id/delete'"));
  assert(appSource.includes("if (!adminAccessRequestAllowed(req, res)) return;"), "Admin access actions must reuse existing owner guard");
  assert(appSource.includes("deleteDimension"));
  assert(appSource.includes("linkedCode"));
  assert(appSource.includes("access-delete"));
  assert(appSource.includes("Permanently delete this dashboard access request?\\nThis cannot be undone."));

  assert(appSource.includes("const dashboardAccessHealthState ="), "health state must be installed");
  assert(appSource.includes("function dashboardAccessHealthSnapshot()"), "health snapshot helper must be installed");
  assert(appSource.includes("dashboardAccessHealthFailure('sheet'"), "sheet failures must feed health state");
  assert(appSource.includes("dashboardAccessHealthFailure('verification_email'"), "verification email failures must feed health state");
  assert(appSource.includes("dashboardAccessHealthRecord('owner_notification', true"), "owner notification success must feed health state");
  assert(appSource.includes("app.get('/admin/access/health'"), "owner health JSON route must exist");
  assert(appSource.includes("app.post('/admin/access/health/test'"), "owner synthetic test route must exist");
  assert(appSource.includes("[SYSTEM TEST] Vixale Dashboard Access Health Check"), "synthetic test email must be visibly marked");
  assert(appSource.includes("range: \"'Dashboard Access Requests'!A1:L1\""), "synthetic test must verify sheet readability without adding a customer row");
  assert(appSource.includes("Dashboard Access System"), "health card must appear in /admin/live");
  assert(appSource.includes("Run Test Now"), "health card must expose a manual test control");
  assert(appSource.includes("fetch('/admin/access/health'"), "health card must refresh without reloading admin live");
  assert(appSource.includes("setInterval(refresh,30000)"), "health card must auto-refresh every 30 seconds");
  assert(!appSource.includes("verification_token: verificationToken"), "health work must not weaken verification token handling");

  assert(appSource.includes("app.post('/dashboard-login'"), "dashboard login must remain present");
  assert(appSource.includes("app.post('/tv', handleTradingViewWebhook)"), "TradingView webhook must remain untouched");

  const verifyStart = appSource.indexOf("app.get('/dashboard-access/verify'");
  const verifyEnd = appSource.indexOf("app.post('/strategy-review'", verifyStart);
  const verifyBlock = appSource.slice(verifyStart, verifyEnd);
  assert(!verifyBlock.includes("createDashboardViewerCode("), "email verification must never create a viewer code");

  const healthTestStart = appSource.indexOf("app.post('/admin/access/health/test'");
  const healthTestEnd = appSource.indexOf("app.post('/admin/access/requests/:id/delete'", healthTestStart);
  const healthTestBlock = appSource.slice(healthTestStart, healthTestEnd);
  assert(!healthTestBlock.includes("logDashboardAccessRequest("), "synthetic test must not create fake customer requests");
  assert(!healthTestBlock.includes("createDashboardViewerCode("), "synthetic test must never create viewer codes");
  assert(healthTestBlock.includes("adminAccessRequestAllowed(req, res)"), "synthetic test must be owner-only");

  new vm.Script(appSource, { filename: "app.js" });
  console.log("Dashboard access security + health monitor: PASS");
})().catch(error => { console.error(error); process.exit(1); });
