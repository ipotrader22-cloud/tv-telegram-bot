"use strict";

const ACCESS_HELPERS = String.raw`
// VIXALE_DASHBOARD_ACCESS_SECURITY_PATCH
const dashboardAccessIpLimiter = dashboardAccessSecurity.createBoundedRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000, maxKeys: 5000 });
const dashboardAccessEmailLimiter = dashboardAccessSecurity.createBoundedRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000, maxKeys: 5000 });
const dashboardAccessUsedTurnstileTokens = new Map();
const dashboardAccessVerificationInFlight = new Set();
const DASHBOARD_ACCESS_VERIFICATION_TTL_MS = 60 * 60 * 1000;
const DASHBOARD_ACCESS_USED_TURNSTILE_TTL_MS = 15 * 60 * 1000;
const DASHBOARD_ACCESS_USED_TURNSTILE_MAX = 5000;

function pruneUsedTurnstileTokenHashes(nowMs = Date.now()) {
  for (const [hash, expiresAt] of dashboardAccessUsedTurnstileTokens) {
    if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) dashboardAccessUsedTurnstileTokens.delete(hash);
  }
  while (dashboardAccessUsedTurnstileTokens.size > DASHBOARD_ACCESS_USED_TURNSTILE_MAX) {
    const oldest = dashboardAccessUsedTurnstileTokens.keys().next().value;
    if (oldest === undefined) break;
    dashboardAccessUsedTurnstileTokens.delete(oldest);
  }
}

function dashboardAccessRateLimited(res, lang, retryAfterSeconds) {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(Number(retryAfterSeconds) || 1))));
  return res.status(429).send(lang === 'ru'
    ? 'Слишком много попыток. Пожалуйста, попробуйте позже.'
    : 'Too many request attempts. Please try again later.');
}

function dashboardAccessUnavailable(res, lang) {
  return res.status(503).send(lang === 'ru'
    ? 'Проверка заявки временно недоступна. Пожалуйста, попробуйте позже.'
    : 'Dashboard request verification is temporarily unavailable. Please try again later.');
}

async function ensureDashboardAccessVerificationHeaders(sheets) {
  await ensureSheetWithHeaders(sheets, DASHBOARD_ACCESS_REQUESTS_SHEET, DASHBOARD_ACCESS_REQUESTS_HEADERS);
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "'Dashboard Access Requests'!J1:L1",
    valueInputOption: 'RAW',
    requestBody: { values: [['Verification Token Hash', 'Verification Expires At', 'Verified At']] },
  });
}

async function findDashboardAccessRequestById(id) {
  const access = await dashboardAccessAdminData();
  return access.requests.find(item => item.id === String(id || '')) || null;
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
      console.error('Dashboard access verified owner email failed:', emailError);
    }
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
        'Status: <b>Pending manual review · email verified</b>',
      ].filter(Boolean).join('\n');
      await sendAdminTelegram(telegramMessage);
      telegramNotified = true;
    } catch (telegramError) {
      console.error('Dashboard access verified Telegram notification failed:', telegramError);
    }
  }
  return { emailed, telegramNotified };
}
`;

