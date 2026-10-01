"use strict";

const HEALTH_HELPERS = String.raw`
// VIXALE_DASHBOARD_ACCESS_HEALTH_MONITOR
const dashboardAccessHealthState = {
  started_at: new Date().toISOString(),
  last_checked_at: '',
  last_request_at: '',
  last_failure_at: '',
  last_failure_component: '',
  last_failure_message: '',
  components: {
    turnstile: { ok: null, at: '', message: 'No request observed since process start.' },
    google_sheets: { ok: null, at: '', message: 'Not checked yet.' },
    verification_email: { ok: null, at: '', message: 'No request observed since process start.' },
    owner_notification: { ok: null, at: '', message: 'No verified request observed since process start.' },
    synthetic_email: { ok: null, at: '', message: 'Not run yet.' },
  },
};
let dashboardAccessHealthLastSyntheticTestAt = 0;

function dashboardAccessHealthMessage(error, fallback = '') {
  if (!error) return fallback;
  return String(error && error.message ? error.message : error).slice(0, 300);
}

function dashboardAccessHealthRecord(component, ok, message = '') {
  const at = new Date().toISOString();
  if (component === 'request') {
    dashboardAccessHealthState.last_request_at = at;
    return;
  }
  if (!dashboardAccessHealthState.components[component]) return;
  dashboardAccessHealthState.components[component] = { ok: Boolean(ok), at, message: String(message || '').slice(0, 300) };
  if (!ok) {
    dashboardAccessHealthState.last_failure_at = at;
    dashboardAccessHealthState.last_failure_component = component;
    dashboardAccessHealthState.last_failure_message = String(message || 'Health check failed.').slice(0, 300);
  }
}

function dashboardAccessHealthConfig() {
  return {
    turnstile: Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY),
    resend: Boolean(RESEND_API_KEY),
    owner_notification_email: Boolean(DASHBOARD_REQUEST_EMAIL),
    google_sheet_id: Boolean(GOOGLE_SHEET_ID),
  };
}

function dashboardAccessHealthOverall(config, components) {
  const configOk = Object.values(config).every(Boolean);
  if (!configOk || components.google_sheets.ok === false || components.verification_email.ok === false || components.owner_notification.ok === false || components.synthetic_email.ok === false) {
    return 'needs_attention';
  }
  if (components.google_sheets.ok !== true) return 'checking';
  return 'operational';
}

function dashboardAccessHealthSnapshot() {
  const config = dashboardAccessHealthConfig();
  const components = JSON.parse(JSON.stringify(dashboardAccessHealthState.components));
  return {
    overall: dashboardAccessHealthOverall(config, components),
    started_at: dashboardAccessHealthState.started_at,
    last_checked_at: dashboardAccessHealthState.last_checked_at,
    last_request_at: dashboardAccessHealthState.last_request_at,
    last_failure_at: dashboardAccessHealthState.last_failure_at,
    last_failure_component: dashboardAccessHealthState.last_failure_component,
    last_failure_message: dashboardAccessHealthState.last_failure_message,
    config,
    components,
  };
}

async function dashboardAccessHealthProbe() {
  dashboardAccessHealthState.last_checked_at = new Date().toISOString();
  try {
    const sheets = await getSheetsClient();
    if (!sheets || !GOOGLE_SHEET_ID) {
      dashboardAccessHealthRecord('google_sheets', false, 'Google Sheets client or sheet ID is not configured.');
    } else {
      await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: "'Dashboard Access Requests'!A1:L1",
      });
      dashboardAccessHealthRecord('google_sheets', true, 'Read probe passed.');
    }
  } catch (error) {
    dashboardAccessHealthRecord('google_sheets', false, dashboardAccessHealthMessage(error, 'Google Sheets read probe failed.'));
  }
  return dashboardAccessHealthSnapshot();
}
`;

const HEALTH_ROUTES = String.raw`
app.get('/health/dashboard-access', async (req, res) => {
  try {
    const health = await dashboardAccessHealthProbe();
    const configOk = Object.values(health.config).every(Boolean);
    const ok = configOk && health.components.google_sheets.ok === true;
    return res.status(ok ? 200 : 503).json({
      ok,
      service: 'dashboard-access',
      status: ok ? 'operational' : 'degraded',
      checked_at: health.last_checked_at,
    });
  } catch (error) {
    console.error('Dashboard access public health probe failed:', error);
    return res.status(503).json({ ok: false, service: 'dashboard-access', status: 'degraded' });
  }
});

app.get('/admin/dashboard-access-health', async (req, res) => {
  try {
    if (!adminAccessRequestAllowed(req, res)) return;
    const health = await dashboardAccessHealthProbe();
    return res.status(200).json(health);
  } catch (error) {
    console.error('Dashboard access admin health read failed:', error);
    return res.status(500).json({ overall: 'needs_attention', error: 'Unable to read dashboard access health.' });
  }
});

app.post('/admin/dashboard-access-health/test-email', async (req, res) => {
  try {
    if (!adminAccessRequestAllowed(req, res)) return;
    const now = Date.now();
    const retryAfterMs = 60 * 1000 - (now - dashboardAccessHealthLastSyntheticTestAt);
    if (retryAfterMs > 0) {
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({ ok: false, error: 'Please wait before running another email test.' });
    }
    dashboardAccessHealthLastSyntheticTestAt = now;
    if (!RESEND_API_KEY || !DASHBOARD_REQUEST_EMAIL) {
      dashboardAccessHealthRecord('synthetic_email', false, 'Resend API key or dashboard request email is not configured.');
      return res.status(503).json({ ok: false, error: 'Email provider configuration is incomplete.' });
    }

    const sentAt = new Date().toISOString();
    try {
      const result = await sendEmail({
        to: DASHBOARD_REQUEST_EMAIL,
        subject: '[SYSTEM TEST] Vixale Dashboard Access Health Check',
        html: '<div style="font-family:Arial,sans-serif;line-height:1.55"><h2>Dashboard Access Health Check</h2><p>This is a system test from the Vixale admin health monitor.</p><p>No customer request was created and no action is required.</p><p>Provider accepted at: <strong>' + escapeHtml(sentAt) + '</strong></p></div>',
        text: 'Vixale Dashboard Access Health Check\n\nThis is a system test from the admin health monitor. No customer request was created and no action is required.\n\nProvider accepted at: ' + sentAt,
      });
      const providerId = result && (result.id || (result.data && result.data.id)) ? String(result.id || result.data.id) : '';
      dashboardAccessHealthRecord('synthetic_email', true, providerId ? 'Provider accepted. ID: ' + providerId : 'Provider accepted.');
      return res.status(200).json({ ok: true, status: 'provider_accepted', at: sentAt });
    } catch (error) {
      dashboardAccessHealthRecord('synthetic_email', false, dashboardAccessHealthMessage(error, 'Synthetic email test failed.'));
      console.error('Dashboard access synthetic email test failed:', error);
      return res.status(502).json({ ok: false, error: 'Email provider did not accept the synthetic test.' });
    }
  } catch (error) {
    console.error('Dashboard access synthetic test route failed:', error);
    return res.status(500).json({ ok: false, error: 'Unable to run dashboard access health test.' });
  }
});

`;

module.exports = { HEALTH_HELPERS, HEALTH_ROUTES };
