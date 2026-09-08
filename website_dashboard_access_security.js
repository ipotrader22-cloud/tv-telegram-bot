"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const crypto = require("crypto");

const APP_PATH = path.resolve(__dirname, "app.js");
const TURNSTILE_ACTION = "dashboard_access";
const VERIFY_TOKEN_BYTES = 32;
const VERIFY_TOKEN_RE = /^[a-f0-9]{64}$/i;
const IP_LIMIT = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAP_MAX_KEYS = 5000;

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first < 0 || first !== last) {
    throw new Error(`Dashboard access security transform expected exactly one ${label || "anchor"}.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function replaceBetween(source, startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  if (start < 0 || start !== source.lastIndexOf(startNeedle)) {
    throw new Error(`Dashboard access security transform expected exactly one ${label || "start anchor"}.`);
  }
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Dashboard access security transform could not find ${label || "end anchor"}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function generateVerificationToken() {
  return crypto.randomBytes(VERIFY_TOKEN_BYTES).toString("hex");
}

function isVerificationTokenFormatValid(value) {
  return VERIFY_TOKEN_RE.test(String(value || "").trim());
}

function hashVerificationToken(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function consumeRateLimit(map, key, limit, windowMs, now = Date.now()) {
  const normalizedKey = String(key || "");
  const cutoff = now - windowMs;

  for (const [existingKey, timestamps] of map.entries()) {
    const fresh = (timestamps || []).filter(ts => ts > cutoff);
    if (fresh.length) map.set(existingKey, fresh);
    else map.delete(existingKey);
  }

  const attempts = (map.get(normalizedKey) || []).filter(ts => ts > cutoff);
  if (attempts.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((attempts[0] + windowMs - now) / 1000));
    map.set(normalizedKey, attempts);
    return { allowed: false, retryAfterSeconds };
  }

  attempts.push(now);
  map.set(normalizedKey, attempts);
  while (map.size > RATE_MAP_MAX_KEYS) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

async function verifyTurnstileToken({ token, secret, ip = "", fetchImpl = global.fetch }) {
  if (!secret || !token || typeof fetchImpl !== "function") return { ok: false, unavailable: !secret };
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response || !response.ok) return { ok: false, unavailable: false };
    const result = await response.json();
    return {
      ok: result && result.success === true && result.action === TURNSTILE_ACTION,
      unavailable: false,
      result,
    };
  } catch (_) {
    return { ok: false, unavailable: false };
  }
}

const RUNTIME_HELPERS = String.raw`
const TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || '').trim();
const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const DASHBOARD_ACCESS_VERIFY_TTL_MS = 60 * 60 * 1000;
const DASHBOARD_ACCESS_IP_LIMIT = 5;
const DASHBOARD_ACCESS_IP_WINDOW_MS = 15 * 60 * 1000;
const DASHBOARD_ACCESS_EMAIL_LIMIT = 3;
const DASHBOARD_ACCESS_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const DASHBOARD_ACCESS_RATE_MAP_MAX_KEYS = 5000;
const dashboardAccessIpAttempts = new Map();
const dashboardAccessEmailAttempts = new Map();
const dashboardAccessVerificationInFlight = new Set();

function normalizeDashboardAccessEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function consumeDashboardAccessRateLimit(map, key, limit, windowMs, now = Date.now()) {
  const cutoff = now - windowMs;
  for (const [existingKey, timestamps] of map.entries()) {
    const fresh = (timestamps || []).filter(ts => ts > cutoff);
    if (fresh.length) map.set(existingKey, fresh);
    else map.delete(existingKey);
  }
  const attempts = (map.get(String(key || '')) || []).filter(ts => ts > cutoff);
  if (attempts.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((attempts[0] + windowMs - now) / 1000));
    map.set(String(key || ''), attempts);
    return { allowed: false, retryAfterSeconds };
  }
  attempts.push(now);
  map.set(String(key || ''), attempts);
  while (map.size > DASHBOARD_ACCESS_RATE_MAP_MAX_KEYS) map.delete(map.keys().next().value);
  return { allowed: true, retryAfterSeconds: 0 };
}

