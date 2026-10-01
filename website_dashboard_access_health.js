"use strict";

const vm = require("vm");
const blocks = require("./lib/dashboard-access-security-source-blocks");

const HEALTH_MARKER = "VIXALE_DASHBOARD_ACCESS_HEALTH_MONITOR";

const HEALTH_HELPERS = String.raw`
// VIXALE_DASHBOARD_ACCESS_HEALTH_MONITOR
const DASHBOARD_ACCESS_HEALTH_INTERVAL_MS = 30 * 60 * 1000;
const DASHBOARD_ACCESS_HEALTH_TEST_EMAIL = 'delivered@resend.dev';
const dashboardAccessHealthState = {
  overall: 'unknown',
  last_checked_at: '',
  last_success_at: '',
  last_failure_at: '',
  last_manual_test_at: '',
  last_alerted_status: '',
  source: 'startup',
  components: {},
  latest_request: null,
  latest_failed_request: null,
};
let dashboardAccessHealthRunning = null;

function dashboardAccessHealthComponent(ok, state, detail, checkedAt) {
  return { ok: ok === true ? true : (ok === false ? false : null), state: String(state || ''), detail: String(detail || ''), checked_at: checkedAt || new Date().toISOString() };
}

function dashboardAccessHealthTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dashboardAccessHealthRequestSummary(request) {
  if (!request) return null;
  return {
    id: String(request.id || ''),
    requested_at: String(request.requested_at || ''),
    email: String(request.email || ''),
    name: String(request.name || ''),
    status: String(request.status || ''),
    source: String(request.source || ''),
  };
}

function dashboardAccessHealthSnapshot() {
  return JSON.parse(JSON.stringify(dashboardAccessHealthState));
}

async function dashboardAccessHealthResendList() {
  if (!RESEND_API_KEY || typeof fetch !== 'function') return { ok: false, available: false, emails: [], detail: 'Resend status API is unavailable.' };
  try {
    const response = await fetch('https://api.resend.com/emails?limit=50', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, available: false, emails: [], detail: 'Resend status API returned HTTP ' + response.status + '.' };
    return { ok: true, available: true, emails: Array.isArray(payload && payload.data) ? payload.data : [], detail: 'Resend status API reachable.' };
  } catch (error) {
    return { ok: false, available: false, emails: [], detail: 'Resend status API check failed: ' + String(error && error.message || error) };
  }
}

function dashboardAccessHealthEmailComponent(emails, matcher, emptyLabel, checkedAt) {
  const email = (Array.isArray(emails) ? emails : []).find(item => matcher(String(item && item.subject || '')));
  if (!email) return dashboardAccessHealthComponent(null, 'No send recorded', emptyLabel, checkedAt);
  const event = String(email.last_event || 'unknown').toLowerCase();
  const ok = event === 'delivered' ? true : (['bounced', 'complained', 'failed', 'delivery_delayed'].includes(event) ? false : null);
  return dashboardAccessHealthComponent(ok, event || 'unknown', String(email.created_at || ''), checkedAt);
}

async function dashboardAccessHealthSyntheticEmail(checkedAt) {
  if (!RESEND_API_KEY) return dashboardAccessHealthComponent(false, 'Not configured', 'RESEND_API_KEY is missing.', checkedAt);
  const subject = '[SYSTEM TEST] Vixale dashboard access health ' + checkedAt;
  try {
    await sendEmail({
      to: DASHBOARD_ACCESS_HEALTH_TEST_EMAIL,
      subject,
      text: 'Synthetic Vixale dashboard access health test. No customer request was created.',
      html: '<p>Synthetic Vixale dashboard access health test. No customer request was created.</p>',
    });
  } catch (error) {
    return dashboardAccessHealthComponent(false, 'Send failed', String(error && error.message || error), checkedAt);
  }

  let lastDetail = 'Resend accepted the synthetic email.';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 750));
    const listed = await dashboardAccessHealthResendList();
    if (!listed.available) return dashboardAccessHealthComponent(true, 'Accepted', lastDetail + ' Delivery status read is unavailable.', checkedAt);
    const testEmail = listed.emails.find(item => String(item && item.subject || '') === subject);
    if (!testEmail) continue;
    const event = String(testEmail.last_event || 'sent').toLowerCase();
    lastDetail = 'Synthetic recipient: ' + DASHBOARD_ACCESS_HEALTH_TEST_EMAIL + '; Resend event: ' + event + '.';
    if (event === 'delivered') return dashboardAccessHealthComponent(true, 'Delivered', lastDetail, checkedAt);
    if (['bounced', 'complained', 'failed'].includes(event)) return dashboardAccessHealthComponent(false, event, lastDetail, checkedAt);
  }
  return dashboardAccessHealthComponent(true, 'Accepted', lastDetail, checkedAt);
}

async function dashboardAccessHealthAlert(kind, snapshot) {
  const isRecovery = kind === 'recovered';
  const subject = isRecovery ? 'Vixale Dashboard Access recovered' : 'Vixale Dashboard Access health alert';
  const badComponents = Object.entries(snapshot.components || {}).filter(([, value]) => value && value.ok === false).map(([key]) => key);
  const text = [
    isRecovery ? 'Dashboard Access health is operational again.' : 'Dashboard Access health check detected a problem.',
    'Checked: ' + String(snapshot.last_checked_at || ''),
    'Status: ' + String(snapshot.overall || ''),
    badComponents.length ? 'Failed components: ' + badComponents.join(', ') : '',
    'Open /admin/live for details.',
  ].filter(Boolean).join('\n');

  if (DASHBOARD_REQUEST_EMAIL && RESEND_API_KEY && (snapshot.components.resend && snapshot.components.resend.ok !== false)) {
    try { await sendEmail({ to: DASHBOARD_REQUEST_EMAIL, subject, text, html: '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>' }); } catch (error) { console.error('Dashboard access health email alert failed:', error); }
  }
  if (ADMIN_CHAT_ID) {
    try { await sendAdminTelegram((isRecovery ? '✅ <b>Dashboard Access recovered</b>' : '🚨 <b>Dashboard Access health alert</b>') + '\n' + escapeHtml(text)); } catch (error) { console.error('Dashboard access health Telegram alert failed:', error); }
  }
}

async function runDashboardAccessHealthCheck(options = {}) {
  if (dashboardAccessHealthRunning) return dashboardAccessHealthRunning;
  dashboardAccessHealthRunning = (async () => {
    const checkedAt = new Date().toISOString();
    const source = String(options.source || 'scheduled');
    const sendSyntheticEmail = options.sendSyntheticEmail === true;
    const previousOverall = dashboardAccessHealthState.overall;
    const components = {};

    components.accessForm = dashboardAccessHealthComponent(true, 'Operational', 'Dashboard access request route is loaded.', checkedAt);

    if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) {
      components.turnstile = dashboardAccessHealthComponent(false, 'Not configured', 'TURNSTILE_SITE_KEY or TURNSTILE_SECRET_KEY is missing.', checkedAt);
    } else {
      const turnstileProbe = await dashboardAccessSecurity.verifyTurnstileToken({ token: 'vixale-health-check-invalid-token', secretKey: TURNSTILE_SECRET_KEY });
      const errors = Array.isArray(turnstileProbe && turnstileProbe.data && turnstileProbe.data['error-codes']) ? turnstileProbe.data['error-codes'].map(String) : [];
      if (!turnstileProbe || !turnstileProbe.data) {
        components.turnstile = dashboardAccessHealthComponent(false, 'Unreachable', 'Cloudflare Turnstile siteverify did not return a response.', checkedAt);
      } else if (errors.includes('invalid-input-secret') || errors.includes('missing-input-secret')) {
        components.turnstile = dashboardAccessHealthComponent(false, 'Invalid secret', 'Cloudflare rejected the configured Turnstile secret.', checkedAt);
      } else {
        components.turnstile = dashboardAccessHealthComponent(true, 'Operational', 'Cloudflare Turnstile siteverify is reachable and the configured secret was accepted.', checkedAt);
      }
    }

    let accessData = null;
    try {
      const sheets = await getSheetsClient();
      if (!sheets || !GOOGLE_SHEET_ID) throw new Error('Google Sheets is not configured.');
      await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: "'Dashboard Access Requests'!A1:L2" });
      components.googleSheets = dashboardAccessHealthComponent(true, 'Operational', 'Dashboard Access Requests sheet is readable.', checkedAt);
      accessData = await dashboardAccessAdminData();
    } catch (error) {
      components.googleSheets = dashboardAccessHealthComponent(false, 'Read failed', String(error && error.message || error), checkedAt);
    }

    const requests = accessData && Array.isArray(accessData.requests) ? accessData.requests.slice() : [];
    requests.sort((a, b) => dashboardAccessHealthTime(b.requested_at) - dashboardAccessHealthTime(a.requested_at));
    dashboardAccessHealthState.latest_request = dashboardAccessHealthRequestSummary(requests[0] || null);
    dashboardAccessHealthState.latest_failed_request = dashboardAccessHealthRequestSummary(requests.find(item => /failed|error/i.test(String(item.status || ''))) || null);

    if (!DASHBOARD_REQUEST_EMAIL) {
      components.ownerNotification = dashboardAccessHealthComponent(false, 'Not configured', 'Dashboard owner notification email is missing.', checkedAt);
    } else {
      components.ownerNotification = dashboardAccessHealthComponent(true, 'Configured', 'Owner notification destination is configured.', checkedAt);
    }

    if (sendSyntheticEmail) {
      components.resend = await dashboardAccessHealthSyntheticEmail(checkedAt);
    } else if (dashboardAccessHealthState.components.resend && dashboardAccessHealthState.components.resend.checked_at) {
      components.resend = dashboardAccessHealthState.components.resend;
    } else if (RESEND_API_KEY) {
      components.resend = dashboardAccessHealthComponent(true, 'Configured', 'RESEND_API_KEY is configured; next scheduled or manual synthetic test will verify sending.', checkedAt);
    } else {
      components.resend = dashboardAccessHealthComponent(false, 'Not configured', 'RESEND_API_KEY is missing.', checkedAt);
    }

    const resendList = await dashboardAccessHealthResendList();
    if (resendList.available) {
      components.verificationEmail = dashboardAccessHealthEmailComponent(resendList.emails, subject => subject === 'Confirm your Vixale dashboard request', 'No verification email found in the recent Resend history.', checkedAt);
      const ownerComponent = dashboardAccessHealthEmailComponent(resendList.emails, subject => subject.startsWith('New Vixale Dashboard Access Request'), 'No owner notification found in the recent Resend history.', checkedAt);
      components.ownerNotification = Object.assign({}, components.ownerNotification, {
        state: ownerComponent.state === 'No send recorded' ? components.ownerNotification.state : ownerComponent.state,
        detail: ownerComponent.state === 'No send recorded' ? components.ownerNotification.detail : ownerComponent.detail,
      });
    } else {
      components.verificationEmail = dashboardAccessHealthComponent(null, 'History unavailable', resendList.detail, checkedAt);
    }

    const coreComponents = ['accessForm', 'turnstile', 'googleSheets', 'resend', 'ownerNotification'];
    const overallOk = coreComponents.every(name => components[name] && components[name].ok === true);
    dashboardAccessHealthState.overall = overallOk ? 'operational' : 'error';
    dashboardAccessHealthState.last_checked_at = checkedAt;
    dashboardAccessHealthState.source = source;
    dashboardAccessHealthState.components = components;
    if (source === 'manual') dashboardAccessHealthState.last_manual_test_at = checkedAt;
    if (overallOk) dashboardAccessHealthState.last_success_at = checkedAt;
    else dashboardAccessHealthState.last_failure_at = checkedAt;

    const snapshot = dashboardAccessHealthSnapshot();
    if (!overallOk && dashboardAccessHealthState.last_alerted_status !== 'error') {
      dashboardAccessHealthState.last_alerted_status = 'error';
      await dashboardAccessHealthAlert('error', snapshot);
    } else if (overallOk && dashboardAccessHealthState.last_alerted_status === 'error') {
      dashboardAccessHealthState.last_alerted_status = 'operational';
      await dashboardAccessHealthAlert('recovered', snapshot);
    } else if (overallOk && previousOverall === 'unknown') {
      dashboardAccessHealthState.last_alerted_status = 'operational';
    }

    return dashboardAccessHealthSnapshot();
  })();

  try { return await dashboardAccessHealthRunning; }
  finally { dashboardAccessHealthRunning = null; }
}

function dashboardAccessHealthPanelHtml() {
  return '<div id="dashboard-access-health-monitor" data-vixale-health="1" style="position:fixed;right:18px;bottom:18px;z-index:9999;width:min(430px,calc(100vw - 36px));font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
    '<div style="background:#fff;border:1px solid #dfe8e2;border-radius:18px;box-shadow:0 18px 48px rgba(18,40,29,.16);overflow:hidden">' +
      '<div style="padding:14px 16px;border-bottom:1px solid #edf2ef;display:flex;align-items:center;justify-content:space-between;gap:10px">' +
        '<div><div style="font-size:12px;color:#718078;text-transform:uppercase;letter-spacing:.08em">Dashboard Access System</div><div id="dah-title" style="font-weight:750;font-size:16px;margin-top:2px">Checking…</div></div>' +
        '<span id="dah-dot" style="width:12px;height:12px;border-radius:50%;background:#9aa69f;box-shadow:0 0 0 4px #eef2ef"></span>' +
      '</div>' +
      '<details style="padding:0 16px"><summary style="cursor:pointer;padding:11px 0;font-size:13px;font-weight:650">Health details</summary><div id="dah-components" style="display:grid;gap:7px;padding:0 0 12px"></div></details>' +
      '<div style="padding:11px 16px;border-top:1px solid #edf2ef;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div id="dah-time" style="font-size:11px;color:#718078">Not checked yet</div>' +
        '<button id="dah-run" type="button" style="border:0;border-radius:999px;background:#101613;color:#fff;padding:9px 13px;font-size:12px;font-weight:700;cursor:pointer">Run Test Now</button>' +
      '</div>' +
    '</div>' +
    '<script>(function(){var root=document.getElementById("dashboard-access-health-monitor");if(!root||root.dataset.bound==="1")return;root.dataset.bound="1";var title=document.getElementById("dah-title"),dot=document.getElementById("dah-dot"),list=document.getElementById("dah-components"),time=document.getElementById("dah-time"),button=document.getElementById("dah-run");function esc(v){return String(v==null?"":v).replace(/[&<>\"]/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;"})[c]||c})}function row(label,c){if(!c)return"";var color=c.ok===true?"#138a52":(c.ok===false?"#c23a47":"#7d8982");return "<div style=\\"display:flex;justify-content:space-between;gap:12px;font-size:12px\\"><span style=\\"color:#4f5e56\\">"+esc(label)+"</span><span title=\\""+esc(c.detail||"")+"\\" style=\\"font-weight:700;color:"+color+";text-align:right\\">"+esc(c.state||"")+"</span></div>"}function render(data){var ok=data&&data.overall==="operational";title.textContent=ok?"ALL SYSTEMS OPERATIONAL":"SYSTEM CHECK REQUIRED";title.style.color=ok?"#138a52":"#b52f3d";dot.style.background=ok?"#1aa864":"#d94a57";dot.style.boxShadow=ok?"0 0 0 4px #e7f7ef":"0 0 0 4px #fdecef";var c=data&&data.components||{};list.innerHTML=row("Access Form",c.accessForm)+row("Turnstile",c.turnstile)+row("Google Sheet logging",c.googleSheets)+row("Resend API",c.resend)+row("Verification email",c.verificationEmail)+row("Owner notification",c.ownerNotification)+(data.latest_request?"<div style=\\"font-size:11px;color:#718078;padding-top:5px;border-top:1px solid #edf2ef\\">Last request: "+esc(data.latest_request.requested_at)+" · "+esc(data.latest_request.status)+"</div>":"")+(data.latest_failed_request?"<div style=\\"font-size:11px;color:#b52f3d\\">Last failed request: "+esc(data.latest_failed_request.requested_at)+" · "+esc(data.latest_failed_request.status)+"</div>":"");time.textContent=data&&data.last_checked_at?("Last verified: "+new Date(data.last_checked_at).toLocaleString()):"Not checked yet"}async function load(){try{var r=await fetch("/admin/access/health",{credentials:"same-origin",cache:"no-store"});render(await r.json())}catch(e){render({overall:"error",components:{accessForm:{ok:false,state:"Unavailable",detail:String(e)}}})}}button.addEventListener("click",async function(){button.disabled=true;button.textContent="Testing…";try{var r=await fetch("/admin/access/health/run",{method:"POST",credentials:"same-origin",headers:{"Accept":"application/json"}});render(await r.json())}catch(e){render({overall:"error",components:{accessForm:{ok:false,state:"Test failed",detail:String(e)}}})}finally{button.disabled=false;button.textContent="Run Test Now"}});load();setInterval(load,60000)})();</script>' +
  '</div>';
}

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path !== '/admin/live') return next();
  const originalSend = res.send.bind(res);
  res.send = function dashboardAccessHealthSend(body) {
    if (typeof body === 'string' && body.includes('</body>') && !body.includes('data-vixale-health="1"')) {
      body = body.replace('</body>', dashboardAccessHealthPanelHtml() + '</body>');
    }
    return originalSend(body);
  };
  return next();
});

const dashboardAccessHealthStartupTimer = setTimeout(() => {
  runDashboardAccessHealthCheck({ sendSyntheticEmail: true, source: 'startup' }).catch(error => console.error('Dashboard access startup health check failed:', error));
}, 15000);
if (dashboardAccessHealthStartupTimer && dashboardAccessHealthStartupTimer.unref) dashboardAccessHealthStartupTimer.unref();
const dashboardAccessHealthInterval = setInterval(() => {
  runDashboardAccessHealthCheck({ sendSyntheticEmail: true, source: 'scheduled' }).catch(error => console.error('Dashboard access scheduled health check failed:', error));
}, DASHBOARD_ACCESS_HEALTH_INTERVAL_MS);
if (dashboardAccessHealthInterval && dashboardAccessHealthInterval.unref) dashboardAccessHealthInterval.unref();
`;

