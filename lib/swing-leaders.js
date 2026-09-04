'use strict';

const SWING_LEADERS_SPREADSHEET_ID = '14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
const SWING_LEADERS_RANGE = "'Public Feed'!A1:L200";
const SWING_LEADERS_CACHE_MS = 5 * 60 * 1000;
const MODEL_ALLOCATION_PER_POSITION = 10000;
const APPROVED_EXIT_REASONS = [
  'TARGET',
  'STOP LOSS',
  'DROPPED FROM ACTIVE PORTFOLIO',
];

const SNAPSHOT_FIELDS = [
  'snapshot_date',
  'snapshot_time_et',
  'market_posture',
  'active_count',
  'intern_count',
  'cash_pct',
  'quote_source',
  'quote_delay_notice',
  'research_disclaimer',
];

const ACTIVE_FIELDS = [
  'ticker',
  'exchange',
  'score',
  'entry_date',
  'entry_price',
  'current_price',
  'return_pct',
  'last_review_date',
  'brief_note',
];

const INTERN_FIELDS = [
  'ticker',
  'score',
  'brief_reason',
  'review_date',
];

const CLOSED_FIELDS = [
  'ticker',
  'entry_date',
  'entry_price',
  'exit_date',
  'exit_price',
  'return_pct',
  'last_score',
  'exit_reason',
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function integerValue(value, fieldName) {
  const text = cleanText(value);
  if (!/^-?\d+$/.test(text)) throw new Error(`Invalid integer for ${fieldName}`);
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw new Error(`Invalid integer for ${fieldName}`);
  return number;
}

function scoreValue(value, fieldName = 'score') {
  const score = integerValue(value, fieldName);
  if (score < 0 || score > 100) throw new Error(`Invalid ${fieldName}`);
  return score;
}

function requireText(value, fieldName) {
  const text = cleanText(value);
  if (!text) throw new Error(`Missing ${fieldName}`);
  return text;
}

function requireIsoDate(value, fieldName) {
  const text = requireText(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Invalid ${fieldName}`);
  return text;
}

function percentageValue(value, fieldName) {
  const text = requireText(value, fieldName);
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(text)) throw new Error(`Invalid percentage for ${fieldName}`);
  const number = Number(text.slice(0, -1));
  if (!Number.isFinite(number)) throw new Error(`Invalid percentage for ${fieldName}`);
  return number;
}

function rowIsBlank(row) {
  return !Array.isArray(row) || row.every(cell => cleanText(cell) === '');
}

function sectionIndex(rows, label) {
  return rows.findIndex(row => cleanText(row?.[0]).toUpperCase() === label);
}

function rowObject(header, row, whitelist) {
  const positions = new Map(header.map((name, index) => [cleanText(name), index]));
  for (const field of whitelist) {
    if (!positions.has(field)) throw new Error(`Public Feed section missing column ${field}`);
  }
  return Object.fromEntries(whitelist.map(field => [field, cleanText(row?.[positions.get(field)])]));
}

function parseSection(rows, startIndex, endIndex, fields) {
  const headerIndex = startIndex + 1;
  const header = rows[headerIndex] || [];
  const items = [];
  for (let index = headerIndex + 1; index < endIndex; index += 1) {
    const row = rows[index] || [];
    if (rowIsBlank(row)) continue;
    items.push(rowObject(header, row, fields));
  }
  return items;
}

function validatePublicFeed(snapshot) {
  requireIsoDate(snapshot.snapshot_date, 'snapshot_date');
  const snapshotTime = requireText(snapshot.snapshot_time_et, 'snapshot_time_et');
  if (!/^\d{1,2}(?::\d{2})?\s+ET$/i.test(snapshotTime)) throw new Error('Invalid snapshot_time_et');
  requireText(snapshot.market_posture, 'market_posture');
  percentageValue(snapshot.cash_pct, 'cash_pct');
  if (snapshot.quote_source !== 'GOOGLEFINANCE') throw new Error('quote_source must be GOOGLEFINANCE');
  requireText(snapshot.quote_delay_notice, 'quote_delay_notice');
  requireText(snapshot.research_disclaimer, 'research_disclaimer');

  if (!Array.isArray(snapshot.active_portfolio)) throw new Error('Missing active_portfolio');
  if (!Array.isArray(snapshot.interns)) throw new Error('Missing interns');
  if (!Array.isArray(snapshot.closed_trades)) throw new Error('Missing closed_trades');
  if (snapshot.active_count !== snapshot.active_portfolio.length) throw new Error('active_count does not match Active Portfolio');
  if (snapshot.intern_count !== snapshot.interns.length) throw new Error('intern_count does not match Interns');

  const activeTickers = new Set();
  for (const item of snapshot.active_portfolio) {
    item.ticker = requireText(item.ticker, 'active ticker').toUpperCase();
    item.exchange = requireText(item.exchange, `${item.ticker} exchange`);
    item.score = scoreValue(item.score, `${item.ticker} score`);
    item.entry_date = requireIsoDate(item.entry_date, `${item.ticker} entry_date`);
    item.entry_price = requireText(item.entry_price, `${item.ticker} entry_price`);
    item.current_price = requireText(item.current_price, `${item.ticker} current_price`);
    percentageValue(item.return_pct, `${item.ticker} return_pct`);
    item.last_review_date = requireIsoDate(item.last_review_date, `${item.ticker} last_review_date`);
    item.brief_note = requireText(item.brief_note, `${item.ticker} brief_note`);
    if (activeTickers.has(item.ticker)) throw new Error(`Duplicate active ticker ${item.ticker}`);
    activeTickers.add(item.ticker);
  }

  const internTickers = new Set();
  for (const item of snapshot.interns) {
    item.ticker = requireText(item.ticker, 'intern ticker').toUpperCase();
    item.score = scoreValue(item.score, `${item.ticker} score`);
    item.brief_reason = requireText(item.brief_reason, `${item.ticker} brief_reason`);
    item.review_date = requireIsoDate(item.review_date, `${item.ticker} review_date`);
    if (activeTickers.has(item.ticker)) throw new Error(`Intern ticker ${item.ticker} is already active`);
    if (internTickers.has(item.ticker)) throw new Error(`Duplicate intern ticker ${item.ticker}`);
    internTickers.add(item.ticker);
  }

  for (const item of snapshot.closed_trades) {
    item.ticker = requireText(item.ticker, 'closed ticker').toUpperCase();
    item.entry_date = requireIsoDate(item.entry_date, `${item.ticker} entry_date`);
    item.entry_price = requireText(item.entry_price, `${item.ticker} entry_price`);
    item.exit_date = requireIsoDate(item.exit_date, `${item.ticker} exit_date`);
    item.exit_price = requireText(item.exit_price, `${item.ticker} exit_price`);
    percentageValue(item.return_pct, `${item.ticker} return_pct`);
    item.last_score = scoreValue(item.last_score, `${item.ticker} last_score`);
    item.exit_reason = requireText(item.exit_reason, `${item.ticker} exit_reason`).toUpperCase();
    if (!APPROVED_EXIT_REASONS.includes(item.exit_reason)) throw new Error(`Invalid exit_reason for ${item.ticker}`);
  }

  snapshot.closed_trades.sort((left, right) => right.exit_date.localeCompare(left.exit_date));
  return snapshot;
}

function calculateModelPnl(items, allocation = MODEL_ALLOCATION_PER_POSITION) {
  const total = items.reduce((sum, item) => sum + allocation * (percentageValue(item.return_pct, `${item.ticker} return_pct`) / 100), 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

function addDisplayMetrics(snapshot) {
  const result = cloneSnapshot(snapshot);
  result.model_allocation_per_position = MODEL_ALLOCATION_PER_POSITION;
  result.active_unrealized_model_pnl = calculateModelPnl(result.active_portfolio);
  result.closed_realized_model_pnl = calculateModelPnl(result.closed_trades);
  return result;
}

function parsePublicFeed(values) {
  const rows = Array.isArray(values) ? values : [];
  const activeIndex = sectionIndex(rows, 'ACTIVE PORTFOLIO');
  const internIndex = sectionIndex(rows, 'INTERNS');
  const closedIndex = sectionIndex(rows, 'CLOSED TRADES');
  if (activeIndex < 0 || internIndex < 0 || closedIndex < 0) throw new Error('Public Feed sections are incomplete');
  if (!(activeIndex < internIndex && internIndex < closedIndex)) throw new Error('Public Feed sections are out of order');

  const metadata = {};
  for (let index = 0; index < activeIndex; index += 1) {
    const key = cleanText(rows[index]?.[0]);
    if (SNAPSHOT_FIELDS.includes(key)) metadata[key] = cleanText(rows[index]?.[1]);
  }
  for (const field of SNAPSHOT_FIELDS) requireText(metadata[field], field);

  const snapshot = {
    snapshot_date: metadata.snapshot_date,
    snapshot_time_et: metadata.snapshot_time_et,
    market_posture: metadata.market_posture,
    active_count: integerValue(metadata.active_count, 'active_count'),
    intern_count: integerValue(metadata.intern_count, 'intern_count'),
    cash_pct: metadata.cash_pct,
    quote_source: metadata.quote_source,
    quote_delay_notice: metadata.quote_delay_notice,
    research_disclaimer: metadata.research_disclaimer,
    active_portfolio: parseSection(rows, activeIndex, internIndex, ACTIVE_FIELDS),
    interns: parseSection(rows, internIndex, closedIndex, INTERN_FIELDS),
    closed_trades: parseSection(rows, closedIndex, rows.length, CLOSED_FIELDS),
  };

  return addDisplayMetrics(validatePublicFeed(snapshot));
}

function cloneSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSwingLeadersService({
  getSheetsClient,
  spreadsheetId = SWING_LEADERS_SPREADSHEET_ID,
  range = SWING_LEADERS_RANGE,
  cacheMs = SWING_LEADERS_CACHE_MS,
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (typeof getSheetsClient !== 'function') throw new Error('getSheetsClient is required');

  let lastValidSnapshot = null;
  let lastAttemptAt = 0;
  let lastAttemptSucceeded = false;
  let inFlight = null;

  async function refresh() {
    const attemptAt = now();
    try {
      const sheets = await getSheetsClient();
      if (!sheets?.spreadsheets?.values?.get) throw new Error('Google Sheets client unavailable');
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'FORMATTED_VALUE',
      });
      const snapshot = parsePublicFeed(response?.data?.values || []);
      lastValidSnapshot = cloneSnapshot(snapshot);
      lastAttemptAt = attemptAt;
      lastAttemptSucceeded = true;
      return { available: true, stale: false, data: cloneSnapshot(lastValidSnapshot) };
    } catch (error) {
      lastAttemptAt = attemptAt;
      lastAttemptSucceeded = false;
      logger?.error?.('Swing Leaders Public Feed refresh failed:', error?.message || error);
      if (lastValidSnapshot) {
        return { available: true, stale: true, data: cloneSnapshot(lastValidSnapshot) };
      }
      return { available: false, stale: true, data: null };
    }
  }

  async function getSnapshot({ force = false } = {}) {
    const age = now() - lastAttemptAt;
    if (!force && lastValidSnapshot && lastAttemptAt && age >= 0 && age < cacheMs) {
      return {
        available: true,
        stale: !lastAttemptSucceeded,
        data: cloneSnapshot(lastValidSnapshot),
      };
    }
    if (!force && inFlight) return inFlight;
    inFlight = refresh();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return { getSnapshot };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function returnClass(value) {
  const number = percentageValue(value, 'return_pct');
  if (number === 0) return 'flat';
  return number > 0 ? 'gain' : 'loss';
}

function pnlClass(value) {
  if (!Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'gain' : 'loss';
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const absolute = Math.abs(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (number > 0) return `+$${absolute}`;
  if (number < 0) return `-$${absolute}`;
  return '$0.00';
}

function renderActiveRows(items) {
  if (!items.length) return '<tr><td colspan="6" class="empty">No active model positions in this snapshot.</td></tr>';
  return items.map(item => `
    <tr>
      <td data-label="Ticker"><strong>${escapeHtml(item.ticker)}</strong><span>${escapeHtml(item.exchange)}</span></td>
      <td data-label="Score"><strong>${escapeHtml(item.score)}</strong><span>/ 100</span></td>
      <td data-label="Entry">${escapeHtml(item.entry_price)}<span>${escapeHtml(item.entry_date)}</span></td>
      <td data-label="Current">${escapeHtml(item.current_price)}</td>
      <td data-label="Return" class="${returnClass(item.return_pct)}">${escapeHtml(item.return_pct)}</td>
      <td data-label="Research Note" class="note">${escapeHtml(item.brief_note)}<span>Reviewed ${escapeHtml(item.last_review_date)}</span></td>
    </tr>`).join('');
}

function renderPotentialCandidateRows(items) {
  if (!items.length) return '<tr><td colspan="4" class="empty">No potential candidates in this snapshot.</td></tr>';
  return items.map(item => `
    <tr class="candidate-row">
      <td data-label="Ticker"><strong>${escapeHtml(item.ticker)}</strong></td>
      <td data-label="Score" class="candidate-score"><strong>${escapeHtml(item.score)}</strong><span>/ 100</span></td>
      <td data-label="Why We’re Watching" class="candidate-reason">${escapeHtml(item.brief_reason)}</td>
      <td data-label="Reviewed" class="candidate-reviewed">${escapeHtml(item.review_date)}</td>
    </tr>`).join('');
}

function renderClosedRows(items) {
  if (!items.length) return '<tr><td colspan="8" class="empty">No closed trades in this snapshot.</td></tr>';
  return items.map(item => `
    <tr>
      <td data-label="Ticker"><strong>${escapeHtml(item.ticker)}</strong></td>
      <td data-label="Entry">${escapeHtml(item.entry_price)}</td>
      <td data-label="Exit">${escapeHtml(item.exit_price)}</td>
      <td data-label="Return" class="${returnClass(item.return_pct)}">${escapeHtml(item.return_pct)}</td>
      <td data-label="Entry Date">${escapeHtml(item.entry_date)}</td>
      <td data-label="Exit Date">${escapeHtml(item.exit_date)}</td>
      <td data-label="Last Score">${escapeHtml(item.last_score)} / 100</td>
      <td data-label="Exit Reason" class="note">${escapeHtml(item.exit_reason)}</td>
    </tr>`).join('');
}

function renderSwingLeadersHtml(snapshot, { stale = false } = {}) {
  const validated = validatePublicFeed(cloneSnapshot(snapshot));
  const data = addDisplayMetrics(validated);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vixale Swing Leaders</title>
  <meta name="description" content="Vixale Swing Leaders research/model portfolio: active positions, potential candidates, market posture, and closed trades." />
  <style>
    :root{--bg:#f7faf8;--card:#fff;--ink:#101713;--muted:#68756e;--line:#dfe8e3;--green:#087a48;--green-soft:#eaf7f0;--red:#a33b45;--blue:#315c9b;--shadow:0 18px 52px rgba(16,23,19,.07)}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fbfdfc 0,var(--bg) 42%,#fff 100%);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.wrap{width:min(1180px,calc(100% - 36px));margin:auto}.topbar{border-bottom:1px solid var(--line);background:rgba(255,255,255,.88)}.topbar .wrap{min-height:66px;display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{font-weight:650;letter-spacing:-.02em;text-decoration:none}.nav{display:flex;gap:16px;align-items:center}.nav a{color:var(--muted);font-size:13px;text-decoration:none}.hero{padding:62px 0 34px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--green)}h1{font-size:clamp(42px,7vw,72px);line-height:.98;letter-spacing:-.055em;margin:14px 0 20px;font-weight:600}.hero-copy{max-width:820px;color:var(--muted);font-size:18px;line-height:1.6}.stamp{display:flex;flex-wrap:wrap;gap:9px;margin-top:22px}.pill{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:7px 10px;font-size:11px;font-weight:700;letter-spacing:.045em;text-transform:uppercase;background:#fff}.pill.stale{border-color:#e2c88c;background:#fff8e8;color:#7b5b14}.summary{display:grid;grid-template-columns:1.45fr repeat(4,.52fr);gap:12px;margin:6px 0 24px}.summary-card{padding:20px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.94);box-shadow:var(--shadow)}.summary-card small{display:block;color:var(--muted);font-size:11px;letter-spacing:.055em;text-transform:uppercase;margin-bottom:9px}.summary-card strong{font-size:23px;font-weight:600;letter-spacing:-.03em}.summary-card.posture strong{font-size:16px;line-height:1.45;letter-spacing:-.01em}.how{margin:0 0 24px;padding:22px 24px;border:1px solid var(--line);border-radius:24px;background:#fff;box-shadow:var(--shadow)}.how h2{margin:0 0 14px;font-size:22px;letter-spacing:-.03em}.how-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.how-item strong{display:block;font-size:13px;margin-bottom:6px}.how-item p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}.rules{margin-top:16px;padding-top:16px;border-top:1px solid var(--line);color:#46534c;font-size:12px;line-height:1.65}.section{margin:0 0 24px;border:1px solid var(--line);border-radius:26px;background:rgba(255,255,255,.95);box-shadow:var(--shadow);overflow:hidden}.section-head{padding:22px 24px;border-bottom:1px solid var(--line);display:flex;align-items:end;justify-content:space-between;gap:18px}.section-head h2{margin:0;font-size:24px;letter-spacing:-.035em}.section-head p{margin:5px 0 0;color:var(--muted);font-size:13px}.section-metric{text-align:right;white-space:nowrap}.section-metric small{display:block;color:var(--muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px}.section-metric strong{font-size:20px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{padding:15px 14px;border-bottom:1px solid #edf2ef;text-align:left;vertical-align:top;font-size:13px}th{color:var(--muted);font-size:10px;letter-spacing:.065em;text-transform:uppercase;font-weight:700}tbody tr:last-child td{border-bottom:0}td span{display:block;color:var(--muted);font-size:11px;margin-top:4px}td.note{min-width:230px;color:#45514b;line-height:1.45}.gain{color:var(--green);font-weight:650}.loss{color:var(--red);font-weight:650}.flat{color:var(--muted)}.candidate-table{table-layout:fixed}.candidate-table .candidate-col-ticker{width:11%}.candidate-table .candidate-col-score{width:12%}.candidate-table .candidate-col-reason{width:62%}.candidate-table .candidate-col-reviewed{width:15%}.candidate-table th,.candidate-table td{padding-top:11px;padding-bottom:11px}.candidate-score{white-space:nowrap}.candidate-reason{color:#45514b;line-height:1.4}.candidate-reviewed{white-space:nowrap;color:#45514b}.disclosure{margin:34px 0 54px;padding:22px;border:1px solid var(--line);border-radius:20px;background:#fafcfb;color:var(--muted);font-size:12px;line-height:1.65}.disclosure strong{color:var(--ink)}.empty{padding:24px;color:var(--muted);text-align:center}.footer{padding:24px 0 42px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
    @media(max-width:1000px){.summary{grid-template-columns:1fr 1fr}.summary-card.posture{grid-column:1/-1}.how-grid{grid-template-columns:1fr}}
    @media(max-width:720px){.wrap{width:min(100% - 24px,1180px)}.hero{padding-top:42px}.nav a:first-child{display:none}.summary{grid-template-columns:1fr}.summary-card.posture{grid-column:auto}.section{border-radius:20px}.section-head{align-items:flex-start;flex-direction:column}.section-metric{text-align:left}.candidate-table{table-layout:auto}table,thead,tbody,tr,th,td{display:block;width:100%}thead{display:none}tbody{padding:8px 14px}tr{padding:9px 0;border-bottom:1px solid var(--line)}tbody tr:last-child{border-bottom:0}td{display:grid;grid-template-columns:105px 1fr;gap:12px;padding:7px 2px;border:0;font-size:13px}td::before{content:attr(data-label);color:var(--muted);font-size:10px;letter-spacing:.055em;text-transform:uppercase}td.note{min-width:0}.candidate-table td{padding:7px 2px}.candidate-score,.candidate-reviewed{white-space:normal}.candidate-reason{line-height:1.45}}
  </style>
</head>
<body>
  <header class="topbar"><div class="wrap"><a class="brand" href="/">VIXALE</a><nav class="nav"><a href="/trading-systems">Trading Systems</a><a href="/">Home</a></nav></div></header>
  <main class="wrap">
    <section class="hero">
      <div class="eyebrow">Swing Trading · Research</div>
      <h1>Vixale Swing Leaders</h1>
      <p class="hero-copy">A research/model portfolio focused on actively monitored swing positions and potential future candidates from Vixale Trading Lab.</p>
      <div class="stamp"><span class="pill">Snapshot ${escapeHtml(data.snapshot_date)} · ${escapeHtml(data.snapshot_time_et)}</span><span class="pill">Quotes ${escapeHtml(data.quote_source)} · may be delayed</span>${stale ? '<span class="pill stale">Stale — last valid snapshot</span>' : ''}</div>
    </section>

    <section class="summary" aria-label="Swing Leaders summary">
      <div class="summary-card posture"><small>Market Posture</small><strong>${escapeHtml(data.market_posture)}</strong></div>
      <div class="summary-card"><small>Active Portfolio</small><strong>${escapeHtml(data.active_count)}</strong></div>
      <div class="summary-card"><small>Potential Candidates</small><strong>${escapeHtml(data.intern_count)}</strong></div>
      <div class="summary-card"><small>Cash</small><strong>${escapeHtml(data.cash_pct)}</strong></div>
      <div class="summary-card"><small>Model Allocation</small><strong>$10K</strong><span>per position</span></div>
    </section>

    <section class="how" aria-label="How Swing Leaders works">
      <h2>How Swing Leaders Works</h2>
      <div class="how-grid">
        <div class="how-item"><strong>Active Portfolio</strong><p>Open model positions currently being monitored for targets, stops, and ongoing research qualification.</p></div>
        <div class="how-item"><strong>Potential Candidates</strong><p>Potential candidates under active research review. They are not confirmed entries and may never enter the portfolio.</p></div>
        <div class="how-item"><strong>Closed Trades</strong><p>Completed model positions with final return and the recorded reason for exit.</p></div>
      </div>
      <div class="rules"><strong>Risk &amp; Exit Rules:</strong> Each model position starts with a $10,000 allocation. The profit target is +10% from entry. A stop-loss exit occurs if the daily closing price is more than 5% below entry. A position may also be closed when Trading Lab removes it from the Active Portfolio. <strong>Research Score:</strong> proprietary Vixale research metric shown on a 0–100 scale.</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Active Portfolio</h2><p>Open model positions using delayed GOOGLEFINANCE quotes for current valuation.</p></div><div class="section-metric"><small>Unrealized Model P&amp;L</small><strong class="${pnlClass(data.active_unrealized_model_pnl)}">${formatMoney(data.active_unrealized_model_pnl)}</strong></div></div>
      <div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Score</th><th>Entry</th><th>Current</th><th>Return</th><th>Research Note</th></tr></thead><tbody>${renderActiveRows(data.active_portfolio)}</tbody></table></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Potential Candidates</h2><p>Potential candidates under active research review.</p></div></div>
      <div class="table-wrap">
        <table class="candidate-table">
          <colgroup><col class="candidate-col-ticker"><col class="candidate-col-score"><col class="candidate-col-reason"><col class="candidate-col-reviewed"></colgroup>
          <thead><tr><th>Ticker</th><th>Score</th><th>Why We’re Watching</th><th>Reviewed</th></tr></thead>
          <tbody>${renderPotentialCandidateRows(data.interns)}</tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Closed Trades</h2><p>Completed model positions, newest exit first.</p></div><div class="section-metric"><small>Realized Model P&amp;L</small><strong class="${pnlClass(data.closed_realized_model_pnl)}">${formatMoney(data.closed_realized_model_pnl)}</strong></div></div>
      <div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Entry</th><th>Exit</th><th>Return</th><th>Entry Date</th><th>Exit Date</th><th>Last Score</th><th>Exit Reason</th></tr></thead><tbody>${renderClosedRows(data.closed_trades)}</tbody></table></div>
    </section>

    <aside class="disclosure"><strong>Research/model portfolio.</strong> ${escapeHtml(data.quote_delay_notice)} ${escapeHtml(data.research_disclaimer)} Model P&amp;L uses a fixed $10,000 allocation per position and is not brokerage account performance.</aside>
  </main>
  <footer class="footer"><div class="wrap">Vixale Swing Leaders · Last Updated ${escapeHtml(data.snapshot_date)} ${escapeHtml(data.snapshot_time_et)}</div></footer>
</body>
</html>`;
}

function renderUnavailableHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vixale Swing Leaders</title><style>body{margin:0;background:#f7faf8;color:#101713;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.box{max-width:720px;margin:12vh auto;padding:30px;border:1px solid #dfe8e3;border-radius:24px;background:#fff}p{color:#68756e;line-height:1.6}a{color:#087a48}</style></head><body><main class="box"><h1>Vixale Swing Leaders</h1><p>The research feed is temporarily unavailable and no previously validated snapshot is available to display. No partial or reconstructed portfolio has been created.</p><a href="/trading-systems">Back to Trading Systems</a></main></body></html>`;
}

function createSwingLeadersHandlers(options = {}) {
  const service = options.service || createSwingLeadersService(options);

  async function api(_req, res) {
    const result = await service.getSnapshot();
    res.setHeader?.('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    if (!result.available) return res.status(503).json({ ok: false, error: 'swing_leaders_feed_unavailable' });
    return res.status(200).json({ ...result.data, stale: result.stale });
  }

  async function page(_req, res) {
    const result = await service.getSnapshot();
    res.setHeader?.('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    if (!result.available) return res.status(503).send(renderUnavailableHtml());
    return res.status(200).send(renderSwingLeadersHtml(result.data, { stale: result.stale }));
  }

  return { api, page, service };
}

module.exports = {
  SWING_LEADERS_SPREADSHEET_ID,
  SWING_LEADERS_RANGE,
  MODEL_ALLOCATION_PER_POSITION,
  APPROVED_EXIT_REASONS,
  SNAPSHOT_FIELDS,
  ACTIVE_FIELDS,
  INTERN_FIELDS,
  CLOSED_FIELDS,
  parsePublicFeed,
  validatePublicFeed,
  calculateModelPnl,
  addDisplayMetrics,
  createSwingLeadersService,
  createSwingLeadersHandlers,
  renderSwingLeadersHtml,
  renderUnavailableHtml,
};