function dashboardAccessRateLimited(res, lang, retryAfterSeconds) {
  if (retryAfterSeconds) res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).send(lang === 'ru'
    ? 'Слишком много запросов. Пожалуйста, попробуйте позже.'
    : 'Too many requests. Please try again later.');
}

function generateDashboardVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function dashboardVerificationTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function isDashboardVerificationTokenValid(token) {
  return /^[a-f0-9]{64}$/i.test(String(token || '').trim());
}

async function verifyDashboardTurnstile(token, remoteIp) {
  if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) return { ok: false, unavailable: true };
  if (!token || String(token).length > 2048) return { ok: false, unavailable: false };
  try {
    const params = new URLSearchParams();
    params.set('secret', TURNSTILE_SECRET_KEY);
    params.set('response', String(token));
    if (remoteIp) params.set('remoteip', String(remoteIp));
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!response.ok) return { ok: false, unavailable: false };
    const result = await response.json();
    return {
      ok: result && result.success === true && result.action === 'dashboard_access',
      unavailable: false,
    };
  } catch (error) {
    console.error('Dashboard access Turnstile verification failed:', error?.message || error);
    return { ok: false, unavailable: false };
  }
}

function dashboardAccessVerifyUrl(rawToken) {
  return String(SITE_BASE_URL || '').replace(/\/+$/, '') + '/dashboard-access/verify?token=' + encodeURIComponent(rawToken);
}

function renderDashboardVerificationEmailHtml(request, verifyUrl) {
  const safeName = escapeHtml(request.name || 'there');
  const safeUrl = escapeHtml(verifyUrl);
  return '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211d">' +
    '<h2>Confirm your Vixale dashboard request</h2>' +
    '<p>Hello ' + safeName + ',</p>' +
    '<p>Please confirm your email before your dashboard access request is submitted for manual review.</p>' +
    '<p><a href="' + safeUrl + '" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#078f51;color:#fff;text-decoration:none">Confirm Email</a></p>' +
    '<p>This link expires in 60 minutes. Email verification does not grant dashboard access.</p>' +
    '</div>';
}

function renderDashboardVerificationEmailText(request, verifyUrl) {
  return 'Confirm your Vixale dashboard request\n\n' +
    'Please confirm your email before your dashboard access request is submitted for manual review.\n\n' +
    'Confirm Email: ' + verifyUrl + '\n\n' +
    'This link expires in 60 minutes. Email verification does not grant dashboard access.';
}

function renderDashboardVerificationSentHtml(lang) {
  const title = lang === 'ru' ? 'Проверьте email' : 'Check your email';
  const body = lang === 'ru'
    ? 'Мы отправили ссылку подтверждения. Заявка появится на ручной проверке только после подтверждения email. Доступ автоматически не предоставляется.'
    : 'We sent a confirmation link. Your request will enter manual review only after you confirm your email. Access is never granted automatically.';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + ' | Vixale</title></head><body style="font-family:Arial,sans-serif;padding:40px;max-width:720px;margin:auto"><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(body) + '</p><p><a href="/">Back to Vixale</a></p></body></html>';
}

function renderDashboardVerifiedHtml() {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email confirmed | Vixale</title></head><body style="font-family:Arial,sans-serif;padding:40px;max-width:720px;margin:auto"><h1>Email confirmed.</h1><p>Your dashboard access request has been submitted for review.</p><p>Access is not granted automatically. If approved, you will receive your personal viewer code by email.</p><p><a href="/">Back to Vixale</a></p></body></html>';
}

function renderDashboardVerificationInvalidHtml(message) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verification link | Vixale</title></head><body style="font-family:Arial,sans-serif;padding:40px;max-width:720px;margin:auto"><h1>Verification link unavailable.</h1><p>' + escapeHtml(message || 'This verification link is invalid, expired, or has already been used.') + '</p><p><a href="/#password-access">Request dashboard access</a></p></body></html>';
}