const HEALTH_ROUTES = String.raw`
app.get('/admin/access/health', async (req, res) => {
  if (!adminAccessRequestAllowed(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const stale = !dashboardAccessHealthState.last_checked_at || Date.now() - dashboardAccessHealthTime(dashboardAccessHealthState.last_checked_at) > DASHBOARD_ACCESS_HEALTH_INTERVAL_MS + (5 * 60 * 1000);
    const snapshot = stale ? await runDashboardAccessHealthCheck({ sendSyntheticEmail: false, source: 'admin-read' }) : dashboardAccessHealthSnapshot();
    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('Dashboard access health read failed:', error);
    return res.status(500).json({ overall: 'error', error: 'Dashboard access health check failed.' });
  }
});

app.post('/admin/access/health/run', async (req, res) => {
  if (!adminAccessRequestAllowed(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const snapshot = await runDashboardAccessHealthCheck({ sendSyntheticEmail: true, source: 'manual' });
    return res.status(snapshot.overall === 'operational' ? 200 : 503).json(snapshot);
  } catch (error) {
    console.error('Dashboard access manual health test failed:', error);
    return res.status(500).json({ overall: 'error', error: 'Dashboard access health test failed.' });
  }
});
`;

if (!blocks.ACCESS_HELPERS.includes(HEALTH_MARKER)) {
  blocks.ACCESS_HELPERS += "\n" + HEALTH_HELPERS;
}
if (!blocks.DELETE_ROUTE.includes("/admin/access/health")) {
  blocks.DELETE_ROUTE = HEALTH_ROUTES + "\n" + blocks.DELETE_ROUTE;
}

if (process.env.VIXALE_HEALTH_SOURCE_SELF_CHECK === "1") {
  new vm.Script(HEALTH_HELPERS + "\n" + HEALTH_ROUTES, { filename: "dashboard-access-health.generated.js" });
}

module.exports = { HEALTH_MARKER, HEALTH_HELPERS, HEALTH_ROUTES };