const NEW_PASSWORD_AND_VERIFY_ROUTES = String.raw`app.post('/password-request', async (req, res) => {
  const body = req.body || {};
  const lang = String(body.lang || 'en').toLowerCase() === 'ru' ? 'ru' : 'en';

  try {
    if (body.website) {
      return res.status(200).send(renderAccessRequestReceivedHtml('', '', lang));
    }

    const ipLimit = dashboardAccessIpLimiter.consume(req.ip || 'unknown');
    if (!ipLimit.allowed) return dashboardAccessRateLimited(res, lang, ipLimit.retryAfterSeconds);

    const name = String(body.name || '').trim().slice(0, 100);
    const email = dashboardAccessSecurity.normalizeAccessEmail(body.email);
    const telegram = String(body.telegram || '').trim().slice(0, 100);
    const source = String(body.source || 'Website').trim().slice(0, 120) || 'Website';

    if (!isValidEmail(email)) {
      return res.status(400).send(lang === 'ru' ? 'Введите корректный email.' : 'Please enter a valid email address.');
    }

    const emailLimit = dashboardAccessEmailLimiter.consume(email);
    if (!emailLimit.allowed) return dashboardAccessRateLimited(res, lang, emailLimit.retryAfterSeconds);

    if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) return dashboardAccessUnavailable(res, lang);
    const turnstileToken = String(body['cf-turnstile-response'] || '').trim();
    if (!turnstileToken) {
      return res.status(400).send(lang === 'ru' ? 'Подтвердите, что вы не робот.' : 'Please complete the verification challenge.');
    }

    pruneUsedTurnstileTokenHashes();
    const turnstileTokenHash = dashboardAccessSecurity.hashToken(turnstileToken);
    if (dashboardAccessUsedTurnstileTokens.has(turnstileTokenHash)) {
      return res.status(400).send(lang === 'ru' ? 'Проверка истекла или уже использована. Обновите страницу и попробуйте снова.' : 'Verification expired or was already used. Refresh the page and try again.');
    }

    const turnstile = await dashboardAccessSecurity.verifyTurnstileToken({
      token: turnstileToken,
      secretKey: TURNSTILE_SECRET_KEY,
      remoteIp: req.ip || '',
    });
    if (!turnstile.ok) {
      return res.status(400).send(lang === 'ru' ? 'Не удалось подтвердить проверку. Обновите страницу и попробуйте снова.' : 'Verification could not be confirmed. Refresh the page and try again.');
    }
    dashboardAccessUsedTurnstileTokens.set(turnstileTokenHash, Date.now() + DASHBOARD_ACCESS_USED_TURNSTILE_TTL_MS);
    pruneUsedTurnstileTokenHashes();

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = dashboardAccessSecurity.hashToken(verificationToken);
    const requestedAt = new Date();
    const request = {
      id: crypto.randomUUID(),
      requested_at: requestedAt.toISOString(),
      name,
      email,
      telegram,
      source,
      status: 'Awaiting Verification',
      verification_token_hash: verificationTokenHash,
      verification_expires_at: new Date(requestedAt.getTime() + DASHBOARD_ACCESS_VERIFICATION_TTL_MS).toISOString(),
      verified_at: '',
    };

    let stored = false;
    try {
      stored = await logDashboardAccessRequest(request);
    } catch (sheetError) {
      console.error('Dashboard access request sheet logging failed:', sheetError);
    }
    if (!stored) return dashboardAccessUnavailable(res, lang);

    const verificationUrl = SITE_BASE_URL + '/dashboard-access/verify?token=' + encodeURIComponent(verificationToken);
    try {
      if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
      await sendEmail({
        to: email,
        subject: 'Confirm your Vixale dashboard request',
        html: dashboardAccessSecurity.verificationEmailHtml({ name, verificationUrl }),
        text: dashboardAccessSecurity.verificationEmailText({ verificationUrl }),
      });
    } catch (emailError) {
      console.error('Dashboard access verification email failed:', emailError);
      try {
        const storedRequest = await findDashboardAccessRequestById(request.id);
        if (storedRequest) {
          await updateDashboardAccessRequest(storedRequest, {
            status: 'Verification Email Failed',
            verification_token_hash: '',
            verification_expires_at: '',
          });
        }
      } catch (statusError) {
        console.error('Dashboard access verification failure status update failed:', statusError);
      }
      return dashboardAccessUnavailable(res, lang);
    }

    return res.status(200).send(dashboardAccessSecurity.verificationSentHtml({ email, name, lang }));
  } catch (err) {
    console.error('Dashboard access request form error:', err);
    return res.status(500).send(lang === 'ru'
      ? 'Сейчас не удалось отправить заявку. Попробуйте еще раз позже.'
      : 'Dashboard access request could not be sent right now. Please try again later.');
  }
});

app.get('/dashboard-access/verify', async (req, res) => {
  const lang = isRussianRequest(req) ? 'ru' : 'en';
  const token = String(req.query.token || '').trim();
  if (!dashboardAccessSecurity.isVerificationTokenFormat(token)) {
    return res.status(400).send(lang === 'ru' ? 'Ссылка подтверждения недействительна.' : 'This verification link is invalid.');
  }

  const tokenHash = dashboardAccessSecurity.hashToken(token);
  if (dashboardAccessVerificationInFlight.has(tokenHash)) {
    return res.status(409).send(lang === 'ru' ? 'Подтверждение уже обрабатывается.' : 'This verification is already being processed.');
  }
  dashboardAccessVerificationInFlight.add(tokenHash);

  try {
    const access = await dashboardAccessAdminData();
    const request = access.requests.find(item =>
      String(item.status || '').toUpperCase() === 'AWAITING VERIFICATION' &&
      safeSecretEquals(String(item.verification_token_hash || ''), tokenHash)
    );
    if (!request) {
      return res.status(400).send(lang === 'ru' ? 'Ссылка подтверждения недействительна или уже использована.' : 'This verification link is invalid or has already been used.');
    }

    const expiresAt = Date.parse(request.verification_expires_at || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return res.status(400).send(lang === 'ru' ? 'Срок действия ссылки подтверждения истёк.' : 'This verification link has expired.');
    }

    const verifiedAt = new Date().toISOString();
    await updateDashboardAccessRequest(request, {
      status: 'Pending',
      verification_token_hash: '',
      verification_expires_at: '',
      verified_at: verifiedAt,
    });

    const verifiedRequest = Object.assign({}, request, {
      status: 'Pending',
      verification_token_hash: '',
      verification_expires_at: '',
      verified_at: verifiedAt,
    });
    await notifyDashboardAccessOwner(verifiedRequest);
    return res.status(200).send(dashboardAccessSecurity.verifiedHtml({ lang }));
  } catch (error) {
    console.error('Dashboard access email verification error:', error);
    return res.status(500).send(lang === 'ru' ? 'Не удалось подтвердить email. Попробуйте позже.' : 'Email verification could not be completed right now. Please try again later.');
  } finally {
    dashboardAccessVerificationInFlight.delete(tokenHash);
  }
});`;

const DELETE_ROUTE = String.raw`app.post('/admin/access/requests/:id/delete', async (req, res) => {
  try {
    if (!adminAccessRequestAllowed(req, res)) return;
    const access = await dashboardAccessAdminData();
    const request = access.requests.find(item => item.id === String(req.params.id || ''));
    if (!request) return res.status(404).send('Dashboard access request not found.');
    const linkedCode = Boolean(request.code_id) || access.codes.some(code => String(code.source_request_id || '') === request.id);
    if (linkedCode) return res.status(409).send('This request is linked to a viewer code and cannot be deleted here.');
    const sheets = await getSheetsClient();
    if (!sheets) return res.status(503).send('Google Sheets is not configured.');
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
    return res.redirect('/admin/live#dashboard-access');
  } catch (error) {
    console.error('Dashboard access request delete error:', error);
    return res.status(500).send('Unable to delete dashboard access request.');
  }
});

`;

module.exports = { ACCESS_HELPERS, NEW_PASSWORD_AND_VERIFY_ROUTES, DELETE_ROUTE };