async function notifyDashboardAccessOwner(request) {
  let emailed = false;
  let telegramNotified = false;
  if (DASHBOARD_REQUEST_EMAIL && RESEND_API_KEY) {
    try {
      await sendEmail({
        to: DASHBOARD_REQUEST_EMAIL,
        subject: 'New Vixale Dashboard Access Request' + (request.name ? ' — ' + request.name : ''),
        html: renderAccessRequestOwnerEmailHtml(request),
        text: renderAccessRequestOwnerEmailText(request),
        replyTo: request.email,
      });
      emailed = true;
    } catch (emailError) {
      console.error('Dashboard access request owner email failed:', emailError);
    }
  } else {
    console.log('DASHBOARD_REQUEST_EMAIL or RESEND_API_KEY is not configured. Skipping owner email notification.');
  }

  if (ADMIN_CHAT_ID) {
    try {
      const telegramMessage = [
        '🔐 <b>New Dashboard Access Request</b>',
        '',
        request.name ? 'Name: <b>' + escapeHtml(request.name) + '</b>' : '',
        'Email: <b>' + escapeHtml(request.email) + '</b>',
        request.telegram ? 'Telegram: <b>' + escapeHtml(request.telegram) + '</b>' : '',
        'Source: <b>' + escapeHtml(request.source || 'Website') + '</b>',
        'Status: <b>Pending manual review</b>',
      ].filter(Boolean).join('\n');
      await sendAdminTelegram(telegramMessage);
      telegramNotified = true;
    } catch (telegramError) {
      console.error('Dashboard access request Telegram notification failed:', telegramError);
    }
  }
  return { emailed, telegramNotified };
}
`;

const UPDATED_REQUEST_FUNCTION = String.raw`async function updateDashboardAccessRequest(request, fields = {}) {
  if (!request || !request.row_number) return false;
  const sheets = await getSheetsClient();
  if (!sheets) return false;
  const status = fields.status ?? request.status;
  const codeId = fields.code_id ?? request.code_id;
  const reviewedAt = fields.reviewed_at ?? request.reviewed_at;
  const verificationTokenHash = fields.verification_token_hash ?? request.verification_token_hash ?? '';
  const verificationExpiresAt = fields.verification_expires_at ?? request.verification_expires_at ?? '';
  const verifiedAt = fields.verified_at ?? request.verified_at ?? '';
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: '\'' + DASHBOARD_ACCESS_REQUESTS_SHEET + '\'!G' + request.row_number + ':L' + request.row_number,
    valueInputOption: 'RAW',
    requestBody: { values: [[status, codeId, reviewedAt, verificationTokenHash, verificationExpiresAt, verifiedAt]] },
  });
  return true;
}

async function deleteDashboardAccessRequest(request) {
  if (!request || !request.row_number) return false;
  if (String(request.code_id || '').trim()) throw new Error('Code-linked dashboard access requests cannot be deleted.');
  const sheets = await getSheetsClient();
  if (!sheets) return false;
  const sheetId = await getSheetIdByName(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID,
    requestBody: { requests: [{ deleteDimension: { range: {
      sheetId,
      dimension: 'ROWS',
      startIndex: request.row_number - 1,
      endIndex: request.row_number,
    } } }] },
  });
  return true;
}

