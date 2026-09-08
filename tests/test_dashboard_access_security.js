"use strict";

const assert = require("assert");
const {
  TURNSTILE_ACTION,
  IP_LIMIT,
  IP_WINDOW_MS,
  EMAIL_LIMIT,
  EMAIL_WINDOW_MS,
  normalizeEmail,
  generateVerificationToken,
  isVerificationTokenFormatValid,
  hashVerificationToken,
  consumeRateLimit,
  verifyTurnstileToken,
  transformAppSource,
} = require("../website_dashboard_access_security");

(async () => {
  assert.strictEqual(TURNSTILE_ACTION, "dashboard_access");
  assert.strictEqual(normalizeEmail("  User@Example.COM "), "user@example.com");

  const token = generateVerificationToken();
  assert.strictEqual(token.length, 64);
  assert(isVerificationTokenFormatValid(token));
  assert(!isVerificationTokenFormatValid("bad-token"));
  const tokenHash = hashVerificationToken(token);
  assert(/^[a-f0-9]{64}$/.test(tokenHash));
  assert.notStrictEqual(tokenHash, token);
  assert.strictEqual(hashVerificationToken(token), tokenHash);

  const ipMap = new Map();
  for (let i = 0; i < IP_LIMIT; i += 1) assert(consumeRateLimit(ipMap, "203.0.113.5", IP_LIMIT, IP_WINDOW_MS, 1_000 + i).allowed);
  const ipBlocked = consumeRateLimit(ipMap, "203.0.113.5", IP_LIMIT, IP_WINDOW_MS, 2_000);
  assert.strictEqual(ipBlocked.allowed, false);
  assert(ipBlocked.retryAfterSeconds > 0);

  const emailMap = new Map();
  for (let i = 0; i < EMAIL_LIMIT; i += 1) assert(consumeRateLimit(emailMap, "user@example.com", EMAIL_LIMIT, EMAIL_WINDOW_MS, 1_000 + i).allowed);
  assert.strictEqual(consumeRateLimit(emailMap, "user@example.com", EMAIL_LIMIT, EMAIL_WINDOW_MS, 2_000).allowed, false);

  const missingSecret = await verifyTurnstileToken({ token: "x", secret: "", fetchImpl: async () => { throw new Error("must not call"); } });
  assert.deepStrictEqual(missingSecret, { ok: false, unavailable: true });

  const invalidTurnstile = await verifyTurnstileToken({
    token: "turnstile-token",
    secret: "secret",
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: false, action: "dashboard_access" }) }),
  });
  assert.strictEqual(invalidTurnstile.ok, false);

  const wrongAction = await verifyTurnstileToken({
    token: "turnstile-token",
    secret: "secret",
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, action: "other" }) }),
  });
  assert.strictEqual(wrongAction.ok, false);

  let siteverifyBody = "";
  const validTurnstile = await verifyTurnstileToken({
    token: "turnstile-token",
    secret: "secret-value",
    ip: "203.0.113.9",
    fetchImpl: async (url, options) => {
      assert.strictEqual(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
      assert.strictEqual(options.method, "POST");
      siteverifyBody = String(options.body);
      return { ok: true, json: async () => ({ success: true, action: "dashboard_access" }) };
    },
  });
  assert.strictEqual(validTurnstile.ok, true);
  assert(siteverifyBody.includes("response=turnstile-token"));
  assert(siteverifyBody.includes("remoteip=203.0.113.9"));

  const source = `
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const DASHBOARD_ACCESS_REQUESTS_HEADERS = ['ID', 'Requested At', 'Name', 'Email', 'Telegram', 'Source', 'Status', 'Code ID', 'Reviewed At'];
async function logDashboardAccessRequest(request) {
  await sheets.spreadsheets.values.append({
    range: \`'\${DASHBOARD_ACCESS_REQUESTS_SHEET}'!A:I\`,
    requestBody: { values: [[
        request.status,
        '',
        '',
      ]], },
  });
}
function parseDashboardAccessRequestRow(row, rowNumber) { return {
    reviewed_at: String(row[8] || ''),
    row_number: rowNumber,
}; }
async function dashboardAccessAdminData() {
  const values = [
    readSheet(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, 'A:I'),
  ];
  return values;
}
async function updateDashboardAccessRequest(request, fields = {}) { return false; }
async function createDashboardViewerCode({ name = '' } = {}) { return { code: 'SENTINEL' }; }
function renderHome(){ return \`<section id="password-access">\n        <form class="strategy-form" method="POST" action="/password-request"><button>Request</button></form></section>\`; }
function renderOwner(){ const request={id:'1',code_id:''}; return \`
      <form method="post" action="/admin/access/requests/\${encodeURIComponent(request.id)}/reject" onsubmit="return confirm('Reject this dashboard access request?')"><button class="table-action" type="submit">Reject</button></form>\`; }
const styles = \`    .access-disable { color:var(--red); }\`;
function tradingSentinel(){ return 'TRADING_UNCHANGED'; }
app.get('/login', (req,res)=>res.send('LOGIN_UNCHANGED'));
app.post('/admin/access/requests/:id/approve', async (req,res)=>{ return createDashboardViewerCode({}); });
app.post('/admin/access/requests/:id/reject', async (req,res)=>{ return updateDashboardAccessRequest({}, { status: 'Rejected' }); });
app.post('/admin/access/codes/create', async (req, res) => { return createDashboardViewerCode({}); });
app.post('/password-request', async (req, res) => {
  const body = req.body || {};
  const lang = 'en';
  if (body.website) return res.status(200).send('bot');
  return res.status(200).send('old');
});
app.post('/strategy-review', async (req, res) => { return res.send('strategy'); });
`;

  const out = transformAppSource(source);
  new Function(out);

  assert(out.includes("'Verification Token Hash', 'Verification Expires At', 'Verified At'"));
  assert(out.includes("'${DASHBOARD_ACCESS_REQUESTS_SHEET}'!A:L"));
  assert(out.includes("readSheet(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, 'A:L')"));
  assert(out.includes("verification_token_hash: String(row[9] || '')"));
  assert(out.includes("verification_expires_at: String(row[10] || '')"));
  assert(out.includes("verified_at: String(row[11] || '')"));
  assert(out.includes("request.verification_token_hash || ''"));
  assert(!out.includes("request.raw_verification_token"));

  const formStart = out.indexOf('action="/password-request"');
  const formEnd = out.indexOf("</form>", formStart);
  const formHtml = out.slice(formStart, formEnd);
  assert(formHtml.includes("challenges.cloudflare.com/turnstile/v0/api.js"));
  assert(formHtml.includes('data-action="dashboard_access"'));
  assert(formHtml.includes("TURNSTILE_SITE_KEY"));
  assert(!formHtml.includes("TURNSTILE_SECRET_KEY"));

  const requestRouteStart = out.indexOf("app.post('/password-request'");
  const verifyRouteStart = out.indexOf("app.get('/dashboard-access/verify'");
  const strategyRouteStart = out.indexOf("app.post('/strategy-review'");
  const requestRoute = out.slice(requestRouteStart, verifyRouteStart);
  const verifyRoute = out.slice(verifyRouteStart, strategyRouteStart);

  assert(requestRoute.includes("if (body.website)"));
  assert(requestRoute.indexOf("if (body.website)") < requestRoute.indexOf("dashboardAccessIpAttempts"));
  assert(requestRoute.indexOf("dashboardAccessIpAttempts") < requestRoute.indexOf("normalizeDashboardAccessEmail"));
  assert(requestRoute.indexOf("normalizeDashboardAccessEmail") < requestRoute.indexOf("dashboardAccessEmailAttempts"));
  assert(requestRoute.indexOf("dashboardAccessEmailAttempts") < requestRoute.indexOf("verifyDashboardTurnstile"));
  assert(requestRoute.indexOf("verifyDashboardTurnstile") < requestRoute.indexOf("generateDashboardVerificationToken"));
  assert(requestRoute.includes("status: 'Awaiting Verification'"));
  assert(requestRoute.includes("verification_token_hash: dashboardVerificationTokenHash(rawVerificationToken)"));
  assert(requestRoute.includes("verification_expires_at"));
  assert(requestRoute.includes("'Verification Email Failed'"));
  assert(requestRoute.includes("updateDashboardAccessRequestById(request.id"));
  assert(requestRoute.includes("subject: 'Confirm your Vixale dashboard request'"));
  assert(!requestRoute.includes("notifyDashboardAccessOwner"));
  assert(!requestRoute.includes("createDashboardViewerCode"));

  assert(verifyRoute.includes("isDashboardVerificationTokenValid"));
  assert(verifyRoute.includes("AWAITING VERIFICATION"));
  assert(verifyRoute.includes("expiresAt <= Date.now()"));
  assert(verifyRoute.includes("dashboardAccessVerificationInFlight"));
  assert(verifyRoute.includes("status: 'Pending'"));
  assert(verifyRoute.includes("verification_token_hash: ''"));
  assert(verifyRoute.includes("verified_at: verifiedAt"));
  assert(verifyRoute.indexOf("updateDashboardAccessRequest") < verifyRoute.indexOf("notifyDashboardAccessOwner"));
  assert(!verifyRoute.includes("createDashboardViewerCode"));

  assert(out.includes("async function updateDashboardAccessRequestById"));
  assert(out.includes("app.post('/admin/access/requests/:id/delete'"));
  assert(out.includes("if (String(request.code_id || '').trim())"));
  assert(out.includes("deleteDimension"));
  assert(out.includes("Permanently delete this dashboard access request?\\nThis cannot be undone."));
  assert(out.includes("access-delete"));
  assert(out.includes("white-space:nowrap"));

  assert(out.includes("app.post('/admin/access/requests/:id/approve'"));
  assert(out.includes("app.post('/admin/access/requests/:id/reject'"));
  assert(out.includes("status: 'Rejected'"));
  assert(out.includes("createDashboardViewerCode"));
  assert(out.includes("TRADING_UNCHANGED"));
  assert(out.includes("LOGIN_UNCHANGED"));

  console.log("Dashboard access security helpers and source transform: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
