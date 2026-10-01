"use strict";

const HEALTH_HELPERS = String.raw`
const dashboardAccessHealthState = {
  started_at: new Date().toISOString(),
  last_request_at: '',
  last_verified_at: '',
  last_failure: null,
  last_test: null,
  sheet: { last_ok_at: '', last_error_at: '', last_error: '' },
  verification_email: { last_ok_at: '', last_error_at: '', last_error: '' },
  owner_notification: { last_ok_at: '', last_error_at: '', last_error: '' },
};
const dashboardAccessHealthAlertAt = new Map();
const DASHBOARD_ACCESS_HEALTH_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

function dashboardAccessHealthErrorText(error) {
  const value = error && error.message ? error.message : error;
  return String(value || 'Unknown error').slice(0, 240);
}

function dashboardAccessHealthRecord(component, ok, detail = '') {
  const now = new Date().toISOString();
  if (component === 'request') {
    dashboardAccessHealthState.last_request_at = now;
    return now;
  }
  if (component === 'verified') {
    dashboardAccessHealthState.last_verified_at = now;
    return now;
  }
  const target = dashboardAccessHealthState[component];
  if (!target) return now;
  if (ok) {
    target.last_ok_at = now;
    target.last_error = '';
  } else {
    target.last_error_at = now;
    target.last_error = dashboardAccessHealthErrorText(detail);
    dashboardAccessHealthState.last_failure = {
      component,
      at: now,
      message: target.last_error,
    };
  }
  return now;
}

function dashboardAccessHealthComponentStatus(component, configured) {
  if (!configured) return 'NOT CONFIGURED';
  const state = dashboardAccessHealthState[component] || {};
  const okAt = Date.parse(state.last_ok_at || '') || 0;
  const errorAt = Date.parse(state.last_error_at || '') || 0;
  if (errorAt > okAt) return 'ERROR';
  if (okAt > 0) return 'OPERATIONAL';
  return 'READY';
}

function dashboardAccessHealthSnapshot() {
  const config = {
    access_route: true,
    turnstile: Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY),
    google_sheets: Boolean(GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_JSON),
    resend: Boolean(RESEND_API_KEY),
    owner_email: Boolean(DASHBOARD_REQUEST_EMAIL),
  };
  const components = {
    access_form: 'OPERATIONAL',
    turnstile: config.turnstile ? 'READY' : 'NOT CONFIGURED',
    google_sheets: dashboardAccessHealthComponentStatus('sheet', config.google_sheets),
    verification_email: dashboardAccessHealthComponentStatus('verification_email', config.resend),
    owner_notification: dashboardAccessHealthComponentStatus('owner_notification', config.resend && config.owner_email),
  };
  const hasConfigProblem = Object.values(config).some(value => !value);
  const hasRuntimeProblem = Object.values(components).some(value => value === 'ERROR');
  const hasOperationalEvidence = [components.google_sheets, components.verification_email, components.owner_notification].some(value => value === 'OPERATIONAL');
  const status = hasConfigProblem || hasRuntimeProblem ? 'ISSUE' : (hasOperationalEvidence ? 'OPERATIONAL' : 'READY');
  const successfulTimes = [
    dashboardAccessHealthState.sheet.last_ok_at,
    dashboardAccessHealthState.verification_email.last_ok_at,
    dashboardAccessHealthState.owner_notification.last_ok_at,
    dashboardAccessHealthState.last_verified_at,
    dashboardAccessHealthState.last_test && dashboardAccessHealthState.last_test.ok ? dashboardAccessHealthState.last_test.at : '',
  ].filter(Boolean).sort();
  return {
    status,
    started_at: dashboardAccessHealthState.started_at,
    last_verified_at: successfulTimes.length ? successfulTimes[successfulTimes.length - 1] : '',
    last_request_at: dashboardAccessHealthState.last_request_at,
    last_failure: dashboardAccessHealthState.last_failure,
    last_test: dashboardAccessHealthState.last_test,
    config,
    components,
    component_state: {
      google_sheets: { ...dashboardAccessHealthState.sheet },
      verification_email: { ...dashboardAccessHealthState.verification_email },
      owner_notification: { ...dashboardAccessHealthState.owner_notification },
    },
  };
}

function dashboardAccessHealthAlert(component) {
  if (!ADMIN_CHAT_ID) return;
  const now = Date.now();
  const lastAt = dashboardAccessHealthAlertAt.get(component) || 0;
  if (now - lastAt < DASHBOARD_ACCESS_HEALTH_ALERT_COOLDOWN_MS) return;
  dashboardAccessHealthAlertAt.set(component, now);
  Promise.resolve(sendAdminTelegram([
    '⚠️ <b>Dashboard Access Health Alert</b>',
    '',
    'Component: <b>' + escapeHtml(String(component || 'unknown')) + '</b>',
    'The access workflow recorded a failure. Open /admin/live#dashboard-access for details.',
  ].join('\n'))).catch(error => console.error('Dashboard access health Telegram alert failed:', error));
}

function dashboardAccessHealthFailure(component, error) {
  dashboardAccessHealthRecord(component, false, error);
  dashboardAccessHealthAlert(component);
}
`;

const HEALTH_ROUTES = String.raw`
app.get('/admin/access/health', async (req, res) => {
  if (!adminAccessRequestAllowed(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(dashboardAccessHealthSnapshot());
});

app.post('/admin/access/health/test', async (req, res) => {
  if (!adminAccessRequestAllowed(req, res)) return;
  const testAt = new Date().toISOString();
  const result = { at: testAt, ok: false, sheet_ok: false, email_accepted: false, email_id: '' };
  try {
    const sheets = await getSheetsClient();
    if (!sheets) throw new Error('Google Sheets is not configured.');
    await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "'Dashboard Access Requests'!A1:L1",
    });
    result.sheet_ok = true;
    dashboardAccessHealthRecord('sheet', true, 'Synthetic health test read succeeded');

    if (!DASHBOARD_REQUEST_EMAIL) throw new Error('DASHBOARD_REQUEST_EMAIL is not configured.');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
    const emailResult = await sendEmail({
      to: DASHBOARD_REQUEST_EMAIL,
      subject: '[SYSTEM TEST] Vixale Dashboard Access Health Check',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Vixale Dashboard Access — System Test</h2><p>This is an owner-initiated health check from <strong>/admin/live</strong>.</p><p>No customer request was created and no action is required.</p><p>Timestamp: ' + escapeHtml(testAt) + '</p></div>',
      text: 'Vixale Dashboard Access — SYSTEM TEST\n\nThis is an owner-initiated health check from /admin/live. No customer request was created and no action is required.\nTimestamp: ' + testAt,
    });
    result.email_accepted = true;
    result.email_id = String(emailResult && emailResult.id || '');
    result.ok = true;
    dashboardAccessHealthRecord('verification_email', true, 'Synthetic health email accepted by Resend');
    dashboardAccessHealthRecord('owner_notification', true, 'Synthetic owner email accepted by Resend');
    dashboardAccessHealthState.last_test = result;
    return res.redirect('/admin/live#dashboard-access');
  } catch (error) {
    const message = dashboardAccessHealthErrorText(error);
    if (!result.sheet_ok) dashboardAccessHealthFailure('sheet', error);
    else dashboardAccessHealthFailure('verification_email', error);
    result.error = message;
    dashboardAccessHealthState.last_test = result;
    console.error('Dashboard access synthetic health test failed:', error);
    return res.redirect('/admin/live#dashboard-access');
  }
});

`;

module.exports = { HEALTH_HELPERS, HEALTH_ROUTES };