`;

const PUBLIC_ROUTES = String.raw`app.post('/password-request', async (req, res) => {
  const body = req.body || {};
  const lang = String(body.lang || 'en').toLowerCase() === 'ru' ? 'ru' : 'en';

  try {
    if (body.website) {
      return res.status(200).send(renderAccessRequestReceivedHtml('', '', lang));
    }

    const ipLimit = consumeDashboardAccessRateLimit(
      dashboardAccessIpAttempts,
      req.ip || '',
      DASHBOARD_ACCESS_IP_LIMIT,
      DASHBOARD_ACCESS_IP_WINDOW_MS
    );
    if (!ipLimit.allowed) return dashboardAccessRateLimited(res, lang, ipLimit.retryAfterSeconds);

    const name = String(body.name || '').trim().slice(0, 100);
    const email = normalizeDashboardAccessEmail(body.email).slice(0, 200);
    const telegram = String(body.telegram || '').trim().slice(0, 100);
    const source = String(body.source || 'Website').trim().slice(0, 120);

    if (!isValidEmail(email)) {
      return res.status(400).send(lang === 'ru' ? 'Введите корректный email.' : 'Please enter a valid email address.');
    }

    const emailLimit = consumeDashboardAccessRateLimit(
      dashboardAccessEmailAttempts,
      email,
      DASHBOARD_ACCESS_EMAIL_LIMIT,
      DASHBOARD_ACCESS_EMAIL_WINDOW_MS
    );
    if (!emailLimit.allowed) return dashboardAccessRateLimited(res, lang, emailLimit.retryAfterSeconds);

    if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) {
      return res.status(503).send(lang === 'ru'
        ? 'Проверка заявки временно недоступна. Пожалуйста, попробуйте позже.'
        : 'Dashboard access verification is temporarily unavailable. Please try again later.');
    }

    const turnstileToken = String(body['cf-turnstile-response'] || '').trim();
    if (!turnstileToken) {
      return res.status(400).send(lang === 'ru' ? 'Пожалуйста, пройдите проверку безопасности.' : 'Please complete the security verification.');
    }
    const turnstile = await verifyDashboardTurnstile(turnstileToken, req.ip || '');
    if (!turnstile.ok) {
      return res.status(turnstile.unavailable ? 503 : 400).send(lang === 'ru'
        ? 'Не удалось подтвердить проверку безопасности. Обновите страницу и попробуйте снова.'
        : 'Security verification failed. Refresh the page and try again.');
    }

    const rawVerificationToken = generateDashboardVerificationToken();
    const now = new Date();
    const request = {
      id: crypto.randomUUID(),
      requested_at: now.toISOString(),
      name,
      email,
      telegram,
      source,
      status: 'Awaiting Verification',
      verification_token_hash: dashboardVerificationTokenHash(rawVerificationToken),
      verification_expires_at: new Date(now.getTime() + DASHBOARD_ACCESS_VERIFY_TTL_MS).toISOString(),
      verified_at: '',
    };

    const stored = await logDashboardAccessRequest(request);
    if (!stored) throw new Error('Dashboard access request storage is unavailable.');

    try {
      const verificationUrl = dashboardAccessVerifyUrl(rawVerificationToken);
      await sendEmail({
        to: email,
        subject: 'Confirm your Vixale dashboard request',
        html: renderDashboardVerificationEmailHtml(request, verificationUrl),
        text: renderDashboardVerificationEmailText(request, verificationUrl),
      });
    } catch (emailError) {
      console.error('Dashboard access verification email failed:', emailError);
      try {
        await updateDashboardAccessRequest(request, { status: 'Verification Email Failed' });
      } catch (updateError) {
        console.error('Dashboard access verification failure status update failed:', updateError);
      }
      return res.status(502).send(lang === 'ru'
        ? 'Не удалось отправить письмо подтверждения. Пожалуйста, попробуйте позже.'
        : 'We could not send the confirmation email. Please try again later.');
    }

    return res.status(200).send(renderDashboardVerificationSentHtml(lang));
  } catch (err) {
    console.error('Dashboard access request form error:', err);
    return res.status(500).send(lang === 'ru'
      ? 'Сейчас не удалось отправить заявку. Попробуйте еще раз или напишите нам в Telegram.'
      : 'Dashboard access request could not be sent right now. Please try again or contact us on Telegram.');
  }
});

app.get('/dashboard-access/verify', async (req, res) => {
  const rawToken = String(req.query.token || '').trim();
  if (!isDashboardVerificationTokenValid(rawToken)) {
    return res.status(400).send(renderDashboardVerificationInvalidHtml());
  }

  const tokenHash = dashboardVerificationTokenHash(rawToken);
  if (dashboardAccessVerificationInFlight.has(tokenHash)) {
    return res.status(409).send(renderDashboardVerificationInvalidHtml('This verification link is already being processed.'));
  }
  dashboardAccessVerificationInFlight.add(tokenHash);

  try {
    const access = await dashboardAccessAdminData();
    const request = access.requests.find(item =>
      String(item.verification_token_hash || '') === tokenHash &&
      String(item.status || '').toUpperCase() === 'AWAITING VERIFICATION'
    );
    if (!request) return res.status(400).send(renderDashboardVerificationInvalidHtml());

    const expiresAt = Date.parse(request.verification_expires_at || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return res.status(400).send(renderDashboardVerificationInvalidHtml('This verification link has expired. Please submit a new request.'));
    }
    if (request.verified_at) return res.status(400).send(renderDashboardVerificationInvalidHtml());

    const verifiedAt = new Date().toISOString();
    await updateDashboardAccessRequest(request, {
      status: 'Pending',
      verification_token_hash: '',
      verified_at: verifiedAt,
    });

    const verifiedRequest = { ...request, status: 'Pending', verification_token_hash: '', verified_at: verifiedAt };
    await notifyDashboardAccessOwner(verifiedRequest);
    return res.status(200).send(renderDashboardVerifiedHtml());
  } catch (error) {
    console.error('Dashboard access email verification failed:', error);
    return res.status(500).send(renderDashboardVerificationInvalidHtml('We could not verify this request right now. Please try again later.'));
  } finally {
    dashboardAccessVerificationInFlight.delete(tokenHash);
  }
});

`;

const DELETE_ROUTE = String.raw`app.post('/admin/access/requests/:id/delete', async (req, res) => {
  try {
    if (!adminAccessRequestAllowed(req, res)) return;
    const access = await dashboardAccessAdminData();
    const request = access.requests.find(item => item.id === String(req.params.id || ''));
    if (!request) return res.status(404).send('Dashboard access request not found.');
    if (String(request.code_id || '').trim()) return res.status(409).send('Code-linked dashboard access requests cannot be deleted.');
    await deleteDashboardAccessRequest(request);
    return res.redirect('/admin/live#dashboard-access');
  } catch (error) {
    console.error('Dashboard access request delete error:', error);
    return res.status(500).send('Dashboard access request delete error.');
  }
});

`;

function transformAppSource(source) {
  let out = String(source);

  out = replaceOnce(
    out,
    "const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;",
    "const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;\n" + RUNTIME_HELPERS,
    "Google service-account env anchor"
  );

  out = replaceOnce(
    out,
    "const DASHBOARD_ACCESS_REQUESTS_HEADERS = ['ID', 'Requested At', 'Name', 'Email', 'Telegram', 'Source', 'Status', 'Code ID', 'Reviewed At'];",
    "const DASHBOARD_ACCESS_REQUESTS_HEADERS = ['ID', 'Requested At', 'Name', 'Email', 'Telegram', 'Source', 'Status', 'Code ID', 'Reviewed At', 'Verification Token Hash', 'Verification Expires At', 'Verified At'];",
    "dashboard access request headers"
  );

  out = replaceOnce(
    out,
    "range: `'${DASHBOARD_ACCESS_REQUESTS_SHEET}'!A:I`,",
    "range: `'${DASHBOARD_ACCESS_REQUESTS_SHEET}'!A:L`,",
    "dashboard access request append range"
  );

  out = replaceOnce(
    out,
    "        request.status,\n        '',\n        '',\n      ]],",
    "        request.status,\n        '',\n        '',\n        request.verification_token_hash || '',\n        request.verification_expires_at || '',\n        request.verified_at || '',\n      ]],",
    "dashboard access request append values"
  );

  out = replaceOnce(
    out,
    "    reviewed_at: String(row[8] || ''),\n    row_number: rowNumber,",
    "    reviewed_at: String(row[8] || ''),\n    verification_token_hash: String(row[9] || ''),\n    verification_expires_at: String(row[10] || ''),\n    verified_at: String(row[11] || ''),\n    row_number: rowNumber,",
    "dashboard access request parser"
  );

  out = replaceOnce(
    out,
    "readSheet(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, 'A:I'),",
    "readSheet(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, 'A:L'),",
    "dashboard access request admin read range"
  );

  out = replaceBetween(
    out,
    "async function updateDashboardAccessRequest(request, fields = {}) {",
    "async function createDashboardViewerCode(",
    UPDATED_REQUEST_FUNCTION,
    "dashboard access request updater"
  );

  out = replaceOnce(
    out,
    "        <form class=\"strategy-form\" method=\"POST\" action=\"/password-request\">",
    "        <form class=\"strategy-form\" method=\"POST\" action=\"/password-request\">\n          <script src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\" async defer></script>\n          <div class=\"cf-turnstile\" data-sitekey=\"${escapeHtml(TURNSTILE_SITE_KEY)}\" data-action=\"dashboard_access\"></div>",
    "public dashboard access form"
  );

  out = replaceOnce(
    out,
    "      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/reject\" onsubmit=\"return confirm('Reject this dashboard access request?')\"><button class=\"table-action\" type=\"submit\">Reject</button></form>",
    "      <form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/reject\" onsubmit=\"return confirm('Reject this dashboard access request?')\"><button class=\"table-action\" type=\"submit\">Reject</button></form>\n      ${request.code_id ? '' : `<form method=\"post\" action=\"/admin/access/requests/${encodeURIComponent(request.id)}/delete\" onsubmit=\"return confirm('Permanently delete this dashboard access request?\\nThis cannot be undone.')\"><button class=\"table-action access-delete\" type=\"submit\">Delete</button></form>`}",
    "pending access Reject control"
  );

  out = replaceOnce(
    out,
    "    .access-disable { color:var(--red); }",
    "    .access-disable { color:var(--red); }\n    .access-delete { color:var(--red); border-color:#efc5c8; background:#fff5f5; }\n    .access-row-actions .table-action { white-space:nowrap; }\n    @media(max-width:900px){ .access-row-actions { min-width:280px; justify-content:flex-start; } }",
    "dashboard access admin action styles"
  );

  out = replaceBetween(
    out,
    "app.post('/password-request', async (req, res) => {",
    "app.post('/strategy-review', async (req, res) => {",
    PUBLIC_ROUTES,
    "public password request route"
  );

  out = replaceOnce(
    out,
    "app.post('/admin/access/codes/create', async (req, res) => {",
    DELETE_ROUTE + "app.post('/admin/access/codes/create', async (req, res) => {",
    "admin access code creation route anchor"
  );

  return out;
}

function installAppSourceTransform() {
  const originalJsLoader = Module._extensions[".js"];
  if (originalJsLoader.__vixaleDashboardAccessSecurityWrapped) return;

  function secureJsLoader(module, filename) {
    if (path.resolve(filename) !== APP_PATH) return originalJsLoader(module, filename);
    const source = fs.readFileSync(filename, "utf8");
    const transformed = transformAppSource(source);
    return module._compile(transformed, filename);
  }

  Object.defineProperty(secureJsLoader, "__vixaleDashboardAccessSecurityWrapped", { value: true });
  Module._extensions[".js"] = secureJsLoader;
}

if (require.main !== module) installAppSourceTransform();

module.exports = {
  TURNSTILE_ACTION,
  VERIFY_TOKEN_BYTES,
  VERIFY_TOKEN_RE,
  IP_LIMIT,
  IP_WINDOW_MS,
  EMAIL_LIMIT,
  EMAIL_WINDOW_MS,
  RATE_MAP_MAX_KEYS,
  normalizeEmail,
  generateVerificationToken,
  isVerificationTokenFormatValid,
  hashVerificationToken,
  consumeRateLimit,
  verifyTurnstileToken,
  transformAppSource,
  installAppSourceTransform,
};
