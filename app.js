const express = require('express');
const { google } = require('googleapis');

const app = express();

app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: '*/*', limit: '2mb' }));

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const DASHBOARD_KEY = process.env.DASHBOARD_KEY || '';

const TELEGRAM_DM_URL = 'https://t.me/tradervip22';
const TELEGRAM_CHANNEL_URL = 'https://t.me/+0yWY1QdYuqkxYzhi';
const FULL_HISTORY_URL = 'https://docs.google.com/spreadsheets/d/1m0skLrbtBY0XRpJjOK-iY0IU1qc94SMnOybeh7C71Jg/edit?gid=1698117325#gid=1698117325';

const TRADES_SHEET = 'Trades';
const PENDING_SHEET = 'Pending';
const OPEN_POSITIONS_SHEET = 'Open Positions';
const CLOSED_TRADES_SHEET = 'Closed Trades';
const LEGACY_POSITIONS_SHEET = 'Positions';

const SILENT_TELEGRAM_EVENTS = new Set(['CANCEL']);

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BASIC HELPERS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cleanNumber(value) {
  if (value === undefined || value === null) return '';

  const str = String(value)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\+/g, '')
    .trim();

  const n = Number(str);
  return Number.isFinite(n) ? n : '';
}

function extract(regex, text) {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function makeTradeId(symbol, side) {
  if (!symbol || !side) return '';
  return `${symbol}_${side}`.toUpperCase();
}

function nowNy() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type)?.value || '';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function normalizeRawMessage(reqBody) {
  return typeof reqBody === 'string'
    ? reqBody
    : JSON.stringify(reqBody, null, 2);
}

function googleFinanceSymbolFormula(rowNum) {
  return `=IF(C${rowNum}="","",IFERROR(GOOGLEFINANCE(REGEXREPLACE(C${rowNum},".*:",""),"price"),""))`;
}

function unrealizedFormula(rowNum) {
  return `=IF(OR(C${rowNum}="",J${rowNum}="",F${rowNum}="",G${rowNum}=""),"",IF(D${rowNum}="LONG",(J${rowNum}-F${rowNum})*G${rowNum},(F${rowNum}-J${rowNum})*G${rowNum}))`;
}

function parseUpdatedRowNumber(updatedRange) {
  const match = String(updatedRange || '').match(/![A-Z]+(\d+):/);
  return match ? Number(match[1]) : null;
}

function formatMoney(value) {
  const n = cleanNumber(value);
  if (n === '') return '';

  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);

  return `${sign}$${abs}`;
}

function formatPercent(value) {
  const n = cleanNumber(value);
  if (n === '') return '';

  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);

  return `${sign}${abs}%`;
}

function calcResult(openPosition, closeRow) {
  const entry = cleanNumber(openPosition?.entry);
  const exit = cleanNumber(closeRow?.exit);
  const size = cleanNumber(openPosition?.size || closeRow?.size);
  const side = String(openPosition?.side || closeRow?.side || '').toUpperCase();

  if (entry === '' || exit === '' || size === '' || !side) return '';

  if (side === 'LONG') {
    return Number(((exit - entry) * size).toFixed(2));
  }

  if (side === 'SHORT') {
    return Number(((entry - exit) * size).toFixed(2));
  }

  return '';
}

function calcResultPercent(openPosition, closeRow) {
  const entry = cleanNumber(openPosition?.entry || closeRow?.entry);
  const size = cleanNumber(openPosition?.size || closeRow?.size);
  const result = cleanNumber(closeRow?.result);

  if (entry === '' || size === '' || result === '') return '';

  const notional = entry * size;

  if (!Number.isFinite(notional) || notional === 0) return '';

  return Number(((result / notional) * 100).toFixed(2));
}

function pnlTelegramLine(row) {
  const result = cleanNumber(row?.result);
  const resultPct = cleanNumber(row?.result_pct);

  if (result === '') return '';

  const emoji = result > 0 ? '😊' : result < 0 ? '😞' : '😐';
  const money = formatMoney(result);
  const pct = resultPct === '' ? '' : ` / ${formatPercent(resultPct)}`;

  return `${emoji} <b>${money}${pct}</b>`;
}

function enrichCloseRowFromOpenPosition(closeRow, openPosition) {
  if (!openPosition) return closeRow;

  const enriched = {
    ...closeRow,
    trade_id: closeRow.trade_id || openPosition.trade_id || makeTradeId(openPosition.symbol, openPosition.side),
    symbol: closeRow.symbol || openPosition.symbol || '',
    side: closeRow.side || openPosition.side || '',
    entry: closeRow.entry !== '' ? closeRow.entry : openPosition.entry || '',
    size: closeRow.size !== '' ? closeRow.size : openPosition.size || '',
    target: closeRow.target !== '' ? closeRow.target : openPosition.target || '',
    stop: closeRow.stop !== '' ? closeRow.stop : openPosition.stop || '',
    status: 'closed',
  };

  if (enriched.result === '') {
    enriched.result = calcResult(openPosition, enriched);
  }

  if (enriched.result_pct === '' || enriched.result_pct === undefined) {
    enriched.result_pct = calcResultPercent(openPosition, enriched);
  }

  return enriched;
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function moneyClass(value) {
  const n = cleanNumber(value);
  if (n === '') return '';
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'neutral';
}

function sideClass(side) {
  const s = String(side || '').toUpperCase();
  if (s === 'LONG') return 'long';
  if (s === 'SHORT') return 'short';
  return '';
}

function num(value, decimals = 2) {
  const n = cleanNumber(value);
  if (n === '') return '';
  return n.toFixed(decimals);
}

function pct(value) {
  const n = cleanNumber(value);
  if (n === '') return '';
  return `${n.toFixed(2)}%`;
}

function safeDateText(value) {
  return String(value || '').replace('T', ' ').slice(0, 19);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';

  return header.split(';').reduce((cookies, part) => {
    const [key, ...valueParts] = part.trim().split('=');

    if (!key) return cookies;

    cookies[key] = decodeURIComponent(valueParts.join('=') || '');
    return cookies;
  }, {});
}

function isDashboardAuthorized(req) {
  const keyFromQuery = String(req.query.key || '').trim();
  const cookies = parseCookies(req);
  const keyFromCookie = String(cookies.vixale_dashboard_key || '').trim();
  const dashboardKey = String(DASHBOARD_KEY || '').trim();

  return Boolean(dashboardKey) && (keyFromQuery === dashboardKey || keyFromCookie === dashboardKey);
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OLD TEXT ALERT PARSER — keeps older TV scripts working
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseTradingViewMessage(message) {
  const raw = String(message || '').trim();

  let symbol = '';
  let side = '';
  let event = '';

  const firstLine = raw.split('\n')[0] || '';

  const headerMatch = raw.match(/([A-Z0-9:_\.\-!]+)\s+(LONG|SHORT)/i);
  if (headerMatch) {
    symbol = headerMatch[1].trim().replace(/^[^A-Z0-9]+/i, '');
    side = headerMatch[2].trim().toUpperCase();
  }

  if (/CANCELED|CANCELLED/i.test(firstLine) || /CANCELED|CANCELLED/i.test(raw)) {
    event = 'CANCEL';
  } else if (/Entry filled/i.test(raw) || /\bFILLED\b/i.test(firstLine)) {
    event = 'FILL';
  } else if (/EOD CLOSE/i.test(firstLine)) {
    event = 'EOD';
  } else if (/TARGET HIT|TAKE PROFIT|\bTP\b/i.test(firstLine) || /ЦЕЛЬ/i.test(firstLine) || /Profit:/i.test(raw)) {
    event = 'TP';
  } else if (/STOP LOSS|\bSTOP\b|\bSL\b/i.test(firstLine) || /СТОП/i.test(firstLine) || /Actual loss:/i.test(raw)) {
    event = 'SL';
  } else if (/SETUP/i.test(firstLine)) {
    event = 'SETUP';
  } else {
    event = 'UNKNOWN';
  }

  const entry =
    cleanNumber(extract(/Entry filled:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Entry:\s*([0-9\.,-]+)/i, raw));

  const size =
    cleanNumber(extract(/Suggested Size:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Size:\s*([0-9\.,-]+)/i, raw));

  const target =
    cleanNumber(extract(/ЦЕЛЬ:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Target:\s*([0-9\.,-]+)/i, raw));

  const filled =
    cleanNumber(extract(/Filled:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Entry filled:\s*([0-9\.,-]+)/i, raw));

  const close =
    cleanNumber(extract(/Close:\s*([0-9\.,-]+)/i, raw));

  const stop =
    cleanNumber(extract(/СТОП на закрытие (?:ниже|выше)\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Stop:\s*([0-9\.,-]+)/i, raw));

  let exit = '';
  if (event === 'TP') exit = filled || close;
  if (event === 'SL' || event === 'EOD') exit = close || filled;

  let result = '';

  if (event === 'TP') {
    result = cleanNumber(extract(/Profit:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
  }

  if (event === 'SL') {
    const loss = cleanNumber(extract(/Actual loss:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
    result = loss === '' ? '' : -Math.abs(loss);
  }

  if (event === 'EOD') {
    result = cleanNumber(extract(/Result:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
  }

  const status =
    event === 'SETUP' ? 'pending' :
    event === 'FILL' ? 'open' :
    event === 'TP' ? 'closed' :
    event === 'SL' ? 'closed' :
    event === 'EOD' ? 'closed' :
    event === 'CANCEL' ? 'canceled' :
    'unknown';

  const trade_id = makeTradeId(symbol, side);

  return {
    timestamp: nowNy(),
    trade_id,
    symbol,
    side,
    event,
    entry,
    size,
    target,
    stop,
    exit,
    result,
    result_pct: '',
    status,
    raw,
    raw_event: event,
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEW JSON ALERT PARSER — for new FVG live TV script
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseJsonTradingViewAlert(data) {
  const eventRaw = String(data.event || '').toUpperCase();

  const eventMap = {
    SETUP: 'SETUP',
    ENTRY_FILL: 'FILL',
    TP: 'TP',
    CLOSE_STOP: 'SL',

    EOD_CLOSE: 'EOD',
    NEW_DAY_EMERGENCY_CLOSE: 'EOD',

    EOD_RESET: 'CANCEL',
    NEW_DAY_RESET: 'CANCEL',
    CANCEL_REPLACE: 'CANCEL',
  };

  const event = eventMap[eventRaw] || eventRaw || 'UNKNOWN';

  const symbol = String(data.symbol || '').trim();

  // If side is missing on EOD_RESET / NEW_DAY_RESET, leave side blank.
  // That lets us remove all pending rows by symbol.
  const side = data.side ? String(data.side).trim().toUpperCase() : '';

  const entry = cleanNumber(data.entry);
  const size = cleanNumber(data.qty);
  const target = cleanNumber(data.target);
  const stop = cleanNumber(data.stop);
  const price = cleanNumber(data.price);

  let exit = '';
  if (event === 'TP' || event === 'SL' || event === 'EOD') {
    exit = price;
  }

  let result = '';

  const trade_id = makeTradeId(symbol, side);

  const status =
    event === 'SETUP' ? 'pending' :
    event === 'FILL' ? 'open' :
    event === 'TP' || event === 'SL' || event === 'EOD' ? 'closed' :
    event === 'CANCEL' ? 'canceled' :
    'unknown';

  return {
    timestamp: nowNy(),
    trade_id,
    symbol,
    side,
    event,
    entry,
    size,
    target,
    stop,
    exit,
    result,
    result_pct: '',
    status,
    raw: JSON.stringify(data, null, 2),

    box_top: data.box_top ?? '',
    box_bottom: data.box_bottom ?? '',
    min_box_atr: data.min_box_atr ?? '',
    depth_pct: data.depth_pct ?? '',
    tp_atr: data.tp_atr ?? '',
    qty_mode: data.qty_mode ?? '',
    risk_pct: data.risk_pct ?? '',
    max_position_pct: data.max_position_pct ?? '',
    raw_event: eventRaw,
    reason: data.reason ?? '',
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRETTY TELEGRAM FORMATTER
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatTelegramMessage(row, originalMessage) {
  if (!row || row.event === 'UNKNOWN') return originalMessage;

  const titleBase = `${row.symbol || ''} ${row.side || ''}`.trim();
  const pnlLine = pnlTelegramLine(row);

  if (row.event === 'SETUP') {
    const emoji = row.side === 'SHORT' ? '🔴' : '🟢';

    return [
      `${emoji} <b>${titleBase} SETUP</b>`,
      '',
      row.entry !== '' ? `📍 Entry Limit: <b>${row.entry}</b>` : '',
      row.target !== '' ? `🎯 Target: <b>${row.target}</b>` : '',
      row.stop !== '' ? `⛔ Stop: close beyond <b>${row.stop}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'FILL') {
    return [
      `🎉 <b>${titleBase} FILLED</b>`,
      '',
      row.entry !== '' ? `✅ Entry: <b>${row.entry}</b>` : '',
      row.target !== '' ? `🎯 Target: <b>${row.target}</b>` : '',
      row.stop !== '' ? `⛔ Stop: close beyond <b>${row.stop}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'TP') {
    return [
      `🎯 <b>${titleBase} TAKE PROFIT HIT</b>`,
      '',
      row.exit !== '' ? `✅ Exit Price: <b>${row.exit}</b>` : '',
      row.entry !== '' ? `Entry: <b>${row.entry}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
      pnlLine,
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'SL') {
    return [
      `⛔ <b>${titleBase} CLOSE STOP</b>`,
      '',
      row.exit !== '' ? `❌ Exit Close: <b>${row.exit}</b>` : '',
      row.entry !== '' ? `Entry: <b>${row.entry}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
      pnlLine,
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'EOD') {
    return [
      `⏰ <b>${titleBase || row.symbol} EOD CLOSE</b>`,
      '',
      row.exit !== '' ? `Exit Price: <b>${row.exit}</b>` : '',
      row.entry !== '' ? `Entry: <b>${row.entry}</b>` : '',
      row.size !== '' ? `Qty: <b>${row.size}</b>` : '',
      pnlLine,
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'CANCEL') {
    const resetText = row.raw_event === 'EOD_RESET'
      ? 'EOD pending orders canceled'
      : row.raw_event === 'NEW_DAY_RESET'
        ? 'New day reset: old pending orders canceled'
        : 'Setup canceled / replaced';

    return [
      `⚪ <b>${titleBase || row.symbol} ${resetText}</b>`,
      '',
      row.reason ? `Reason: ${row.reason}` : '',
    ].filter(Boolean).join('\n');
  }

  return originalMessage;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOOGLE SHEETS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getSheetsClient() {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.log('Google Sheets env vars missing. Skipping sheet logging.');
    return null;
  }

  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function getSheetIdByName(sheets, sheetName) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEET_ID,
  });

  const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
  return sheet ? sheet.properties.sheetId : null;
}

async function readSheet(sheets, sheetName, range = 'A:Z') {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
  });

  return response.data.values || [];
}

function findRowIndexByTradeId(values, tradeId) {
  if (!tradeId) return -1;

  for (let i = 1; i < values.length; i++) {
    if ((values[i][0] || '').toUpperCase() === tradeId.toUpperCase()) {
      return i + 1;
    }
  }

  return -1;
}

async function deleteSheetRow(sheets, sheetName, rowNumber) {
  if (!rowNumber || rowNumber < 2) return;

  const sheetId = await getSheetIdByName(sheets, sheetName);
  if (sheetId === null) {
    console.log(`Sheet not found: ${sheetName}`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });

  console.log(`Deleted row ${rowNumber} from ${sheetName}`);
}

async function removeRowByTradeId(sheets, sheetName, tradeId) {
  const values = await readSheet(sheets, sheetName);
  const rowNumber = findRowIndexByTradeId(values, tradeId);

  if (rowNumber < 0) return null;

  const existing = values[rowNumber - 1];
  await deleteSheetRow(sheets, sheetName, rowNumber);

  return existing;
}

async function removePendingRowsBySymbol(sheets, symbol) {
  if (!symbol) return 0;

  const values = await readSheet(sheets, PENDING_SHEET, 'A:J');
  let removedCount = 0;

  for (let i = values.length - 1; i >= 1; i--) {
    const row = values[i];
    const rowSymbol = String(row[2] || '').toUpperCase();

    if (rowSymbol === String(symbol).toUpperCase()) {
      await deleteSheetRow(sheets, PENDING_SHEET, i + 1);
      removedCount++;
    }
  }

  console.log(`Pending rows removed by symbol ${symbol}: ${removedCount}`);
  return removedCount;
}

async function appendToTradesSheet(sheets, row) {
  if (!['FILL', 'TP', 'SL', 'EOD'].includes(row.event)) {
    console.log('Trades append skipped for non-executed event:', row.event);
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${TRADES_SHEET}!A:K`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        row.timestamp,
        row.symbol,
        row.side,
        row.event,
        row.entry,
        row.size,
        row.target || row.exit,
        row.stop,
        row.result,
        row.status,
        row.raw,
      ]],
    },
  });

  console.log('Trades row appended:', row.symbol, row.side, row.event);
}

async function upsertPending(sheets, row) {
  if (!row.trade_id) return;

  const values = await readSheet(sheets, PENDING_SHEET, 'A:J');
  const sheetRow = findRowIndexByTradeId(values, row.trade_id);
  const existing = sheetRow > 0 ? values[sheetRow - 1] : [];

  const pendingRow = [
    row.trade_id,
    row.timestamp || existing[1] || '',
    row.symbol || existing[2] || '',
    row.side || existing[3] || '',
    'pending',
    row.entry || existing[5] || '',
    row.size || existing[6] || '',
    row.target || existing[7] || '',
    row.stop || existing[8] || '',
    row.raw || existing[9] || '',
  ];

  if (sheetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${PENDING_SHEET}!A${sheetRow}:J${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [pendingRow] },
    });

    console.log('Pending updated:', row.trade_id);
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${PENDING_SHEET}!A:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [pendingRow] },
    });

    console.log('Pending appended:', row.trade_id);
  }
}

async function upsertOpenPosition(sheets, row, pendingRow = null) {
  if (!row.trade_id) return;

  const values = await readSheet(sheets, OPEN_POSITIONS_SHEET, 'A:L');
  const sheetRow = findRowIndexByTradeId(values, row.trade_id);
  const existing = sheetRow > 0 ? values[sheetRow - 1] : [];

  const openTime = row.timestamp || existing[1] || pendingRow?.[1] || '';
  const symbol = row.symbol || existing[2] || pendingRow?.[2] || '';
  const side = row.side || existing[3] || pendingRow?.[3] || '';
  const entry = row.entry || existing[5] || pendingRow?.[5] || '';
  const size = row.size || existing[6] || pendingRow?.[6] || '';
  const target = row.target || existing[7] || pendingRow?.[7] || '';
  const stop = row.stop || existing[8] || pendingRow?.[8] || '';
  const raw = row.raw || existing[11] || pendingRow?.[9] || '';

  let targetRowNumber = sheetRow;

  const openRowWithoutFormulas = [
    row.trade_id,
    openTime,
    symbol,
    side,
    'open',
    entry,
    size,
    target,
    stop,
    '',
    '',
    raw,
  ];

  if (sheetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${OPEN_POSITIONS_SHEET}!A${sheetRow}:L${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [openRowWithoutFormulas] },
    });

    targetRowNumber = sheetRow;
    console.log('Open position updated:', row.trade_id);
  } else {
    const appendResponse = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${OPEN_POSITIONS_SHEET}!A:L`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [openRowWithoutFormulas] },
    });

    targetRowNumber = parseUpdatedRowNumber(appendResponse.data.updates.updatedRange);
    console.log('Open position appended:', row.trade_id, 'row', targetRowNumber);
  }

  if (targetRowNumber) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${OPEN_POSITIONS_SHEET}!J${targetRowNumber}:K${targetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          googleFinanceSymbolFormula(targetRowNumber),
          unrealizedFormula(targetRowNumber),
        ]],
      },
    });
  }
}

async function removeOpenPosition(sheets, tradeId) {
  const removed = await removeRowByTradeId(sheets, OPEN_POSITIONS_SHEET, tradeId);
  if (!removed) return null;

  return {
    trade_id: removed[0] || '',
    open_time: removed[1] || '',
    symbol: removed[2] || '',
    side: removed[3] || '',
    status: removed[4] || '',
    entry: removed[5] || '',
    size: removed[6] || '',
    target: removed[7] || '',
    stop: removed[8] || '',
    last_price: removed[9] || '',
    unrealized_p_l: removed[10] || '',
    raw_open: removed[11] || '',
  };
}

async function appendClosedTrade(sheets, openPosition, closeRow) {
  const closedRow = [
    closeRow.trade_id,
    openPosition?.open_time || '',
    closeRow.timestamp,
    closeRow.symbol || openPosition?.symbol || '',
    closeRow.side || openPosition?.side || '',
    openPosition?.entry || closeRow.entry || '',
    closeRow.exit || '',
    openPosition?.size || closeRow.size || '',
    closeRow.result,
    closeRow.event,
    openPosition?.raw_open || '',
    closeRow.raw,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${CLOSED_TRADES_SHEET}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [closedRow] },
  });

  console.log('Closed trade appended:', closeRow.trade_id, closeRow.event, closeRow.result);
}

async function cleanupLegacyPositionIfExists(sheets, tradeId) {
  try {
    await removeRowByTradeId(sheets, LEGACY_POSITIONS_SHEET, tradeId);
  } catch (err) {
    console.log('Legacy Positions cleanup skipped:', err.message);
  }
}

async function processLedger(row) {
  const sheets = await getSheetsClient();

  if (!sheets) return row;

  if (!row || row.event === 'UNKNOWN') return row;

  if (row.event === 'SETUP') {
    if (!row.trade_id) return row;
    await upsertPending(sheets, row);
    return row;
  }

  if (row.event === 'FILL') {
    if (!row.trade_id) return row;

    const pendingRow = await removeRowByTradeId(sheets, PENDING_SHEET, row.trade_id);
    await cleanupLegacyPositionIfExists(sheets, row.trade_id);
    await upsertOpenPosition(sheets, row, pendingRow);
    await appendToTradesSheet(sheets, row);
    return row;
  }

  if (row.event === 'CANCEL') {
    if (row.trade_id) {
      await removeRowByTradeId(sheets, PENDING_SHEET, row.trade_id);
      await cleanupLegacyPositionIfExists(sheets, row.trade_id);
      return row;
    }

    if (row.symbol) {
      await removePendingRowsBySymbol(sheets, row.symbol);
      return row;
    }

    return row;
  }

  if (row.event === 'TP' || row.event === 'SL' || row.event === 'EOD') {
    if (!row.trade_id) return row;

    const openPosition = await removeOpenPosition(sheets, row.trade_id);
    await cleanupLegacyPositionIfExists(sheets, row.trade_id);

    const enrichedCloseRow = enrichCloseRowFromOpenPosition(row, openPosition);

    await appendToTradesSheet(sheets, enrichedCloseRow);
    await appendClosedTrade(sheets, openPosition, enrichedCloseRow);

    return enrichedCloseRow;
  }

  return row;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TELEGRAM
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sendTelegram(message) {
  if (!TOKEN || !CHAT_ID) {
    console.log('Telegram env vars missing. Skipping Telegram.');
    return;
  }

  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

  const payload = {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data = await response.json();
  console.log('Telegram response:', JSON.stringify(data));

  if (!data.ok && data.description && String(data.description).includes("can't parse entities")) {
    console.log('Telegram HTML parse failed. Retrying without parse_mode.');

    const fallbackPayload = {
      chat_id: CHAT_ID,
      text: message,
      disable_web_page_preview: true,
    };

    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fallbackPayload),
    });

    data = await response.json();
    console.log('Telegram fallback response:', JSON.stringify(data));
  }
}


//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD DATA
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseOpenPositionRow(row) {
  const entry = cleanNumber(row[5]);
  const size = cleanNumber(row[6]);
  const target = cleanNumber(row[7]);
  const stop = cleanNumber(row[8]);
  const last = cleanNumber(row[9]);
  const openPnl = cleanNumber(row[10]);
  const side = String(row[3] || '').toUpperCase();

  let toTp = '';
  let toStop = '';
  let exposure = '';

  if (entry !== '' && size !== '') {
    exposure = Number((entry * size).toFixed(2));
  }

  if (last !== '' && last !== 0 && target !== '') {
    if (side === 'LONG') {
      toTp = Number((((target - last) / last) * 100).toFixed(2));
    } else if (side === 'SHORT') {
      toTp = Number((((last - target) / last) * 100).toFixed(2));
    }
  }

  if (last !== '' && last !== 0 && stop !== '') {
    if (side === 'LONG') {
      toStop = Number((((last - stop) / last) * 100).toFixed(2));
    } else if (side === 'SHORT') {
      toStop = Number((((stop - last) / last) * 100).toFixed(2));
    }
  }

  return {
    trade_id: row[0] || '',
    open_time: row[1] || '',
    symbol: row[2] || '',
    side,
    status: row[4] || '',
    entry,
    size,
    target,
    stop,
    last,
    open_pnl: openPnl,
    to_tp: toTp,
    to_stop: toStop,
    exposure,
  };
}

function parsePendingRow(row) {
  return {
    trade_id: row[0] || '',
    timestamp: row[1] || '',
    symbol: row[2] || '',
    side: String(row[3] || '').toUpperCase(),
    status: row[4] || '',
    entry: cleanNumber(row[5]),
    size: cleanNumber(row[6]),
    target: cleanNumber(row[7]),
    stop: cleanNumber(row[8]),
  };
}

function parseClosedTradeRow(row) {
  return {
    trade_id: row[0] || '',
    open_time: row[1] || '',
    close_time: row[2] || '',
    symbol: row[3] || '',
    side: String(row[4] || '').toUpperCase(),
    entry: cleanNumber(row[5]),
    exit: cleanNumber(row[6]),
    size: cleanNumber(row[7]),
    result: cleanNumber(row[8]),
    event: row[9] || '',
  };
}

async function getDashboardData() {
  const sheets = await getSheetsClient();

  if (!sheets) {
    throw new Error('Google Sheets client is not configured.');
  }

  const [openValues, pendingValues, closedValues] = await Promise.all([
    readSheet(sheets, OPEN_POSITIONS_SHEET, 'A:L'),
    readSheet(sheets, PENDING_SHEET, 'A:J'),
    readSheet(sheets, CLOSED_TRADES_SHEET, 'A:L'),
  ]);

  const openPositions = openValues
    .slice(1)
    .filter(row => row[0])
    .map(parseOpenPositionRow);

  const pendingOrders = pendingValues
    .slice(1)
    .filter(row => row[0])
    .map(parsePendingRow);

  const closedTradesAll = closedValues
    .slice(1)
    .filter(row => row[0])
    .map(parseClosedTradeRow)
    .filter(row => row.result !== '' && row.entry !== '' && row.exit !== '' && row.size !== '');

  closedTradesAll.sort((a, b) => String(b.close_time).localeCompare(String(a.close_time)));

  const today = nowNy().slice(0, 10);

  const openPnl = openPositions.reduce((sum, row) => sum + (cleanNumber(row.open_pnl) || 0), 0);
  const exposure = openPositions.reduce((sum, row) => sum + (cleanNumber(row.exposure) || 0), 0);
  const totalClosedPnl = closedTradesAll.reduce((sum, row) => sum + (cleanNumber(row.result) || 0), 0);

  const closedToday = closedTradesAll.filter(row => String(row.close_time || '').slice(0, 10) === today);
  const closedPnlToday = closedToday.reduce((sum, row) => sum + (cleanNumber(row.result) || 0), 0);

  const winners = closedTradesAll.filter(row => cleanNumber(row.result) > 0).length;
  const winRate = closedTradesAll.length > 0 ? (winners / closedTradesAll.length) * 100 : 0;

  return {
    updated_at: nowNy(),
    open_positions: openPositions,
    pending_orders: pendingOrders,
    recent_closed_trades: closedTradesAll.slice(0, 20),
    summary: {
      open_count: openPositions.length,
      pending_count: pendingOrders.length,
      open_pnl: Number(openPnl.toFixed(2)),
      closed_pnl_today: Number(closedPnlToday.toFixed(2)),
      total_closed_pnl: Number(totalClosedPnl.toFixed(2)),
      win_rate: Number(winRate.toFixed(2)),
      exposure: Number(exposure.toFixed(2)),
    },
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC LANDING PAGE HTML
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderLandingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale | Watch a Live Trading System</title>
  <meta name="description" content="Watch a live trading system, get Telegram signals, connect Interactive Brokers / TWS, or build your own trading bot with Vixale." />
  <style>
    :root {
      --bg: #fbfcfb;
      --paper: #ffffff;
      --paper-soft: #f4f7f4;
      --ink: #101413;
      --muted: #68736f;
      --muted-2: #8b9691;
      --line: #e3e9e5;
      --line-2: #d7e1db;
      --green: #0bcf74;
      --green-dark: #078f51;
      --green-soft: #e9fff4;
      --shadow: 0 24px 70px rgba(16, 20, 19, 0.08);
      --shadow-soft: 0 14px 40px rgba(16, 20, 19, 0.06);
    }

    * {
      box-sizing: border-box;
    }

    /* Vixale no-bold typography reset */
    b, strong { font-weight: 500; }
    button, a, input, td, th, div, p, span, h1, h2, h3 {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }


    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 20% 0%, rgba(11, 207, 116, 0.14), transparent 30%),
        radial-gradient(circle at 86% 8%, rgba(11, 207, 116, 0.10), transparent 28%),
        linear-gradient(180deg, #fbfcfb 0%, #f6f9f6 58%, #ffffff 100%);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .hero-title-link {
      display: inline-block;
      color: inherit;
      text-decoration: none;
      cursor: pointer;
      margin-top: -2px;
    }

    .hero-title-link h1,
    .hero-title-link .accent {
      transition: color .18s ease, transform .18s ease;
    }

    .hero-title-link:hover h1 {
      transform: translateY(-1px);
    }

    .hero-title-link:hover .accent {
      color: #06b765;
    }

    .nav {
      position: sticky;
      top: 0;
      z-index: 30;
      background: rgba(251, 252, 251, 0.78);
      backdrop-filter: blur(22px);
      border-bottom: 1px solid rgba(227, 233, 229, 0.74);
    }

    .nav-inner {
      max-width: 1160px;
      margin: 0 auto;
      padding: 17px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 22px;
    }

    .brand-lockup {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: var(--ink);
    }

    .brand-mark {
      position: relative;
      width: 34px;
      height: 34px;
      border-radius: 12px;
      background: #101413;
      box-shadow: 0 10px 26px rgba(16, 20, 19, 0.10);
      overflow: hidden;
    }

    .brand-mark::before,
    .brand-mark::after {
      content: "";
      position: absolute;
      bottom: 8px;
      width: 7px;
      height: 20px;
      background: #fff;
      border-radius: 99px;
      transform-origin: bottom center;
    }

    .brand-mark::before {
      left: 10px;
      transform: rotate(-24deg);
    }

    .brand-mark::after {
      right: 10px;
      transform: rotate(24deg);
      background: var(--green);
    }

    .brand-word {
      display: flex;
      flex-direction: column;
      gap: 2px;
      line-height: 1;
    }

    .brand-name {
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 0.16em;
    }

    .brand-tagline {
      color: var(--muted-2);
      font-size: 11px;
      font-weight: 420;
      letter-spacing: 0.02em;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 22px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 480;
    }

    .nav-links a:hover {
      color: var(--ink);
    }

    .nav-cta {
      padding: 10px 15px;
      border: 1px solid var(--line-2);
      border-radius: 999px;
      color: var(--ink) !important;
      background: rgba(255,255,255,0.72);
      box-shadow: 0 8px 24px rgba(16, 20, 19, 0.04);
    }

    .wrap {
      max-width: 1160px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .hero {
      min-height: 500px;
      display: grid;
      grid-template-columns: .78fr 1.22fr;
      gap: 18px;
      align-items: center;
      padding: 42px 0 8px;
    }

    .hero > .visual {
      order: -1;
      width: 70%;
      min-width: 340px;
      justify-self: center;
    }

    .hero > div:first-child {
      justify-self: start;
    }

    .badge {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 15px;
      border: 1px solid rgba(184, 216, 198, 0.9);
      border-radius: 999px;
      background: rgba(255,255,255,0.82);
      color: #26302c;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 16px 42px rgba(16, 20, 19, 0.06);
      margin-bottom: 14px;
      overflow: hidden;
      cursor: pointer;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }

    .badge:hover {
      transform: translateY(-1px);
      border-color: rgba(11, 207, 116, 0.45);
      box-shadow: 0 18px 46px rgba(16, 20, 19, 0.08);
    }

    .badge::after {
      content: "";
      position: absolute;
      inset: -1px;
      background: linear-gradient(90deg, transparent, rgba(11,207,116,0.12), transparent);
      transform: translateX(-110%);
      animation: badgeSweep 4.8s ease-in-out infinite;
    }

    .badge span,
    .badge b {
      position: relative;
      z-index: 1;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 7px rgba(11, 207, 116, 0.13);
      animation: livePulse 2.2s ease-in-out infinite;
    }

    h1 {
      margin: 0;
      max-width: 760px;
      font-size: clamp(34px, 3.8vw, 48px);
      line-height: 1.05;
      letter-spacing: -1.7px;
      font-weight: 500;
      white-space: nowrap;
    }

    .smart-slogan {
      margin-top: 13px;
      color: #26302c;
      font-size: 17px;
      line-height: 1.45;
      letter-spacing: -0.35px;
      font-weight: 430;
      max-width: 650px;
    }

    .accent {
      color: var(--green-dark);
    }

    .hero-text {
      max-width: 650px;
      margin: 18px 0 0;
      color: var(--muted);
      font-size: 19px;
      line-height: 1.66;
      font-weight: 400;
    }

    .hero-note {
      max-width: 650px;
      margin-top: 13px;
      color: #4a5551;
      font-size: 15px;
      line-height: 1.58;
      font-weight: 400;
    }

    .hero-note strong {
      color: var(--ink);
      font-weight: 500;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      max-width: 680px;
      margin-top: 18px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 13px 16px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: -0.1px;
      border: 1px solid var(--line-2);
      background: rgba(255,255,255,0.72);
      color: var(--ink);
      box-shadow: 0 10px 30px rgba(16, 20, 19, 0.04);
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease;
      white-space: nowrap;
    }

    .btn:hover {
      transform: translateY(-1px);
      border-color: #c7d4cc;
      box-shadow: 0 16px 40px rgba(16, 20, 19, 0.07);
      background: #fff;
    }

    .btn-primary {
      background: var(--ink);
      border-color: var(--ink);
      color: #fff;
    }

    .btn-primary:hover {
      background: #000;
      border-color: #000;
    }

    .btn-green {
      background: var(--green-soft);
      border-color: #bfead5;
      color: #075f39;
    }

    .visual {
      position: relative;
    }

    .visual::before {
      content: "";
      position: absolute;
      width: 320px;
      height: 320px;
      right: -52px;
      top: -50px;
      background: radial-gradient(circle, rgba(11,207,116,0.18), transparent 64%);
      border-radius: 999px;
      z-index: -1;
    }

    .product-card {
      background: rgba(255,255,255,0.82);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
      overflow: hidden;
      backdrop-filter: blur(18px);
    }

    .product-top {
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--line);
    }

    .window-dots {
      display: flex;
      gap: 7px;
    }

    .window-dots span {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #d6ddd8;
    }

    .live-pill {
      color: #087246;
      background: #eafff4;
      border: 1px solid #c8efdb;
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 500;
    }

    .mock-body {
      padding: 14px;
    }

    .mock-title {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 14px;
    }

    .mock-title h2 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
      letter-spacing: -0.65px;
      font-weight: 500;
    }

    .mock-title p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .stat {
      border: 1px solid var(--line);
      background: #fbfdfb;
      border-radius: 18px;
      padding: 13px;
    }

    .stat-label {
      color: var(--muted-2);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .7px;
      font-weight: 500;
    }

    .stat-value {
      margin-top: 8px;
      font-size: 23px;
      font-weight: 500;
      letter-spacing: -0.8px;
    }

    .positive {
      color: var(--green-dark);
    }

    .negative {
      color: #d7424f;
    }

    .chart {
      height: 86px;
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background:
        linear-gradient(180deg, rgba(11,207,116,0.08), transparent),
        linear-gradient(90deg, rgba(16,20,19,0.04) 1px, transparent 1px),
        linear-gradient(rgba(16,20,19,0.04) 1px, transparent 1px);
      background-size: auto, 44px 44px, 44px 44px;
      position: relative;
      overflow: hidden;
    }

    .chart svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .rows {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr .85fr .85fr .9fr;
      gap: 10px;
      padding: 11px 14px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      color: #59645f;
    }

    .row:last-child {
      border-bottom: 0;
    }

    .row strong {
      color: var(--ink);
      font-weight: 500;
    }

    .section {
      padding: 28px 0;
    }

    .section-head {
      max-width: 720px;
      margin-bottom: 12px;
    }

    .section h2 {
      margin: 0 0 8px;
      font-size: clamp(24px, 2.55vw, 34px);
      line-height: 1.08;
      letter-spacing: -0.95px;
      font-weight: 500;
    }

    #systems .section-head h2 {
      font-size: clamp(23px, 2.25vw, 30px);
      letter-spacing: -0.75px;
    }

    #simple-steps.section {
      padding-top: 18px;
      padding-bottom: 0;
    }

    #simple-steps .section-head h2 {
      font-size: clamp(22px, 2.0vw, 27px);
      letter-spacing: -0.7px;
    }

    #access.section {
      padding-top: 0;
    }

    .section .lead {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.5;
      font-weight: 400;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: rgba(255,255,255,0.74);
      border: 1px solid var(--line);
      border-radius: 26px;
      padding: 22px;
      box-shadow: var(--shadow-soft);
    }

    .card-number {
      color: var(--green-dark);
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 22px;
    }

    .card h3 {
      margin: 0 0 10px;
      font-size: 21px;
      letter-spacing: -0.45px;
      font-weight: 500;
    }

    .card p {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
    }

    .flow {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .flow-step {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 22px;
      box-shadow: var(--shadow-soft);
    }

    .flow-step span {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--green-soft);
      color: var(--green-dark);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 12px;
    }

    .flow-step h3 {
      margin: 0 0 8px;
      font-size: 18px;
      letter-spacing: -0.35px;
      font-weight: 500;
    }

    .flow-step p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.55;
    }

    .access {
      background: linear-gradient(135deg, rgba(233, 255, 244, 0.92), rgba(255, 255, 255, 0.96));
      color: var(--ink);
      border: 1px solid #cfe9dc;
      border-radius: 34px;
      padding: 30px;
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 24px;
      align-items: center;
      box-shadow: 0 28px 80px rgba(16,20,19,.08);
    }

    .access h2 {
      margin: 0 0 10px;
      font-size: clamp(27px, 3.1vw, 38px);
      line-height: 1.06;
      letter-spacing: -1.65px;
      font-weight: 500;
    }

    .access p {
      margin: 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.56;
      max-width: 690px;
    }

    .access .small {
      margin-top: 14px;
      color: #5c6863;
      font-size: 13px;
    }

    .access-actions {
      display: grid;
      gap: 12px;
    }

    .access-actions .btn {
      background: var(--green-soft);
      border-color: #bfead5;
      color: #075f39;
      box-shadow: 0 12px 34px rgba(11,207,116,0.10);
    }

    .access-actions .btn.secondary {
      background: rgba(255,255,255,0.78);
      color: var(--ink);
      border-color: var(--line-2);
      box-shadow: 0 10px 30px rgba(16,20,19,0.04);
    }

    .footer {
      padding: 30px 0 38px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      font-size: 11.5px;
      line-height: 1.65;
    }

    .footer strong {
      color: var(--ink);
      font-weight: 500;
    }



    .card-action {
      margin-top: 18px;
      width: 100%;
      min-height: 44px;
      font-size: 13px;
      border-radius: 14px;
    }

    .watch-block {
      background: rgba(255,255,255,0.74);
      border: 1px solid var(--line);
      border-radius: 32px;
      padding: 28px;
      box-shadow: var(--shadow-soft);
      display: grid;
      grid-template-columns: 1.05fr .95fr;
      gap: 22px;
      align-items: center;
    }

    .watch-points {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .watch-point {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px;
      background: #fbfdfb;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .watch-point strong {
      display: block;
      color: var(--ink);
      margin-bottom: 4px;
    }

    .partner-box {
      background: linear-gradient(135deg, rgba(16,20,19,0.98), rgba(29,39,34,0.96));
      color: #fff;
      border-radius: 34px;
      padding: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: start;
      box-shadow: 0 28px 90px rgba(16,20,19,0.14);
    }

    .partner-box h2,
    .partner-box .lead,
    .partner-box p {
      color: #fff;
    }

    .partner-box .lead,
    .partner-box p {
      color: rgba(255,255,255,0.74);
    }

    .partner-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .partner-list div {
      padding: 12px 13px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.84);
      font-size: 13px;
      line-height: 1.4;
    }


    .reason-box {
      background: linear-gradient(135deg, rgba(255,255,255,0.86), rgba(233,255,244,0.72));
      border: 1px solid #cfe9dc;
      border-radius: 34px;
      padding: 30px;
      display: grid;
      grid-template-columns: .92fr 1.08fr;
      gap: 26px;
      align-items: start;
      box-shadow: 0 24px 80px rgba(16,20,19,0.08);
    }

    .reason-box h2 {
      margin: 0 0 10px;
      font-size: clamp(27px, 3.0vw, 38px);
      line-height: 1.08;
      letter-spacing: -1.25px;
      font-weight: 500;
    }

    .reason-copy {
      background: rgba(255,255,255,0.72);
      border: 1px solid var(--line);
      border-radius: 26px;
      padding: 24px;
      box-shadow: 0 16px 46px rgba(16,20,19,0.05);
    }

    .reason-copy h3 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.22;
      letter-spacing: -0.55px;
      font-weight: 500;
    }

    .reason-copy p {
      margin: 0 0 16px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
    }

    .reason-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }

    .reason-item {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 10px;
      align-items: start;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fbfdfb;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .reason-item span {
      width: 28px;
      height: 28px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--green-soft);
      color: var(--green-dark);
      font-weight: 500;
      font-size: 13px;
    }

    .reason-item strong {
      display: block;
      color: var(--ink);
      margin-bottom: 2px;
      font-weight: 500;
    }


    .strategy-form-box {
      background: rgba(255,255,255,0.78);
      border: 1px solid var(--line);
      border-radius: 34px;
      padding: 30px;
      box-shadow: var(--shadow-soft);
      display: grid;
      grid-template-columns: .95fr 1.05fr;
      gap: 26px;
      align-items: start;
    }

    .strategy-form-copy h2 {
      margin: 0 0 10px;
      font-size: clamp(27px, 3.0vw, 38px);
      line-height: 1.08;
      letter-spacing: -1.25px;
      font-weight: 500;
    }

    .strategy-form-copy p {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.62;
    }

    .soft-list {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }

    .soft-list div {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fbfdfb;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
      padding: 12px 13px;
    }

    .soft-list strong {
      color: var(--ink);
      font-weight: 500;
    }

    .strategy-form {
      background: #fbfdfb;
      border: 1px solid var(--line);
      border-radius: 26px;
      padding: 22px;
      box-shadow: 0 16px 46px rgba(16,20,19,0.05);
    }

    .strategy-form label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: .65px;
      margin: 0 0 8px;
    }

    .strategy-form input,
    .strategy-form select,
    .strategy-form textarea {
      width: 100%;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 14px;
      color: var(--ink);
      padding: 13px 14px;
      font-size: 15px;
      font-family: inherit;
      outline: none;
      transition: border-color .16s ease, box-shadow .16s ease;
    }

    .strategy-form textarea {
      min-height: 150px;
      resize: vertical;
      line-height: 1.5;
    }

    .strategy-form input:focus,
    .strategy-form select:focus,
    .strategy-form textarea:focus {
      border-color: rgba(11,207,116,.55);
      box-shadow: 0 0 0 4px rgba(11,207,116,.10);
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .form-field {
      margin-bottom: 14px;
    }

    .form-field.full {
      grid-column: 1 / -1;
    }

    .form-help {
      color: var(--muted-2);
      font-size: 12.5px;
      line-height: 1.45;
      margin-top: 7px;
    }

    .strategy-form .btn {
      width: 100%;
      border: 0;
      cursor: pointer;
      margin-top: 4px;
    }

    .hidden-field {
      display: none;
    }


    .simple-note {
      margin-top: 14px;
      color: #5c6863;
      font-size: 13px;
      line-height: 1.55;
    }


    /* compact landing spacing refinements */
    #systems {
      margin-top: -16px;
    }

    #simple-steps {
      margin-top: -8px;
    }

    .access {
      margin-top: 4px;
    }

    @media (max-width: 980px) {
      .hero,
      .access,
      .watch-block,
      .partner-box,
      .reason-box,
      .strategy-form-box {
        grid-template-columns: 1fr;
      }

      .hero {
        min-height: auto;
        padding-top: 44px;
      }

      .hero > .visual {
        width: 78%;
        min-width: 0;
        max-width: 520px;
      }

      .cards,
      .flow,
      .watch-points,
      .partner-list {
        grid-template-columns: 1fr;
      }

      .actions {
        grid-template-columns: 1fr;
      }

      .nav-links a:not(.nav-cta) {
        display: none;
      }
    }

    @media (max-width: 560px) {
      .wrap,
      .nav-inner {
        padding-left: 16px;
        padding-right: 16px;
      }

      h1 {
        font-size: 40px;
        letter-spacing: -2.1px;
        white-space: normal;
      }

      .hero > .visual {
        width: 92%;
      }

      .row {
        grid-template-columns: 1fr 1fr;
      }

      .stat-grid,
      .form-grid {
        grid-template-columns: 1fr;
      }

      .form-field.full {
        grid-column: auto;
      }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="brand-lockup" aria-label="Vixale home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-word">
          <span class="brand-name">VIXALE</span>
          <span class="brand-tagline">live trading system</span>
        </span>
      </a>
      <div class="nav-links">
        <a href="#live-system">Live System</a>
        <a href="#systems">Start Here</a>
        <a href="#why-it-makes-sense">Why It Makes Sense</a>
        <a href="#partners">Creators</a>
        <a class="nav-cta" href="/login">Live Dashboard</a>
      </div>
    </div>
  </nav>

  <main>
    <section class="wrap hero">
      <div>
        <a class="badge" href="/login"><span class="dot"></span><span>Live trading, easy to watch</span></a>
        <a class="hero-title-link" href="/login" aria-label="Open Live Trade Dashboard">
          <h1>Watch a <span class="accent">live trading system.</span></h1>
        </a>
        <div class="smart-slogan">See the signals. See the trades. See the results.</div>
        <p class="hero-text">
          Vixale runs a live trading system that finds trade setups, sends alerts, tracks open trades, and records results in a private dashboard.
        </p>
        <p class="hero-note">
          The live dashboard is password-protected. Request access, watch the system first, and then choose what you want next: signals, broker connection, strategy testing, or your own trading bot.
        </p>
        <div class="actions">
          <a class="btn btn-primary" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Password</a>
          <a class="btn btn-green" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Telegram Signals</a>
          <a class="btn" href="/login">Dashboard Login</a>
        </div>
      </div>

      <div class="visual">
        <div class="product-card">
          <div class="product-top">
            <div class="window-dots"><span></span><span></span><span></span></div>
            <div class="live-pill">● Live tracking</div>
          </div>
          <div class="mock-body">
            <div class="mock-title">
              <div>
                <h2>Live Trade Dashboard</h2>
                <p>A simple view of what the system is doing right now</p>
              </div>
            </div>
            <div class="stat-grid">
              <div class="stat">
                <div class="stat-label">Open P&L</div>
                <div class="stat-value positive">+$1,248</div>
              </div>
              <div class="stat">
                <div class="stat-label">Win rate</div>
                <div class="stat-value">67.4%</div>
              </div>
              <div class="stat">
                <div class="stat-label">Pending setups</div>
                <div class="stat-value">4</div>
              </div>
              <div class="stat">
                <div class="stat-label">Closed today</div>
                <div class="stat-value positive">+$532</div>
              </div>
            </div>
            <div class="chart">
              <svg viewBox="0 0 600 160" preserveAspectRatio="none">
                <path d="M0,118 C70,90 96,128 150,100 C205,72 236,86 288,60 C348,30 382,82 440,50 C502,18 546,38 600,22" fill="none" stroke="rgba(7,143,81,0.92)" stroke-width="5" stroke-linecap="round"/>
                <path d="M0,118 C70,90 96,128 150,100 C205,72 236,86 288,60 C348,30 382,82 440,50 C502,18 546,38 600,22 L600,160 L0,160 Z" fill="rgba(11,207,116,0.10)"/>
              </svg>
            </div>
            <div class="rows">
              <div class="row"><div><strong>NVDA</strong></div><div class="positive">LONG</div><div>Open</div><div class="positive">+$248</div></div>
              <div class="row"><div><strong>NFLX</strong></div><div class="negative">SHORT</div><div>Closed</div><div class="positive">+$277</div></div>
              <div class="row"><div><strong>META</strong></div><div class="positive">LONG</div><div>Pending</div><div>—</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="live-system" class="wrap section">
      <div class="watch-block">
        <div>
          <div class="badge"><span class="dot"></span><span>Start simple: watch first</span></div>
          <h2>You can start without trading anything.</h2>
          <p class="lead">
            Open the dashboard and see what the system is doing before you make any decision.
          </p>
          <p class="simple-note">
            The dashboard shows active trade ideas, open trades, closed trades, and tracked results. You do not have to connect a broker or place a trade to understand what is happening.
          </p>
          <div class="actions" style="grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 460px;">
            <a class="btn btn-primary" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Password</a>
            <a class="btn btn-green" href="/login">Dashboard Login</a>
          </div>
        </div>
        <div class="watch-points">
          <div class="watch-point"><strong>Open trades</strong>See which trades are currently active.</div>
          <div class="watch-point"><strong>Trade ideas</strong>See what the system is watching before a trade opens.</div>
          <div class="watch-point"><strong>Closed trades</strong>Review completed trades and recorded results.</div>
          <div class="watch-point"><strong>Clear tracking</strong>Follow the process without guessing.</div>
        </div>
      </div>
    </section>

    <section id="why-it-makes-sense" class="wrap section">
      <div class="reason-box">
        <div>
          <div class="badge"><span class="dot"></span><span>Clear rules. Clear tracking.</span></div>
          <h2>Why the Vixale approach makes sense.</h2>
          <p class="lead">
            Markets can feel messy when every decision depends on emotion, timing, and guesswork. Vixale makes the process easier to follow.
          </p>
          <p class="simple-note">
            The system waits for specific trade conditions, sends an alert when a setup appears, tracks the trade, and records the result. You are not asked to trust a story. You can watch the process live.
          </p>
          <div class="actions" style="grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 500px;">
            <a class="btn btn-primary" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Dashboard Password</a>
            <a class="btn" href="/login">Open Login Page</a>
          </div>
        </div>
        <div class="reason-copy">
          <h3>Not a prediction story. A visible process.</h3>
          <p>
            The value is not only in one signal. The value is in seeing the same process repeat over time: setup, alert, trade status, result, and review.
          </p>
          <div class="reason-list">
            <div class="reason-item"><span>1</span><div><strong>Rules instead of impulse</strong>The system reacts only when defined conditions appear.</div></div>
            <div class="reason-item"><span>2</span><div><strong>Tracking instead of guessing</strong>Open trades, closed trades, and results are recorded in one place.</div></div>
            <div class="reason-item"><span>3</span><div><strong>Visibility instead of blind trust</strong>You can see what the system is doing before deciding your next step.</div></div>
            <div class="reason-item"><span>4</span><div><strong>Review instead of memory</strong>Every trade becomes part of a record that can be checked and improved.</div></div>
          </div>
        </div>
      </div>
    </section>


    <section id="systems" class="wrap section">
      <div class="section-head">
        <h2>What can we help you with?</h2>
        <p class="lead">
          Start where you are. You do not need to have everything figured out. Choose the step that feels right for you.
        </p>
      </div>
      <div class="cards">
        <div class="card">
          <div class="card-number">01 / Watch</div>
          <h3>I want to watch first</h3>
          <p>Open the live dashboard and see how the system tracks signals, trades, and results.</p>
          <a class="btn card-action" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Password</a>
        </div>
        <div class="card">
          <div class="card-number">02 / Signals</div>
          <h3>I want trading signals</h3>
          <p>Get Telegram alerts when the system finds a trade setup.</p>
          <a class="btn card-action btn-green" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Telegram Signals</a>
        </div>
        <div class="card">
          <div class="card-number">03 / Automation</div>
          <h3>I want trades to be automated</h3>
          <p>Automation requires Interactive Brokers / TWS. Book a setup call and we will check what you have, what is missing, and the safest next step.</p>
          <a class="btn card-action" href="#appointment">Book Automation Call</a>
        </div>
        <div class="card">
          <div class="card-number">04 / Setup</div>
          <h3>I need help setting this up</h3>
          <p>Not sure where to start? Book a short setup call. We will map the account, alerts, dashboard, and the next clean step.</p>
          <a class="btn card-action" href="#appointment">Book Setup Call</a>
        </div>
        <div class="card">
          <div class="card-number">05 / Research</div>
          <h3>I have my own strategy</h3>
          <p>Send us your idea. We can test it, code it, and tell you honestly if it looks usable.</p>
          <a class="btn card-action" href="#strategy-review">Test My Strategy</a>
        </div>
        <div class="card">
          <div class="card-number">06 / Custom bot</div>
          <h3>I want my own trading bot</h3>
          <p>Tell us what you want the bot to do. You can describe it in simple words and we will turn it into a clear build plan.</p>
          <a class="btn card-action" href="#bot-request">Start Bot Builder Chat</a>
        </div>
      </div>
    </section>

    <section id="appointment" class="wrap section">
      <div class="strategy-form-box">
        <div class="strategy-form-copy">
          <div class="badge"><span class="dot"></span><span>Setup call</span></div>
          <h2>Book a quick setup call.</h2>
          <p>
            If you want automation or help getting started, this is the easiest next step. Tell us what you have now and we will reply with a simple plan.
          </p>
          <p>
            For automated trading, you will need Interactive Brokers and TWS. If you do not have it ready yet, we can still explain what has to be prepared.
          </p>
          <div class="soft-list">
            <div><strong>Best for automation.</strong> We check TWS / IBKR, alerts, and trade tracking.</div>
            <div><strong>Best for beginners.</strong> We help you understand the setup before you connect anything.</div>
            <div><strong>Simple next step.</strong> You send the request, we reply with available times.</div>
          </div>
        </div>

        <form class="strategy-form" method="POST" action="/appointment-request">
          <div class="form-grid">
            <div class="form-field">
              <label for="appointment_name">Your name</label>
              <input id="appointment_name" name="name" type="text" placeholder="John" autocomplete="name" />
            </div>
            <div class="form-field">
              <label for="appointment_contact">Email or Telegram</label>
              <input id="appointment_contact" name="contact" type="text" placeholder="@username or email" autocomplete="email" required />
            </div>
            <div class="form-field">
              <label for="appointment_type">What do you need?</label>
              <select id="appointment_type" name="request_type">
                <option value="Automate trades with TWS / IBKR">Automate trades with TWS / IBKR</option>
                <option value="Help me set everything up">Help me set everything up</option>
                <option value="Request dashboard password">Request dashboard password</option>
                <option value="Not sure yet">Not sure yet</option>
              </select>
            </div>
            <div class="form-field">
              <label for="appointment_time">Best time to talk</label>
              <input id="appointment_time" name="best_time" type="text" placeholder="Tomorrow afternoon, NY time..." />
            </div>
            <div class="form-field full">
              <label for="appointment_notes">What do you already have?</label>
              <textarea id="appointment_notes" name="notes" placeholder="Example: I have IBKR and TWS installed. I use TradingView alerts. I want signals to place trades automatically..."></textarea>
              <div class="form-help">Short notes are enough. We will ask the missing questions.</div>
            </div>
            <div class="hidden-field">
              <label for="appointment_website">Website</label>
              <input id="appointment_website" name="website" type="text" autocomplete="off" tabindex="-1" />
            </div>
          </div>
          <button class="btn btn-primary" type="submit">Request Appointment</button>
          <div class="form-help">We usually reply by Telegram or email with a suggested time.</div>
        </form>
      </div>
    </section>

    <section id="bot-request" class="wrap section">
      <div class="strategy-form-box">
        <div class="strategy-form-copy">
          <div class="badge"><span class="dot"></span><span>Bot Builder Chat</span></div>
          <h2>Describe the trading bot you want.</h2>
          <p>
            You do not need to know how to code. Write what the bot should watch, when it should enter, when it should exit, and what broker or platform you want to use.
          </p>
          <p>
            We will turn your idea into a clear build plan: what is possible, what needs testing, and what the first version should include.
          </p>
          <div class="soft-list">
            <div><strong>Plain English is fine.</strong> Describe the bot like you would explain it to a person.</div>
            <div><strong>We organize the logic.</strong> Entry, exit, risk, alerts, dashboard, and broker connection.</div>
            <div><strong>You keep control.</strong> We help design and build; you decide what gets connected.</div>
          </div>
        </div>

        <form class="strategy-form" method="POST" action="/bot-request">
          <div class="form-grid">
            <div class="form-field">
              <label for="bot_name">Your name</label>
              <input id="bot_name" name="name" type="text" placeholder="John" autocomplete="name" />
            </div>
            <div class="form-field">
              <label for="bot_contact">Email or Telegram</label>
              <input id="bot_contact" name="contact" type="text" placeholder="@username or email" autocomplete="email" required />
            </div>
            <div class="form-field">
              <label for="bot_market">Market</label>
              <input id="bot_market" name="market" type="text" placeholder="Stocks, futures, options, crypto..." />
            </div>
            <div class="form-field">
              <label for="bot_platform">Platform / broker</label>
              <input id="bot_platform" name="platform" type="text" placeholder="TradingView, NinjaTrader, IBKR, TWS..." />
            </div>
            <div class="form-field full">
              <label for="bot_description">What should the bot do?</label>
              <textarea id="bot_description" name="description" placeholder="Example: I want the bot to receive TradingView alerts, place trades in TWS, track positions, and send updates to Telegram..." required></textarea>
              <div class="form-help">Write the dream version. We will help separate version 1 from later improvements.</div>
            </div>
            <div class="hidden-field">
              <label for="bot_website">Website</label>
              <input id="bot_website" name="website" type="text" autocomplete="off" tabindex="-1" />
            </div>
          </div>
          <button class="btn btn-primary" type="submit">Send Bot Request</button>
          <div class="form-help">This starts the conversation. It does not connect to your broker or place trades.</div>
        </form>
      </div>
    </section>

    <section id="strategy-review" class="wrap section">
      <div class="strategy-form-box">
        <div class="strategy-form-copy">
          <div class="badge"><span class="dot"></span><span>Have your own strategy?</span></div>
          <h2>Send us your trading rules.</h2>
          <p>
            You do not need to write a perfect technical document. Just describe the idea in your own words.
          </p>
          <p>
            We will look at the rules, ask the right questions, and tell you what the next step should be: clean it up, test it, code it, or leave it alone.
          </p>
          <div class="soft-list">
            <div><strong>Simple is fine.</strong> Tell us what you buy, what you sell, and when you get out.</div>
            <div><strong>No pressure.</strong> This is only a first look, not a commitment.</div>
            <div><strong>Honest feedback.</strong> If the idea is weak, we will not pretend it is ready.</div>
          </div>
        </div>

        <form class="strategy-form" method="POST" action="/strategy-review">
          <div class="form-grid">
            <div class="form-field">
              <label for="strategy_name">Your name</label>
              <input id="strategy_name" name="name" type="text" placeholder="John" autocomplete="name" />
            </div>
            <div class="form-field">
              <label for="strategy_contact">Email or Telegram</label>
              <input id="strategy_contact" name="contact" type="text" placeholder="@username or email" autocomplete="email" required />
            </div>
            <div class="form-field">
              <label for="strategy_market">Market</label>
              <input id="strategy_market" name="market" type="text" placeholder="Stocks, options, futures, crypto..." />
            </div>
            <div class="form-field">
              <label for="strategy_experience">Your level</label>
              <select id="strategy_experience" name="experience">
                <option value="New to trading systems">New to trading systems</option>
                <option value="I trade manually">I trade manually</option>
                <option value="I already have alerts or code">I already have alerts or code</option>
                <option value="I manage a trading audience">I manage a trading audience</option>
              </select>
            </div>
            <div class="form-field full">
              <label for="strategy_rules">Describe your rules</label>
              <textarea id="strategy_rules" name="rules" placeholder="Example: I want to buy when price pulls back after a strong move, enter near..., target..., stop..., only during market hours..." required></textarea>
              <div class="form-help">Write it like you would explain it to a trader friend. We will help clean it up.</div>
            </div>
            <div class="form-field full">
              <label for="strategy_goal">What do you want from us?</label>
              <select id="strategy_goal" name="goal">
                <option value="Tell me if this strategy makes sense">Tell me if this strategy makes sense</option>
                <option value="Backtest this strategy">Backtest this strategy</option>
                <option value="Code this strategy">Code this strategy</option>
                <option value="Build a trading bot">Build a trading bot</option>
                <option value="Package this for my audience">Package this for my audience</option>
                <option value="Not sure yet">Not sure yet</option>
              </select>
            </div>
            <div class="hidden-field">
              <label for="website">Website</label>
              <input id="website" name="website" type="text" autocomplete="off" tabindex="-1" />
            </div>
          </div>
          <button class="btn btn-primary" type="submit">Send My Strategy</button>
          <div class="form-help">We usually reply by Telegram or email. Trading involves risk, and this form does not create any financial-advice relationship.</div>
        </form>
      </div>
    </section>

    <section id="simple-steps" class="wrap section">
      <div class="section-head">
        <h2>Simple steps. Clear choices.</h2>
        <p class="lead">
          You can start by watching, then choose the next step only when it makes sense to you.
        </p>
      </div>
      <div class="flow">
        <div class="flow-step"><span>1</span><h3>Watch</h3><p>Start with the live dashboard. See signals, trades, and results.</p></div>
        <div class="flow-step"><span>2</span><h3>Choose</h3><p>Decide what you want: signals, a setup call, strategy testing, or your own bot.</p></div>
        <div class="flow-step"><span>3</span><h3>Set up</h3><p>We help connect the tools you need, including Telegram, TradingView, Google Sheets, and TWS / IBKR.</p></div>
        <div class="flow-step"><span>4</span><h3>Track</h3><p>You keep visibility through alerts, trade logs, and dashboard updates.</p></div>
      </div>
    </section>

    <section id="new-to-this" class="wrap section">
      <div class="access" style="grid-template-columns: 1fr;">
        <div>
          <h2>New to trading systems? Start here.</h2>
          <p>
            Many people are interested in trading systems but get lost in broker settings, alerts, code, and risk rules. You can start by simply watching the dashboard, asking questions, and deciding which next step makes sense for you.
          </p>
          <div class="small">No hype. Clear tracking, simple explanations, and honest feedback.</div>
        </div>
        <div class="access-actions" style="grid-template-columns: repeat(3, minmax(0, 1fr)); display: grid;">
          <a class="btn" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Password</a>
          <a class="btn secondary" href="#appointment">Book Setup Call</a>
          <a class="btn secondary" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Telegram Signals</a>
        </div>
      </div>
    </section>

    <section id="partners" class="wrap section">
      <div class="partner-box">
        <div>
          <h2>Have an audience? Launch a trading product with Vixale.</h2>
          <p>
            If you run a Telegram channel, YouTube channel, Discord, newsletter, or trading community, we can help you turn your audience into a structured trading product.
          </p>
          <p>
            You bring the audience. We bring the trading system, dashboard, alerts, automation, research, tracking, and product packaging.
          </p>
          <a class="btn btn-green" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Partner With Vixale</a>
        </div>
        <div class="partner-list">
          <div>Signal delivery</div>
          <div>Live dashboard access</div>
          <div>Strategy research</div>
          <div>Custom bots</div>
          <div>TWS / IBKR setup</div>
          <div>White-label products</div>
          <div>Performance tracking</div>
          <div>Marketing packaging</div>
        </div>
      </div>
    </section>

    <section id="access" class="wrap section">
      <div class="access">
        <div>
          <h2>Start by watching the live system.</h2>
          <p>
            The live dashboard is password-protected. Request access, watch the system, and decide your next step when you are ready.
          </p>
          <div class="small">The dashboard is for transparency, tracking, and education. Trading always involves risk.</div>
        </div>
        <div class="access-actions">
          <a class="btn" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Password</a>
          <a class="btn secondary" href="/login">Dashboard Login</a>
          <a class="btn secondary" href="#appointment">Book Setup Call</a>
        </div>
      </div>
    </section>

  </main>

  <footer class="wrap footer">
    <strong>Important Risk Disclosure:</strong> Vixale is not a registered investment adviser, broker-dealer, commodity trading adviser, fiduciary, law firm, accounting firm, or tax adviser. All website content, Telegram messages, alerts, dashboards, spreadsheets, trade examples, strategy references, performance figures, and related materials are provided strictly for educational, research, and informational purposes only. Nothing presented by Vixale is personalized financial, investment, trading, legal, tax, or accounting advice, and nothing should be interpreted as an offer, solicitation, recommendation, endorsement, instruction, or invitation to buy, sell, short, hold, or trade any security, option, futures contract, cryptocurrency, derivative, or other financial instrument. Results may be backtested, hypothetical, simulated, paper-traded, forward-tested, delayed, incomplete, based on assumptions, affected by data errors, and materially different from live brokerage execution. Past performance, win rate, P&L, examples, charts, alerts, or strategy history are not guarantees, promises, projections, or reliable indicators of future results. Trading and investing involve substantial risk, including the possible loss of some or all capital. You alone are responsible for all trading decisions, position sizing, risk controls, broker selection, order execution, taxes, and compliance with applicable laws and regulations. Consult properly licensed professionals before making any financial decisions. By using this website, dashboard, Telegram channel, spreadsheets, or related materials, you agree that Vixale and its operators are not liable for any losses, damages, missed profits, execution differences, delays, outages, data inaccuracies, or reliance on any information provided.
  </footer>
</body>
</html>`;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRATEGY FORM THANK YOU HTML
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderStrategyReceivedHtml(name = '') {
  const safeName = escapeHtml(name || '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale | Strategy Received</title>
  <style>
    :root {
      --bg: #fbfcfb;
      --paper: #ffffff;
      --ink: #101413;
      --muted: #68736f;
      --line: #e3e9e5;
      --green: #0bcf74;
      --green-dark: #078f51;
      --green-soft: #e9fff4;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 18% 6%, rgba(11,207,116,0.15), transparent 32%),
        radial-gradient(circle at 84% 10%, rgba(11,207,116,0.10), transparent 28%),
        linear-gradient(180deg, #fbfcfb 0%, #f6f9f6 100%);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 560px;
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      border-radius: 30px;
      padding: 34px;
      box-shadow: 0 28px 80px rgba(16,20,19,0.08);
      backdrop-filter: blur(18px);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 15px;
      border: 1px solid rgba(184, 216, 198, 0.9);
      border-radius: 999px;
      background: rgba(255,255,255,0.82);
      color: #26302c;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 18px;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 7px rgba(11,207,116,0.13);
    }

    h1 {
      margin: 0;
      font-size: clamp(32px, 5vw, 48px);
      line-height: 1.05;
      letter-spacing: -1.6px;
      font-weight: 500;
    }

    p {
      color: var(--muted);
      line-height: 1.62;
      margin: 14px 0 0;
      font-size: 16px;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 24px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 13px 16px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      text-decoration: none;
    }

    .btn-primary {
      background: var(--ink);
      border-color: var(--ink);
      color: #fff;
    }

    .small {
      color: #5c6863;
      font-size: 13px;
      margin-top: 18px;
    }

    @media (max-width: 560px) {
      .actions { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span><span>Strategy received</span></div>
    <h1>${safeName ? `Thanks, ${safeName}.` : 'Thanks. We got it.'}</h1>
    <p>Your trading rules were sent to Vixale. We will review the idea and reply by the contact you provided.</p>
    <p>You can keep watching the live system while we review your strategy.</p>
    <div class="actions">
      <a class="btn btn-primary" href="/login">View Live Dashboard</a>
      <a class="btn" href="/">Back to Home</a>
    </div>
    <div class="small">This is a strategy review request, not financial advice. Trading involves risk and results are not guaranteed.</div>
  </div>
</body>
</html>`;
}

function renderSimpleReceivedHtml(kind = 'Request received', name = '') {
  const safeName = escapeHtml(name || '');
  const safeKind = escapeHtml(kind || 'Request received');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale | Request Received</title>
  <style>
    :root { --ink:#101413; --muted:#68736f; --line:#e3e9e5; --green:#0bcf74; }
    * { box-sizing: border-box; }
    body {
      margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
      background: radial-gradient(circle at 18% 6%, rgba(11,207,116,.15), transparent 32%), linear-gradient(180deg,#fbfcfb 0%,#f6f9f6 100%);
      color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",Inter,"Segoe UI",Arial,sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .card { width:100%; max-width:560px; background:rgba(255,255,255,.88); border:1px solid var(--line); border-radius:30px; padding:34px; box-shadow:0 28px 80px rgba(16,20,19,.08); }
    .badge { display:inline-flex; align-items:center; gap:10px; padding:10px 15px; border:1px solid rgba(184,216,198,.9); border-radius:999px; background:#fff; font-size:13px; font-weight:500; margin-bottom:18px; }
    .dot { width:10px; height:10px; border-radius:999px; background:var(--green); box-shadow:0 0 0 7px rgba(11,207,116,.13); }
    h1 { margin:0; font-size:clamp(32px,5vw,48px); line-height:1.05; letter-spacing:-1.6px; font-weight:500; }
    p { color:var(--muted); line-height:1.62; margin:14px 0 0; font-size:16px; }
    .actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:24px; }
    .btn { display:inline-flex; align-items:center; justify-content:center; min-height:48px; padding:13px 16px; border-radius:14px; font-size:14px; font-weight:500; border:1px solid var(--line); background:#fff; color:var(--ink); text-decoration:none; }
    .btn-primary { background:var(--ink); border-color:var(--ink); color:#fff; }
    .small { color:#5c6863; font-size:13px; margin-top:18px; line-height:1.5; }
    @media (max-width:560px){ .actions { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span><span>${safeKind}</span></div>
    <h1>${safeName ? `Thanks, ${safeName}.` : 'Thanks. We got it.'}</h1>
    <p>Your request was sent to Vixale. We will reply by the contact you provided.</p>
    <p>You can keep watching the live system while we review the details.</p>
    <div class="actions">
      <a class="btn btn-primary" href="/login">Dashboard Login</a>
      <a class="btn" href="/">Back to Home</a>
    </div>
    <div class="small">Trading involves risk. This request does not create any financial-advice relationship.</div>
  </div>
</body>
</html>`;
}


//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGIN HTML
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderLoginHtml(errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale Dashboard Login</title>
  <style>
    :root {
      --bg: #fbfcfb;
      --paper: #ffffff;
      --ink: #101413;
      --muted: #68736f;
      --line: #e3e9e5;
      --green: #0bcf74;
      --red: #d7424f;
    }

    * { box-sizing: border-box; }

    /* Vixale no-bold typography reset */
    b, strong { font-weight: 500; }
    button, a, input, td, th, div, p, span, h1, h2, h3 {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }


    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 18% 6%, rgba(11,207,116,0.15), transparent 32%),
        radial-gradient(circle at 84% 10%, rgba(11,207,116,0.10), transparent 28%),
        linear-gradient(180deg, #fbfcfb 0%, #f6f9f6 100%);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 440px;
      background: rgba(255,255,255,0.84);
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 34px;
      box-shadow: 0 28px 80px rgba(16,20,19,0.08);
      backdrop-filter: blur(18px);
    }

    .logo {
      font-size: 20px;
      font-weight: 500;
      letter-spacing: -0.35px;
      margin-bottom: 30px;
    }

    .logo span { color: var(--green); }

    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
      letter-spacing: -1.2px;
      font-weight: 500;
    }

    p {
      color: var(--muted);
      line-height: 1.58;
      margin: 12px 0 26px;
      font-size: 15px;
    }

    label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: .7px;
      margin-bottom: 8px;
    }

    input {
      width: 100%;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 14px;
      color: var(--ink);
      padding: 14px 15px;
      font-size: 16px;
      outline: none;
    }

    input:focus {
      border-color: rgba(11,207,116,.55);
      box-shadow: 0 0 0 4px rgba(11,207,116,.10);
    }

    button {
      width: 100%;
      margin-top: 14px;
      border: 0;
      border-radius: 14px;
      padding: 14px 18px;
      background: var(--ink);
      color: #fff;
      font-weight: 500;
      font-size: 15px;
      cursor: pointer;
    }

    .error {
      margin-top: 14px;
      color: var(--red);
      font-size: 14px;
      font-weight: 500;
    }

    .links {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 20px;
    }

    .links a {
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
    }

    .links a:hover { color: var(--ink); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Vixale<span>.</span></div>
    <h1>Dashboard access</h1>
    <p>Enter the dashboard password to view live tracking and the full trade history link.</p>
    <form method="POST" action="/dashboard-login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus />
      <button type="submit">Open Dashboard</button>
    </form>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <div class="links">
      <a href="/">← Back to Home</a>
      <a href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Access</a>
    </div>
  </div>
</body>
</html>`;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD HTML — PASSWORD PROTECTED
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderMoney(value) {
  const n = cleanNumber(value);
  if (n === '') return '';
  return formatMoney(n);
}

function renderDashboardHtml(data) {
  const s = data.summary;

  const openRows = data.open_positions.map(row => `
    <tr>
      <td class="ticker">${escapeHtml(row.symbol)}</td>
      <td class="${sideClass(row.side)}">${escapeHtml(row.side)}</td>
      <td>${num(row.entry)}</td>
      <td>${num(row.last)}</td>
      <td>${num(row.target)}</td>
      <td>${num(row.stop)}</td>
      <td>${num(row.size, 0)}</td>
      <td class="${moneyClass(row.open_pnl)}">${renderMoney(row.open_pnl)}</td>
      <td>${pct(row.to_tp)}</td>
      <td>${pct(row.to_stop)}</td>
      <td class="positive">${renderMoney(row.exposure)}</td>
      <td>${escapeHtml(row.status)}</td>
    </tr>
  `).join('');

  const pendingRows = data.pending_orders.map(row => `
    <tr>
      <td class="ticker">${escapeHtml(row.symbol)}</td>
      <td class="${sideClass(row.side)}">${escapeHtml(row.side)}</td>
      <td>${num(row.entry)}</td>
      <td>${num(row.target)}</td>
      <td>${num(row.stop)}</td>
      <td>${num(row.size, 0)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(safeDateText(row.timestamp))}</td>
      <td>${escapeHtml(row.trade_id)}</td>
    </tr>
  `).join('');

  const closedRows = data.recent_closed_trades.map(row => `
    <tr>
      <td class="ticker">${escapeHtml(row.trade_id)}</td>
      <td>${escapeHtml(safeDateText(row.open_time))}</td>
      <td>${escapeHtml(safeDateText(row.close_time))}</td>
      <td class="ticker">${escapeHtml(row.symbol)}</td>
      <td class="${sideClass(row.side)}">${escapeHtml(row.side)}</td>
      <td>${num(row.entry)}</td>
      <td>${num(row.exit)}</td>
      <td>${num(row.size, 0)}</td>
      <td class="${moneyClass(row.result)}">${renderMoney(row.result)}</td>
      <td>${escapeHtml(row.event)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="30" />
  <title>Vixale Live Strategy Dashboard</title>
  <style>
    :root {
      --page: #f7fbf8;
      --page2: #eef8f2;
      --card: rgba(255,255,255,0.88);
      --card-solid: #ffffff;
      --text: #121815;
      --muted: #63716a;
      --muted2: #87938d;
      --line: #dfe9e3;
      --line2: #ccded4;
      --green: #008f4a;
      --green2: #0bbf6a;
      --green-soft: #e9fff3;
      --red: #d8424f;
      --shadow: 0 18px 54px rgba(21, 48, 34, 0.08);
      --shadow-soft: 0 10px 30px rgba(21, 48, 34, 0.055);
    }

    * { box-sizing: border-box; }

    /* Vixale no-bold typography reset */
    b, strong { font-weight: 500; }
    body, button, a, input, table, th, td, div, p, span, h1, h2, h3 {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: geometricPrecision;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at 10% 0%, rgba(0, 143, 74, 0.10), transparent 34%),
        radial-gradient(circle at 90% 7%, rgba(0, 143, 74, 0.075), transparent 30%),
        linear-gradient(180deg, #f8fcfa 0%, #f3faf6 42%, #ffffff 100%);
      color: var(--text);
      font-weight: 400;
    }

    a { color: inherit; text-decoration: none; }

    .wrap {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
    }

    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .home-link, .dash-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      color: #17201b;
      font-size: 13px;
      line-height: 1.2;
      font-weight: 400;
      letter-spacing: -0.01em;
      box-shadow: 0 8px 24px rgba(21, 48, 34, 0.045);
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }

    .home-link:hover, .dash-btn:hover {
      transform: translateY(-1px);
      border-color: var(--line2);
      background: #ffffff;
    }

    .dashboard-links {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .dash-btn.primary {
      background: #0f1512;
      border-color: #0f1512;
      color: #ffffff;
      font-weight: 400;
      box-shadow: 0 12px 32px rgba(15, 21, 18, 0.12);
    }

    .dash-btn.primary:hover {
      background: #18211d;
      border-color: #18211d;
    }

    .hero {
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      border-radius: 30px;
      padding: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      margin-bottom: 14px;
    }

    .topline {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .brand h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.08;
      font-weight: 500;
      letter-spacing: -0.045em;
      color: #111815;
    }

    .subtitle {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
      margin-top: 7px;
      font-weight: 400;
      letter-spacing: -0.01em;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      background: var(--green-soft);
      border: 1px solid #bfe9d2;
      color: var(--green);
      font-size: 13px;
      line-height: 1.2;
      font-weight: 400;
      white-space: nowrap;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--green2);
      box-shadow: 0 0 18px rgba(11,191,106,.45);
    }

    .updated {
      color: var(--muted2);
      font-size: 12.5px;
      line-height: 1.4;
      font-weight: 400;
      margin-top: 13px;
      font-variant-numeric: tabular-nums;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
      margin-top: 20px;
    }

    .card {
      background: rgba(255,255,255,0.92);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 16px 15px;
      min-height: 96px;
      box-shadow: var(--shadow-soft);
    }

    .card .label {
      color: var(--muted2);
      font-size: 11px;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 400;
    }

    .card .value {
      margin-top: 12px;
      font-size: 24px;
      line-height: 1.06;
      font-weight: 400;
      letter-spacing: -0.035em;
      font-variant-numeric: tabular-nums;
    }

    .positive { color: var(--green) !important; }
    .negative { color: var(--red) !important; }
    .neutral { color: var(--text) !important; }
    .long { color: var(--green); font-weight: 400; }
    .short { color: var(--red); font-weight: 400; }

    .section {
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      border-radius: 24px;
      overflow: hidden;
      margin-top: 15px;
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(14px);
    }

    .section-header {
      padding: 14px 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,252,249,0.94));
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
      font-weight: 500;
      letter-spacing: -0.025em;
      color: #111815;
    }

    .section-header span {
      color: var(--muted2);
      font-size: 12px;
      line-height: 1.35;
      font-weight: 400;
    }

    .table-wrap { overflow-x: auto; }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
      background: rgba(255,255,255,0.80);
    }

    th, td {
      padding: 13px 14px;
      border-bottom: 1px solid #eef4f1;
      text-align: right;
      white-space: nowrap;
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
    }

    th {
      color: var(--muted2);
      font-size: 11px;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.055em;
      background: #fbfefd;
      font-weight: 400;
    }

    td {
      color: #202924;
      font-size: 14px;
      line-height: 1.35;
      font-weight: 400;
      letter-spacing: -0.01em;
    }

    td:first-child, th:first-child,
    td:nth-child(2), th:nth-child(2) {
      text-align: left;
    }

    tr:hover td { background: #f5fbf8; }

    .ticker {
      color: #121815;
      font-weight: 500;
      letter-spacing: -0.012em;
    }

    .empty {
      padding: 22px 18px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
      font-weight: 400;
    }

    .footer {
      margin-top: 18px;
      color: #6f7a75;
      font-size: 12px;
      line-height: 1.62;
      font-weight: 400;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.72);
      border-radius: 20px;
      padding: 16px 18px;
      box-shadow: 0 10px 34px rgba(21, 48, 34, 0.05);
    }

    @media (max-width: 1100px) {
      .cards { grid-template-columns: repeat(3, 1fr); }
    }

    @media (max-width: 720px) {
      .wrap { padding: 14px; }
      .brand h1 { font-size: 25px; }
      .cards { grid-template-columns: repeat(2, 1fr); }
      .card { min-height: 90px; }
      .card .value { font-size: 21px; }
      .dash-btn, .home-link { width: 100%; }
      .dashboard-links { width: 100%; }
      th, td { font-size: 13px; padding: 12px 10px; }
    }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top-actions">
      <a class="home-link" href="/">← Back to Home</a>

      <div class="dashboard-links">
        <a class="dash-btn primary" href="${FULL_HISTORY_URL}" target="_blank" rel="noopener noreferrer">Full Trade History</a>
        <a class="dash-btn" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Telegram Channel</a>
        <a class="dash-btn" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Contact</a>
      </div>
    </div>

    <div class="hero">
      <div class="topline">
        <div class="brand">
          <h1>Vixale Live Strategy Dashboard</h1>
          <div class="subtitle">Private live forward-test / paper-trading tracker</div>
          <div class="updated">Last refreshed: ${escapeHtml(data.updated_at)} ET · Auto-refreshes every 30 seconds</div>
        </div>
        <div class="badge"><span class="dot"></span> LIVE TRACKING</div>
      </div>

      <div class="cards">
        <div class="card">
          <div class="label">Open Positions</div>
          <div class="value">${escapeHtml(s.open_count)}</div>
        </div>
        <div class="card">
          <div class="label">Pending Orders</div>
          <div class="value">${escapeHtml(s.pending_count)}</div>
        </div>
        <div class="card">
          <div class="label">Open P&L</div>
          <div class="value ${moneyClass(s.open_pnl)}">${renderMoney(s.open_pnl)}</div>
        </div>
        <div class="card">
          <div class="label">Closed P&L Today</div>
          <div class="value ${moneyClass(s.closed_pnl_today)}">${renderMoney(s.closed_pnl_today)}</div>
        </div>
        <div class="card">
          <div class="label">Total Closed P&L</div>
          <div class="value ${moneyClass(s.total_closed_pnl)}">${renderMoney(s.total_closed_pnl)}</div>
        </div>
        <div class="card">
          <div class="label">Win Rate</div>
          <div class="value">${pct(s.win_rate)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Live Open Positions</h2>
        <span>Total exposure: ${renderMoney(s.exposure)}</span>
      </div>
      <div class="table-wrap">
        ${data.open_positions.length ? `
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Last</th>
              <th>Target</th>
              <th>Stop</th>
              <th>Qty</th>
              <th>Open P&L</th>
              <th>To TP</th>
              <th>To Stop</th>
              <th>Exposure</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${openRows}</tbody>
        </table>
        ` : `<div class="empty">No open positions.</div>`}
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Pending Orders</h2>
        <span>Working setup orders waiting for entry</span>
      </div>
      <div class="table-wrap">
        ${data.pending_orders.length ? `
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Target</th>
              <th>Stop</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Time</th>
              <th>Trade ID</th>
            </tr>
          </thead>
          <tbody>${pendingRows}</tbody>
        </table>
        ` : `<div class="empty">No pending orders.</div>`}
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Recent Closed Trades</h2>
        <span>Latest 20 completed trades. Full history available above.</span>
      </div>
      <div class="table-wrap">
        ${data.recent_closed_trades.length ? `
        <table>
          <thead>
            <tr>
              <th>Trade ID</th>
              <th>Open Time</th>
              <th>Close Time</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Qty</th>
              <th>P&L</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>${closedRows}</tbody>
        </table>
        ` : `<div class="empty">No closed trades yet.</div>`}
      </div>
    </div>

    <div class="footer">
      <strong>Important Risk Disclosure:</strong> Vixale is not a registered investment adviser, broker-dealer, commodity trading adviser, fiduciary, law firm, accounting firm, or tax adviser. This private dashboard, including all signals, alerts, spreadsheets, trade history, P&L, win rate, examples, and strategy data, is provided strictly for educational, research, and informational purposes only. Nothing shown here is personalized financial, investment, trading, legal, tax, or accounting advice, and nothing should be interpreted as an offer, solicitation, recommendation, endorsement, instruction, or invitation to buy, sell, short, hold, or trade any security, option, futures contract, cryptocurrency, derivative, or other financial instrument. Results may be backtested, hypothetical, simulated, paper-traded, forward-tested, delayed, incomplete, based on assumptions, affected by data errors, and materially different from live brokerage execution. Past performance is not indicative of future results. Trading and investing involve substantial risk, including the possible loss of some or all capital. You alone are responsible for all trading decisions, position sizing, risk controls, broker selection, order execution, taxes, and compliance with applicable laws and regulations. Consult properly licensed professionals before making any financial decisions. By using this dashboard or related materials, you agree that Vixale and its operators are not liable for any losses, damages, missed profits, execution differences, delays, outages, data inaccuracies, or reliance on any information provided.
    </div>
  </div>
</body>
</html>`;
}


//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WEBHOOK ROUTES
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleTradingViewWebhook(req, res) {
  try {
    const isJsonObject =
      typeof req.body === 'object' &&
      req.body !== null &&
      !Buffer.isBuffer(req.body);

    const message = normalizeRawMessage(req.body);

    const parsedRow = isJsonObject
      ? parseJsonTradingViewAlert(req.body)
      : parseTradingViewMessage(message);

    let finalRow = parsedRow;

    try {
      finalRow = (await processLedger(parsedRow)) || parsedRow;
    } catch (sheetErr) {
      console.error('Google Sheets / ledger failed:', sheetErr);
      finalRow = parsedRow;
    }

    if (!SILENT_TELEGRAM_EVENTS.has(finalRow.event)) {
      const telegramMessage = formatTelegramMessage(finalRow, message);
      await sendTelegram(telegramMessage);
    } else {
      console.log('Telegram skipped for silent event:', finalRow.event, finalRow.raw_event || '');
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error');
  }
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SITE ROUTES
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/', (req, res) => {
  res.status(200).send(renderLandingHtml());
});

app.get('/login', (req, res) => {
  res.status(200).send(renderLoginHtml());
});



app.post('/strategy-review', async (req, res) => {
  try {
    const body = req.body || {};

    // Basic honeypot for simple bots.
    if (body.website) {
      return res.status(200).send(renderStrategyReceivedHtml(''));
    }

    const name = String(body.name || '').trim();
    const contact = String(body.contact || '').trim();
    const market = String(body.market || '').trim();
    const experience = String(body.experience || '').trim();
    const goal = String(body.goal || '').trim();
    const rules = String(body.rules || '').trim();

    if (!contact || !rules) {
      return res.status(400).send('Please provide your contact and strategy rules.');
    }

    const message = [
      '🧠 <b>New Strategy Review Request</b>',
      '',
      name ? `Name: <b>${escapeHtml(name)}</b>` : '',
      `Contact: <b>${escapeHtml(contact)}</b>`,
      market ? `Market: <b>${escapeHtml(market)}</b>` : '',
      experience ? `Level: <b>${escapeHtml(experience)}</b>` : '',
      goal ? `Goal: <b>${escapeHtml(goal)}</b>` : '',
      '',
      '<b>Rules:</b>',
      escapeHtml(rules),
    ].filter(Boolean).join('\n');

    await sendTelegram(message);

    return res.status(200).send(renderStrategyReceivedHtml(name));
  } catch (err) {
    console.error('Strategy review form error:', err);
    return res.status(500).send('Strategy review form error. Please try again or contact us on Telegram.');
  }
});

app.post('/appointment-request', async (req, res) => {
  try {
    const body = req.body || {};

    if (body.website) {
      return res.status(200).send(renderSimpleReceivedHtml('Request received', ''));
    }

    const name = String(body.name || '').trim();
    const contact = String(body.contact || '').trim();
    const requestType = String(body.request_type || '').trim();
    const bestTime = String(body.best_time || '').trim();
    const notes = String(body.notes || '').trim();

    if (!contact) {
      return res.status(400).send('Please provide your email or Telegram.');
    }

    const message = [
      '📅 <b>New Setup / Automation Appointment Request</b>',
      '',
      name ? `Name: <b>${escapeHtml(name)}</b>` : '',
      `Contact: <b>${escapeHtml(contact)}</b>`,
      requestType ? `Request: <b>${escapeHtml(requestType)}</b>` : '',
      bestTime ? `Best time: <b>${escapeHtml(bestTime)}</b>` : '',
      '',
      notes ? '<b>Notes:</b>' : '',
      notes ? escapeHtml(notes) : '',
    ].filter(Boolean).join('\n');

    await sendTelegram(message);

    return res.status(200).send(renderSimpleReceivedHtml('Appointment request received', name));
  } catch (err) {
    console.error('Appointment form error:', err);
    return res.status(500).send('Appointment form error. Please try again or contact us on Telegram.');
  }
});

app.post('/bot-request', async (req, res) => {
  try {
    const body = req.body || {};

    if (body.website) {
      return res.status(200).send(renderSimpleReceivedHtml('Request received', ''));
    }

    const name = String(body.name || '').trim();
    const contact = String(body.contact || '').trim();
    const market = String(body.market || '').trim();
    const platform = String(body.platform || '').trim();
    const description = String(body.description || '').trim();

    if (!contact || !description) {
      return res.status(400).send('Please provide your contact and bot description.');
    }

    const message = [
      '🤖 <b>New Custom Bot Request</b>',
      '',
      name ? `Name: <b>${escapeHtml(name)}</b>` : '',
      `Contact: <b>${escapeHtml(contact)}</b>`,
      market ? `Market: <b>${escapeHtml(market)}</b>` : '',
      platform ? `Platform / broker: <b>${escapeHtml(platform)}</b>` : '',
      '',
      '<b>Bot idea:</b>',
      escapeHtml(description),
    ].filter(Boolean).join('\n');

    await sendTelegram(message);

    return res.status(200).send(renderSimpleReceivedHtml('Bot request received', name));
  } catch (err) {
    console.error('Bot request form error:', err);
    return res.status(500).send('Bot request form error. Please try again or contact us on Telegram.');
  }
});

app.post('/dashboard-login', (req, res) => {
  if (!DASHBOARD_KEY) {
    return res.status(500).send('Dashboard key is not configured.');
  }

  const password = String(req.body.password || '').trim();
  const dashboardKey = String(DASHBOARD_KEY || '').trim();

  if (password !== dashboardKey) {
    return res.status(401).send(renderLoginHtml('Incorrect password. Please try again.'));
  }

  res.cookie('vixale_dashboard_key', String(DASHBOARD_KEY || '').trim(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12,
  });

  return res.redirect('/dashboard');
});

app.get('/dashboard', async (req, res) => {
  try {
    if (!DASHBOARD_KEY) {
      return res.status(500).send('Dashboard key is not configured.');
    }

    const keyFromQuery = String(req.query.key || '').trim();
    const dashboardKey = String(DASHBOARD_KEY || '').trim();

    if (keyFromQuery === dashboardKey) {
      res.cookie('vixale_dashboard_key', String(DASHBOARD_KEY || '').trim(), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 12,
      });

      return res.redirect('/dashboard');
    }

    if (!isDashboardAuthorized(req)) {
      return res.redirect('/login');
    }

    const data = await getDashboardData();
    res.status(200).send(renderDashboardHtml(data));
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Dashboard error');
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('vixale_dashboard_key', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });

  return res.redirect('/');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Webhook endpoints
app.post('/', handleTradingViewWebhook);
app.post('/tv', handleTradingViewWebhook);

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});const express = require('express');
const { google } = require('googleapis');

const app = express();

app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: '*/*', limit: '2mb' }));

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const DASHBOARD_KEY = process.env.DASHBOARD_KEY || '';

const TELEGRAM_DM_URL = 'https://t.me/tradervip22';
const TELEGRAM_CHANNEL_URL = 'https://t.me/+0yWY1QdYuqkxYzhi';
const FULL_HISTORY_URL = 'https://docs.google.com/spreadsheets/d/1m0skLrbtBY0XRpJjOK-iY0IU1qc94SMnOybeh7C71Jg/edit?gid=1698117325#gid=1698117325';

const TRADES_SHEET = 'Trades';
const PENDING_SHEET = 'Pending';
const OPEN_POSITIONS_SHEET = 'Open Positions';
const CLOSED_TRADES_SHEET = 'Closed Trades';
const LEGACY_POSITIONS_SHEET = 'Positions';

const SILENT_TELEGRAM_EVENTS = new Set(['CANCEL']);

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BASIC HELPERS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cleanNumber(value) {
  if (value === undefined || value === null) return '';

  const str = String(value)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\+/g, '')
    .trim();

  const n = Number(str);
  return Number.isFinite(n) ? n : '';
}

function extract(regex, text) {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function makeTradeId(symbol, side) {
  if (!symbol || !side) return '';
  return `${symbol}_${side}`.toUpperCase();
}

function nowNy() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type)?.value || '';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function normalizeRawMessage(reqBody) {
  return typeof reqBody === 'string'
    ? reqBody
    : JSON.stringify(reqBody, null, 2);
}

function googleFinanceSymbolFormula(rowNum) {
  return `=IF(C${rowNum}="","",IFERROR(GOOGLEFINANCE(REGEXREPLACE(C${rowNum},".*:",""),"price"),""))`;
}

function unrealizedFormula(rowNum) {
  return `=IF(OR(C${rowNum}="",J${rowNum}="",F${rowNum}="",G${rowNum}=""),"",IF(D${rowNum}="LONG",(J${rowNum}-F${rowNum})*G${rowNum},(F${rowNum}-J${rowNum})*G${rowNum}))`;
}

function parseUpdatedRowNumber(updatedRange) {
  const match = String(updatedRange || '').match(/![A-Z]+(\d+):/);
  return match ? Number(match[1]) : null;
}

function formatMoney(value) {
  const n = cleanNumber(value);
  if (n === '') return '';

  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);

  return `${sign}$${abs}`;
}

function formatPercent(value) {
  const n = cleanNumber(value);
  if (n === '') return '';

  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);

  return `${sign}${abs}%`;
}

function calcResult(openPosition, closeRow) {
  const entry = cleanNumber(openPosition?.entry);
  const exit = cleanNumber(closeRow?.exit);
  const size = cleanNumber(openPosition?.size || closeRow?.size);
  const side = String(openPosition?.side || closeRow?.side || '').toUpperCase();

  if (entry === '' || exit === '' || size === '' || !side) return '';

  if (side === 'LONG') {
    return Number(((exit - entry) * size).toFixed(2));
  }

  if (side === 'SHORT') {
    return Number(((entry - exit) * size).toFixed(2));
  }

  return '';
}

function calcResultPercent(openPosition, closeRow) {
  const entry = cleanNumber(openPosition?.entry || closeRow?.entry);
  const size = cleanNumber(openPosition?.size || closeRow?.size);
  const result = cleanNumber(closeRow?.result);

  if (entry === '' || size === '' || result === '') return '';

  const notional = entry * size;

  if (!Number.isFinite(notional) || notional === 0) return '';

  return Number(((result / notional) * 100).toFixed(2));
}

function pnlTelegramLine(row) {
  const result = cleanNumber(row?.result);
  const resultPct = cleanNumber(row?.result_pct);

  if (result === '') return '';

  const emoji = result > 0 ? '😊' : result < 0 ? '😞' : '😐';
  const money = formatMoney(result);
  const pct = resultPct === '' ? '' : ` / ${formatPercent(resultPct)}`;

  return `${emoji} <b>${money}${pct}</b>`;
}

function enrichCloseRowFromOpenPosition(closeRow, openPosition) {
  if (!openPosition) return closeRow;

  const enriched = {
    ...closeRow,
    trade_id: closeRow.trade_id || openPosition.trade_id || makeTradeId(openPosition.symbol, openPosition.side),
    symbol: closeRow.symbol || openPosition.symbol || '',
    side: closeRow.side || openPosition.side || '',
    entry: closeRow.entry !== '' ? closeRow.entry : openPosition.entry || '',
    size: closeRow.size !== '' ? closeRow.size : openPosition.size || '',
    target: closeRow.target !== '' ? closeRow.target : openPosition.target || '',
    stop: closeRow.stop !== '' ? closeRow.stop : openPosition.stop || '',
    status: 'closed',
  };

  if (enriched.result === '') {
    enriched.result = calcResult(openPosition, enriched);
  }

  if (enriched.result_pct === '' || enriched.result_pct === undefined) {
    enriched.result_pct = calcResultPercent(openPosition, enriched);
  }

  return enriched;
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function moneyClass(value) {
  const n = cleanNumber(value);
  if (n === '') return '';
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'neutral';
}

function sideClass(side) {
  const s = String(side || '').toUpperCase();
  if (s === 'LONG') return 'long';
  if (s === 'SHORT') return 'short';
  return '';
}

function num(value, decimals = 2) {
  const n = cleanNumber(value);
  if (n === '') return '';
  return n.toFixed(decimals);
}

function pct(value) {
  const n = cleanNumber(value);
  if (n === '') return '';
  return `${n.toFixed(2)}%`;
}

function safeDateText(value) {
  return String(value || '').replace('T', ' ').slice(0, 19);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';

  return header.split(';').reduce((cookies, part) => {
    const [key, ...valueParts] = part.trim().split('=');

    if (!key) return cookies;

    cookies[key] = decodeURIComponent(valueParts.join('=') || '');
    return cookies;
  }, {});
}

function isDashboardAuthorized(req) {
  const keyFromQuery = String(req.query.key || '').trim();
  const cookies = parseCookies(req);
  const keyFromCookie = String(cookies.vixale_dashboard_key || '').trim();
  const dashboardKey = String(DASHBOARD_KEY || '').trim();

  return Boolean(dashboardKey) && (keyFromQuery === dashboardKey || keyFromCookie === dashboardKey);
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OLD TEXT ALERT PARSER — keeps older TV scripts working
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseTradingViewMessage(message) {
  const raw = String(message || '').trim();

  let symbol = '';
  let side = '';
  let event = '';

  const firstLine = raw.split('\n')[0] || '';

  const headerMatch = raw.match(/([A-Z0-9:_\.\-!]+)\s+(LONG|SHORT)/i);
  if (headerMatch) {
    symbol = headerMatch[1].trim().replace(/^[^A-Z0-9]+/i, '');
    side = headerMatch[2].trim().toUpperCase();
  }

  if (/CANCELED|CANCELLED/i.test(firstLine) || /CANCELED|CANCELLED/i.test(raw)) {
    event = 'CANCEL';
  } else if (/Entry filled/i.test(raw) || /\bFILLED\b/i.test(firstLine)) {
    event = 'FILL';
  } else if (/EOD CLOSE/i.test(firstLine)) {
    event = 'EOD';
  } else if (/TARGET HIT|TAKE PROFIT|\bTP\b/i.test(firstLine) || /ЦЕЛЬ/i.test(firstLine) || /Profit:/i.test(raw)) {
    event = 'TP';
  } else if (/STOP LOSS|\bSTOP\b|\bSL\b/i.test(firstLine) || /СТОП/i.test(firstLine) || /Actual loss:/i.test(raw)) {
    event = 'SL';
  } else if (/SETUP/i.test(firstLine)) {
    event = 'SETUP';
  } else {
    event = 'UNKNOWN';
  }

  const entry =
    cleanNumber(extract(/Entry filled:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Entry:\s*([0-9\.,-]+)/i, raw));

  const size =
    cleanNumber(extract(/Suggested Size:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Size:\s*([0-9\.,-]+)/i, raw));

  const target =
    cleanNumber(extract(/ЦЕЛЬ:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Target:\s*([0-9\.,-]+)/i, raw));

  const filled =
    cleanNumber(extract(/Filled:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Entry filled:\s*([0-9\.,-]+)/i, raw));

  const close =
    cleanNumber(extract(/Close:\s*([0-9\.,-]+)/i, raw));

  const stop =
    cleanNumber(extract(/СТОП на закрытие (?:ниже|выше)\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Stop:\s*([0-9\.,-]+)/i, raw));

  let exit = '';
  if (event === 'TP') exit = filled || close;
  if (event === 'SL' || event === 'EOD') exit = close || filled;

  let result = '';

  if (event === 'TP') {
    result = cleanNumber(extract(/Profit:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
  }

  if (event === 'SL') {
    const loss = cleanNumber(extract(/Actual loss:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
    result = loss === '' ? '' : -Math.abs(loss);
  }

  if (event === 'EOD') {
    result = cleanNumber(extract(/Result:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
  }

  const status =
    event === 'SETUP' ? 'pending' :
    event === 'FILL' ? 'open' :
    event === 'TP' ? 'closed' :
    event === 'SL' ? 'closed' :
    event === 'EOD' ? 'closed' :
    event === 'CANCEL' ? 'canceled' :
    'unknown';

  const trade_id = makeTradeId(symbol, side);

  return {
    timestamp: nowNy(),
    trade_id,
    symbol,
    side,
    event,
    entry,
    size,
    target,
    stop,
    exit,
    result,
    result_pct: '',
    status,
    raw,
    raw_event: event,
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEW JSON ALERT PARSER — for new FVG live TV script
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseJsonTradingViewAlert(data) {
  const eventRaw = String(data.event || '').toUpperCase();

  const eventMap = {
    SETUP: 'SETUP',
    ENTRY_FILL: 'FILL',
    TP: 'TP',
    CLOSE_STOP: 'SL',

    EOD_CLOSE: 'EOD',
    NEW_DAY_EMERGENCY_CLOSE: 'EOD',

    EOD_RESET: 'CANCEL',
    NEW_DAY_RESET: 'CANCEL',
    CANCEL_REPLACE: 'CANCEL',
  };

  const event = eventMap[eventRaw] || eventRaw || 'UNKNOWN';

  const symbol = String(data.symbol || '').trim();

  // If side is missing on EOD_RESET / NEW_DAY_RESET, leave side blank.
  // That lets us remove all pending rows by symbol.
  const side = data.side ? String(data.side).trim().toUpperCase() : '';

  const entry = cleanNumber(data.entry);
  const size = cleanNumber(data.qty);
  const target = cleanNumber(data.target);
  const stop = cleanNumber(data.stop);
  const price = cleanNumber(data.price);

  let exit = '';
  if (event === 'TP' || event === 'SL' || event === 'EOD') {
    exit = price;
  }

  let result = '';

  const trade_id = makeTradeId(symbol, side);

  const status =
    event === 'SETUP' ? 'pending' :
    event === 'FILL' ? 'open' :
    event === 'TP' || event === 'SL' || event === 'EOD' ? 'closed' :
    event === 'CANCEL' ? 'canceled' :
    'unknown';

  return {
    timestamp: nowNy(),
    trade_id,
    symbol,
    side,
    event,
    entry,
    size,
    target,
    stop,
    exit,
    result,
    result_pct: '',
    status,
    raw: JSON.stringify(data, null, 2),

    box_top: data.box_top ?? '',
    box_bottom: data.box_bottom ?? '',
    min_box_atr: data.min_box_atr ?? '',
    depth_pct: data.depth_pct ?? '',
    tp_atr: data.tp_atr ?? '',
    qty_mode: data.qty_mode ?? '',
    risk_pct: data.risk_pct ?? '',
    max_position_pct: data.max_position_pct ?? '',
    raw_event: eventRaw,
    reason: data.reason ?? '',
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRETTY TELEGRAM FORMATTER
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatTelegramMessage(row, originalMessage) {
  if (!row || row.event === 'UNKNOWN') return originalMessage;

  const titleBase = `${row.symbol || ''} ${row.side || ''}`.trim();
  const pnlLine = pnlTelegramLine(row);

  if (row.event === 'SETUP') {
    const emoji = row.side === 'SHORT' ? '🔴' : '🟢';

    return [
      `${emoji} <b>${titleBase} SETUP</b>`,
      '',
      row.entry !== '' ? `📍 Entry Limit: <b>${row.entry}</b>` : '',
      row.target !== '' ? `🎯 Target: <b>${row.target}</b>` : '',
      row.stop !== '' ? `⛔ Stop: close beyond <b>${row.stop}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'FILL') {
    return [
      `🎉 <b>${titleBase} FILLED</b>`,
      '',
      row.entry !== '' ? `✅ Entry: <b>${row.entry}</b>` : '',
      row.target !== '' ? `🎯 Target: <b>${row.target}</b>` : '',
      row.stop !== '' ? `⛔ Stop: close beyond <b>${row.stop}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'TP') {
    return [
      `🎯 <b>${titleBase} TAKE PROFIT HIT</b>`,
      '',
      row.exit !== '' ? `✅ Exit Price: <b>${row.exit}</b>` : '',
      row.entry !== '' ? `Entry: <b>${row.entry}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
      pnlLine,
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'SL') {
    return [
      `⛔ <b>${titleBase} CLOSE STOP</b>`,
      '',
      row.exit !== '' ? `❌ Exit Close: <b>${row.exit}</b>` : '',
      row.entry !== '' ? `Entry: <b>${row.entry}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
      pnlLine,
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'EOD') {
    return [
      `⏰ <b>${titleBase || row.symbol} EOD CLOSE</b>`,
      '',
      row.exit !== '' ? `Exit Price: <b>${row.exit}</b>` : '',
      row.entry !== '' ? `Entry: <b>${row.entry}</b>` : '',
      row.size !== '' ? `Qty: <b>${row.size}</b>` : '',
      pnlLine,
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'CANCEL') {
    const resetText = row.raw_event === 'EOD_RESET'
      ? 'EOD pending orders canceled'
      : row.raw_event === 'NEW_DAY_RESET'
        ? 'New day reset: old pending orders canceled'
        : 'Setup canceled / replaced';

    return [
      `⚪ <b>${titleBase || row.symbol} ${resetText}</b>`,
      '',
      row.reason ? `Reason: ${row.reason}` : '',
    ].filter(Boolean).join('\n');
  }

  return originalMessage;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOOGLE SHEETS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getSheetsClient() {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.log('Google Sheets env vars missing. Skipping sheet logging.');
    return null;
  }

  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function getSheetIdByName(sheets, sheetName) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEET_ID,
  });

  const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
  return sheet ? sheet.properties.sheetId : null;
}

async function readSheet(sheets, sheetName, range = 'A:Z') {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
  });

  return response.data.values || [];
}

function findRowIndexByTradeId(values, tradeId) {
  if (!tradeId) return -1;

  for (let i = 1; i < values.length; i++) {
    if ((values[i][0] || '').toUpperCase() === tradeId.toUpperCase()) {
      return i + 1;
    }
  }

  return -1;
}

async function deleteSheetRow(sheets, sheetName, rowNumber) {
  if (!rowNumber || rowNumber < 2) return;

  const sheetId = await getSheetIdByName(sheets, sheetName);
  if (sheetId === null) {
    console.log(`Sheet not found: ${sheetName}`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });

  console.log(`Deleted row ${rowNumber} from ${sheetName}`);
}

async function removeRowByTradeId(sheets, sheetName, tradeId) {
  const values = await readSheet(sheets, sheetName);
  const rowNumber = findRowIndexByTradeId(values, tradeId);

  if (rowNumber < 0) return null;

  const existing = values[rowNumber - 1];
  await deleteSheetRow(sheets, sheetName, rowNumber);

  return existing;
}

async function removePendingRowsBySymbol(sheets, symbol) {
  if (!symbol) return 0;

  const values = await readSheet(sheets, PENDING_SHEET, 'A:J');
  let removedCount = 0;

  for (let i = values.length - 1; i >= 1; i--) {
    const row = values[i];
    const rowSymbol = String(row[2] || '').toUpperCase();

    if (rowSymbol === String(symbol).toUpperCase()) {
      await deleteSheetRow(sheets, PENDING_SHEET, i + 1);
      removedCount++;
    }
  }

  console.log(`Pending rows removed by symbol ${symbol}: ${removedCount}`);
  return removedCount;
}

async function appendToTradesSheet(sheets, row) {
  if (!['FILL', 'TP', 'SL', 'EOD'].includes(row.event)) {
    console.log('Trades append skipped for non-executed event:', row.event);
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${TRADES_SHEET}!A:K`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        row.timestamp,
        row.symbol,
        row.side,
        row.event,
        row.entry,
        row.size,
        row.target || row.exit,
        row.stop,
        row.result,
        row.status,
        row.raw,
      ]],
    },
  });

  console.log('Trades row appended:', row.symbol, row.side, row.event);
}

async function upsertPending(sheets, row) {
  if (!row.trade_id) return;

  const values = await readSheet(sheets, PENDING_SHEET, 'A:J');
  const sheetRow = findRowIndexByTradeId(values, row.trade_id);
  const existing = sheetRow > 0 ? values[sheetRow - 1] : [];

  const pendingRow = [
    row.trade_id,
    row.timestamp || existing[1] || '',
    row.symbol || existing[2] || '',
    row.side || existing[3] || '',
    'pending',
    row.entry || existing[5] || '',
    row.size || existing[6] || '',
    row.target || existing[7] || '',
    row.stop || existing[8] || '',
    row.raw || existing[9] || '',
  ];

  if (sheetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${PENDING_SHEET}!A${sheetRow}:J${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [pendingRow] },
    });

    console.log('Pending updated:', row.trade_id);
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${PENDING_SHEET}!A:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [pendingRow] },
    });

    console.log('Pending appended:', row.trade_id);
  }
}

async function upsertOpenPosition(sheets, row, pendingRow = null) {
  if (!row.trade_id) return;

  const values = await readSheet(sheets, OPEN_POSITIONS_SHEET, 'A:L');
  const sheetRow = findRowIndexByTradeId(values, row.trade_id);
  const existing = sheetRow > 0 ? values[sheetRow - 1] : [];

  const openTime = row.timestamp || existing[1] || pendingRow?.[1] || '';
  const symbol = row.symbol || existing[2] || pendingRow?.[2] || '';
  const side = row.side || existing[3] || pendingRow?.[3] || '';
  const entry = row.entry || existing[5] || pendingRow?.[5] || '';
  const size = row.size || existing[6] || pendingRow?.[6] || '';
  const target = row.target || existing[7] || pendingRow?.[7] || '';
  const stop = row.stop || existing[8] || pendingRow?.[8] || '';
  const raw = row.raw || existing[11] || pendingRow?.[9] || '';

  let targetRowNumber = sheetRow;

  const openRowWithoutFormulas = [
    row.trade_id,
    openTime,
    symbol,
    side,
    'open',
    entry,
    size,
    target,
    stop,
    '',
    '',
    raw,
  ];

  if (sheetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${OPEN_POSITIONS_SHEET}!A${sheetRow}:L${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [openRowWithoutFormulas] },
    });

    targetRowNumber = sheetRow;
    console.log('Open position updated:', row.trade_id);
  } else {
    const appendResponse = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${OPEN_POSITIONS_SHEET}!A:L`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [openRowWithoutFormulas] },
    });

    targetRowNumber = parseUpdatedRowNumber(appendResponse.data.updates.updatedRange);
    console.log('Open position appended:', row.trade_id, 'row', targetRowNumber);
  }

  if (targetRowNumber) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${OPEN_POSITIONS_SHEET}!J${targetRowNumber}:K${targetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          googleFinanceSymbolFormula(targetRowNumber),
          unrealizedFormula(targetRowNumber),
        ]],
      },
    });
  }
}

async function removeOpenPosition(sheets, tradeId) {
  const removed = await removeRowByTradeId(sheets, OPEN_POSITIONS_SHEET, tradeId);
  if (!removed) return null;

  return {
    trade_id: removed[0] || '',
    open_time: removed[1] || '',
    symbol: removed[2] || '',
    side: removed[3] || '',
    status: removed[4] || '',
    entry: removed[5] || '',
    size: removed[6] || '',
    target: removed[7] || '',
    stop: removed[8] || '',
    last_price: removed[9] || '',
    unrealized_p_l: removed[10] || '',
    raw_open: removed[11] || '',
  };
}

async function appendClosedTrade(sheets, openPosition, closeRow) {
  const closedRow = [
    closeRow.trade_id,
    openPosition?.open_time || '',
    closeRow.timestamp,
    closeRow.symbol || openPosition?.symbol || '',
    closeRow.side || openPosition?.side || '',
    openPosition?.entry || closeRow.entry || '',
    closeRow.exit || '',
    openPosition?.size || closeRow.size || '',
    closeRow.result,
    closeRow.event,
    openPosition?.raw_open || '',
    closeRow.raw,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${CLOSED_TRADES_SHEET}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [closedRow] },
  });

  console.log('Closed trade appended:', closeRow.trade_id, closeRow.event, closeRow.result);
}

async function cleanupLegacyPositionIfExists(sheets, tradeId) {
  try {
    await removeRowByTradeId(sheets, LEGACY_POSITIONS_SHEET, tradeId);
  } catch (err) {
    console.log('Legacy Positions cleanup skipped:', err.message);
  }
}

async function processLedger(row) {
  const sheets = await getSheetsClient();

  if (!sheets) return row;

  if (!row || row.event === 'UNKNOWN') return row;

  if (row.event === 'SETUP') {
    if (!row.trade_id) return row;
    await upsertPending(sheets, row);
    return row;
  }

  if (row.event === 'FILL') {
    if (!row.trade_id) return row;

    const pendingRow = await removeRowByTradeId(sheets, PENDING_SHEET, row.trade_id);
    await cleanupLegacyPositionIfExists(sheets, row.trade_id);
    await upsertOpenPosition(sheets, row, pendingRow);
    await appendToTradesSheet(sheets, row);
    return row;
  }

  if (row.event === 'CANCEL') {
    if (row.trade_id) {
      await removeRowByTradeId(sheets, PENDING_SHEET, row.trade_id);
      await cleanupLegacyPositionIfExists(sheets, row.trade_id);
      return row;
    }

    if (row.symbol) {
      await removePendingRowsBySymbol(sheets, row.symbol);
      return row;
    }

    return row;
  }

  if (row.event === 'TP' || row.event === 'SL' || row.event === 'EOD') {
    if (!row.trade_id) return row;

    const openPosition = await removeOpenPosition(sheets, row.trade_id);
    await cleanupLegacyPositionIfExists(sheets, row.trade_id);

    const enrichedCloseRow = enrichCloseRowFromOpenPosition(row, openPosition);

    await appendToTradesSheet(sheets, enrichedCloseRow);
    await appendClosedTrade(sheets, openPosition, enrichedCloseRow);

    return enrichedCloseRow;
  }

  return row;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TELEGRAM
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sendTelegram(message) {
  if (!TOKEN || !CHAT_ID) {
    console.log('Telegram env vars missing. Skipping Telegram.');
    return;
  }

  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

  const payload = {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data = await response.json();
  console.log('Telegram response:', JSON.stringify(data));

  if (!data.ok && data.description && String(data.description).includes("can't parse entities")) {
    console.log('Telegram HTML parse failed. Retrying without parse_mode.');

    const fallbackPayload = {
      chat_id: CHAT_ID,
      text: message,
      disable_web_page_preview: true,
    };

    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fallbackPayload),
    });

    data = await response.json();
    console.log('Telegram fallback response:', JSON.stringify(data));
  }
}


//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD DATA
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseOpenPositionRow(row) {
  const entry = cleanNumber(row[5]);
  const size = cleanNumber(row[6]);
  const target = cleanNumber(row[7]);
  const stop = cleanNumber(row[8]);
  const last = cleanNumber(row[9]);
  const openPnl = cleanNumber(row[10]);
  const side = String(row[3] || '').toUpperCase();

  let toTp = '';
  let toStop = '';
  let exposure = '';

  if (entry !== '' && size !== '') {
    exposure = Number((entry * size).toFixed(2));
  }

  if (last !== '' && last !== 0 && target !== '') {
    if (side === 'LONG') {
      toTp = Number((((target - last) / last) * 100).toFixed(2));
    } else if (side === 'SHORT') {
      toTp = Number((((last - target) / last) * 100).toFixed(2));
    }
  }

  if (last !== '' && last !== 0 && stop !== '') {
    if (side === 'LONG') {
      toStop = Number((((last - stop) / last) * 100).toFixed(2));
    } else if (side === 'SHORT') {
      toStop = Number((((stop - last) / last) * 100).toFixed(2));
    }
  }

  return {
    trade_id: row[0] || '',
    open_time: row[1] || '',
    symbol: row[2] || '',
    side,
    status: row[4] || '',
    entry,
    size,
    target,
    stop,
    last,
    open_pnl: openPnl,
    to_tp: toTp,
    to_stop: toStop,
    exposure,
  };
}

function parsePendingRow(row) {
  return {
    trade_id: row[0] || '',
    timestamp: row[1] || '',
    symbol: row[2] || '',
    side: String(row[3] || '').toUpperCase(),
    status: row[4] || '',
    entry: cleanNumber(row[5]),
    size: cleanNumber(row[6]),
    target: cleanNumber(row[7]),
    stop: cleanNumber(row[8]),
  };
}

function parseClosedTradeRow(row) {
  return {
    trade_id: row[0] || '',
    open_time: row[1] || '',
    close_time: row[2] || '',
    symbol: row[3] || '',
    side: String(row[4] || '').toUpperCase(),
    entry: cleanNumber(row[5]),
    exit: cleanNumber(row[6]),
    size: cleanNumber(row[7]),
    result: cleanNumber(row[8]),
    event: row[9] || '',
  };
}

async function getDashboardData() {
  const sheets = await getSheetsClient();

  if (!sheets) {
    throw new Error('Google Sheets client is not configured.');
  }

  const [openValues, pendingValues, closedValues] = await Promise.all([
    readSheet(sheets, OPEN_POSITIONS_SHEET, 'A:L'),
    readSheet(sheets, PENDING_SHEET, 'A:J'),
    readSheet(sheets, CLOSED_TRADES_SHEET, 'A:L'),
  ]);

  const openPositions = openValues
    .slice(1)
    .filter(row => row[0])
    .map(parseOpenPositionRow);

  const pendingOrders = pendingValues
    .slice(1)
    .filter(row => row[0])
    .map(parsePendingRow);

  const closedTradesAll = closedValues
    .slice(1)
    .filter(row => row[0])
    .map(parseClosedTradeRow)
    .filter(row => row.result !== '' && row.entry !== '' && row.exit !== '' && row.size !== '');

  closedTradesAll.sort((a, b) => String(b.close_time).localeCompare(String(a.close_time)));

  const today = nowNy().slice(0, 10);

  const openPnl = openPositions.reduce((sum, row) => sum + (cleanNumber(row.open_pnl) || 0), 0);
  const exposure = openPositions.reduce((sum, row) => sum + (cleanNumber(row.exposure) || 0), 0);
  const totalClosedPnl = closedTradesAll.reduce((sum, row) => sum + (cleanNumber(row.result) || 0), 0);

  const closedToday = closedTradesAll.filter(row => String(row.close_time || '').slice(0, 10) === today);
  const closedPnlToday = closedToday.reduce((sum, row) => sum + (cleanNumber(row.result) || 0), 0);

  const winners = closedTradesAll.filter(row => cleanNumber(row.result) > 0).length;
  const winRate = closedTradesAll.length > 0 ? (winners / closedTradesAll.length) * 100 : 0;

  return {
    updated_at: nowNy(),
    open_positions: openPositions,
    pending_orders: pendingOrders,
    recent_closed_trades: closedTradesAll.slice(0, 20),
    summary: {
      open_count: openPositions.length,
      pending_count: pendingOrders.length,
      open_pnl: Number(openPnl.toFixed(2)),
      closed_pnl_today: Number(closedPnlToday.toFixed(2)),
      total_closed_pnl: Number(totalClosedPnl.toFixed(2)),
      win_rate: Number(winRate.toFixed(2)),
      exposure: Number(exposure.toFixed(2)),
    },
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC LANDING PAGE HTML
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderLandingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale | Watch a Live Trading System</title>
  <meta name="description" content="Watch a live trading system, get Telegram signals, connect Interactive Brokers / TWS, or build your own trading bot with Vixale." />
  <style>
    :root {
      --bg: #fbfcfb;
      --paper: #ffffff;
      --paper-soft: #f4f7f4;
      --ink: #101413;
      --muted: #68736f;
      --muted-2: #8b9691;
      --line: #e3e9e5;
      --line-2: #d7e1db;
      --green: #0bcf74;
      --green-dark: #078f51;
      --green-soft: #e9fff4;
      --shadow: 0 24px 70px rgba(16, 20, 19, 0.08);
      --shadow-soft: 0 14px 40px rgba(16, 20, 19, 0.06);
    }

    * {
      box-sizing: border-box;
    }

    /* Vixale no-bold typography reset */
    b, strong { font-weight: 500; }
    button, a, input, td, th, div, p, span, h1, h2, h3 {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }


    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 20% 0%, rgba(11, 207, 116, 0.14), transparent 30%),
        radial-gradient(circle at 86% 8%, rgba(11, 207, 116, 0.10), transparent 28%),
        linear-gradient(180deg, #fbfcfb 0%, #f6f9f6 58%, #ffffff 100%);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .hero-title-link {
      display: inline-block;
      color: inherit;
      text-decoration: none;
      cursor: pointer;
      margin-top: -2px;
    }

    .hero-title-link h1,
    .hero-title-link .accent {
      transition: color .18s ease, transform .18s ease;
    }

    .hero-title-link:hover h1 {
      transform: translateY(-1px);
    }

    .hero-title-link:hover .accent {
      color: #06b765;
    }

    .nav {
      position: sticky;
      top: 0;
      z-index: 30;
      background: rgba(251, 252, 251, 0.78);
      backdrop-filter: blur(22px);
      border-bottom: 1px solid rgba(227, 233, 229, 0.74);
    }

    .nav-inner {
      max-width: 1160px;
      margin: 0 auto;
      padding: 17px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 22px;
    }

    .brand-lockup {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: var(--ink);
    }

    .brand-mark {
      position: relative;
      width: 34px;
      height: 34px;
      border-radius: 12px;
      background: #101413;
      box-shadow: 0 10px 26px rgba(16, 20, 19, 0.10);
      overflow: hidden;
    }

    .brand-mark::before,
    .brand-mark::after {
      content: "";
      position: absolute;
      bottom: 8px;
      width: 7px;
      height: 20px;
      background: #fff;
      border-radius: 99px;
      transform-origin: bottom center;
    }

    .brand-mark::before {
      left: 10px;
      transform: rotate(-24deg);
    }

    .brand-mark::after {
      right: 10px;
      transform: rotate(24deg);
      background: var(--green);
    }

    .brand-word {
      display: flex;
      flex-direction: column;
      gap: 2px;
      line-height: 1;
    }

    .brand-name {
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 0.16em;
    }

    .brand-tagline {
      color: var(--muted-2);
      font-size: 11px;
      font-weight: 420;
      letter-spacing: 0.02em;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 22px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 480;
    }

    .nav-links a:hover {
      color: var(--ink);
    }

    .nav-cta {
      padding: 10px 15px;
      border: 1px solid var(--line-2);
      border-radius: 999px;
      color: var(--ink) !important;
      background: rgba(255,255,255,0.72);
      box-shadow: 0 8px 24px rgba(16, 20, 19, 0.04);
    }

    .wrap {
      max-width: 1160px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .hero {
      min-height: 500px;
      display: grid;
      grid-template-columns: 1.02fr 0.98fr;
      gap: 38px;
      align-items: center;
      padding: 48px 0 8px;
    }

    .badge {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 15px;
      border: 1px solid rgba(184, 216, 198, 0.9);
      border-radius: 999px;
      background: rgba(255,255,255,0.82);
      color: #26302c;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 16px 42px rgba(16, 20, 19, 0.06);
      margin-bottom: 14px;
      overflow: hidden;
      cursor: pointer;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }

    .badge:hover {
      transform: translateY(-1px);
      border-color: rgba(11, 207, 116, 0.45);
      box-shadow: 0 18px 46px rgba(16, 20, 19, 0.08);
    }

    .badge::after {
      content: "";
      position: absolute;
      inset: -1px;
      background: linear-gradient(90deg, transparent, rgba(11,207,116,0.12), transparent);
      transform: translateX(-110%);
      animation: badgeSweep 4.8s ease-in-out infinite;
    }

    .badge span,
    .badge b {
      position: relative;
      z-index: 1;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 7px rgba(11, 207, 116, 0.13);
      animation: livePulse 2.2s ease-in-out infinite;
    }

    h1 {
      margin: 0;
      max-width: 760px;
      font-size: clamp(34px, 3.8vw, 48px);
      line-height: 1.05;
      letter-spacing: -1.7px;
      font-weight: 500;
      white-space: nowrap;
    }

    .smart-slogan {
      margin-top: 13px;
      color: #26302c;
      font-size: 17px;
      line-height: 1.45;
      letter-spacing: -0.35px;
      font-weight: 430;
      max-width: 650px;
    }

    .accent {
      color: var(--green-dark);
    }

    .hero-text {
      max-width: 650px;
      margin: 18px 0 0;
      color: var(--muted);
      font-size: 19px;
      line-height: 1.66;
      font-weight: 400;
    }

    .hero-note {
      max-width: 650px;
      margin-top: 13px;
      color: #4a5551;
      font-size: 15px;
      line-height: 1.58;
      font-weight: 400;
    }

    .hero-note strong {
      color: var(--ink);
      font-weight: 500;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      max-width: 680px;
      margin-top: 18px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 13px 16px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: -0.1px;
      border: 1px solid var(--line-2);
      background: rgba(255,255,255,0.72);
      color: var(--ink);
      box-shadow: 0 10px 30px rgba(16, 20, 19, 0.04);
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease;
      white-space: nowrap;
    }

    .btn:hover {
      transform: translateY(-1px);
      border-color: #c7d4cc;
      box-shadow: 0 16px 40px rgba(16, 20, 19, 0.07);
      background: #fff;
    }

    .btn-primary {
      background: var(--ink);
      border-color: var(--ink);
      color: #fff;
    }

    .btn-primary:hover {
      background: #000;
      border-color: #000;
    }

    .btn-green {
      background: var(--green-soft);
      border-color: #bfead5;
      color: #075f39;
    }

    .visual {
      position: relative;
    }

    .visual::before {
      content: "";
      position: absolute;
      width: 420px;
      height: 420px;
      right: -80px;
      top: -70px;
      background: radial-gradient(circle, rgba(11,207,116,0.18), transparent 64%);
      border-radius: 999px;
      z-index: -1;
    }

    .product-card {
      background: rgba(255,255,255,0.82);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
      overflow: hidden;
      backdrop-filter: blur(18px);
    }

    .product-top {
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--line);
    }

    .window-dots {
      display: flex;
      gap: 7px;
    }

    .window-dots span {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #d6ddd8;
    }

    .live-pill {
      color: #087246;
      background: #eafff4;
      border: 1px solid #c8efdb;
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 500;
    }

    .mock-body {
      padding: 16px;
    }

    .mock-title {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 14px;
    }

    .mock-title h2 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: -0.65px;
      font-weight: 500;
    }

    .mock-title p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .stat {
      border: 1px solid var(--line);
      background: #fbfdfb;
      border-radius: 18px;
      padding: 13px;
    }

    .stat-label {
      color: var(--muted-2);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .7px;
      font-weight: 500;
    }

    .stat-value {
      margin-top: 9px;
      font-size: 25px;
      font-weight: 500;
      letter-spacing: -0.8px;
    }

    .positive {
      color: var(--green-dark);
    }

    .negative {
      color: #d7424f;
    }

    .chart {
      height: 104px;
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background:
        linear-gradient(180deg, rgba(11,207,116,0.08), transparent),
        linear-gradient(90deg, rgba(16,20,19,0.04) 1px, transparent 1px),
        linear-gradient(rgba(16,20,19,0.04) 1px, transparent 1px);
      background-size: auto, 44px 44px, 44px 44px;
      position: relative;
      overflow: hidden;
    }

    .chart svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .rows {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr .85fr .85fr .9fr;
      gap: 10px;
      padding: 11px 14px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      color: #59645f;
    }

    .row:last-child {
      border-bottom: 0;
    }

    .row strong {
      color: var(--ink);
      font-weight: 500;
    }

    .section {
      padding: 28px 0;
    }

    .section-head {
      max-width: 720px;
      margin-bottom: 12px;
    }

    .section h2 {
      margin: 0 0 8px;
      font-size: clamp(24px, 2.55vw, 34px);
      line-height: 1.08;
      letter-spacing: -0.95px;
      font-weight: 500;
    }

    #systems .section-head h2 {
      font-size: clamp(23px, 2.25vw, 30px);
      letter-spacing: -0.75px;
    }

    #simple-steps.section {
      padding-top: 18px;
      padding-bottom: 0;
    }

    #simple-steps .section-head h2 {
      font-size: clamp(22px, 2.0vw, 27px);
      letter-spacing: -0.7px;
    }

    #access.section {
      padding-top: 0;
    }

    .section .lead {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.5;
      font-weight: 400;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: rgba(255,255,255,0.74);
      border: 1px solid var(--line);
      border-radius: 26px;
      padding: 22px;
      box-shadow: var(--shadow-soft);
    }

    .card-number {
      color: var(--green-dark);
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 22px;
    }

    .card h3 {
      margin: 0 0 10px;
      font-size: 21px;
      letter-spacing: -0.45px;
      font-weight: 500;
    }

    .card p {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
    }

    .flow {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .flow-step {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 22px;
      box-shadow: var(--shadow-soft);
    }

    .flow-step span {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--green-soft);
      color: var(--green-dark);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 12px;
    }

    .flow-step h3 {
      margin: 0 0 8px;
      font-size: 18px;
      letter-spacing: -0.35px;
      font-weight: 500;
    }

    .flow-step p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.55;
    }

    .access {
      background: linear-gradient(135deg, rgba(233, 255, 244, 0.92), rgba(255, 255, 255, 0.96));
      color: var(--ink);
      border: 1px solid #cfe9dc;
      border-radius: 34px;
      padding: 30px;
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 24px;
      align-items: center;
      box-shadow: 0 28px 80px rgba(16,20,19,.08);
    }

    .access h2 {
      margin: 0 0 10px;
      font-size: clamp(27px, 3.1vw, 38px);
      line-height: 1.06;
      letter-spacing: -1.65px;
      font-weight: 500;
    }

    .access p {
      margin: 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.56;
      max-width: 690px;
    }

    .access .small {
      margin-top: 14px;
      color: #5c6863;
      font-size: 13px;
    }

    .access-actions {
      display: grid;
      gap: 12px;
    }

    .access-actions .btn {
      background: var(--green-soft);
      border-color: #bfead5;
      color: #075f39;
      box-shadow: 0 12px 34px rgba(11,207,116,0.10);
    }

    .access-actions .btn.secondary {
      background: rgba(255,255,255,0.78);
      color: var(--ink);
      border-color: var(--line-2);
      box-shadow: 0 10px 30px rgba(16,20,19,0.04);
    }

    .footer {
      padding: 30px 0 38px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      font-size: 11.5px;
      line-height: 1.65;
    }

    .footer strong {
      color: var(--ink);
      font-weight: 500;
    }



    .card-action {
      margin-top: 18px;
      width: 100%;
      min-height: 44px;
      font-size: 13px;
      border-radius: 14px;
    }

    .watch-block {
      background: rgba(255,255,255,0.74);
      border: 1px solid var(--line);
      border-radius: 32px;
      padding: 28px;
      box-shadow: var(--shadow-soft);
      display: grid;
      grid-template-columns: 1.05fr .95fr;
      gap: 22px;
      align-items: center;
    }

    .watch-points {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .watch-point {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px;
      background: #fbfdfb;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .watch-point strong {
      display: block;
      color: var(--ink);
      margin-bottom: 4px;
    }

    .partner-box {
      background: linear-gradient(135deg, rgba(16,20,19,0.98), rgba(29,39,34,0.96));
      color: #fff;
      border-radius: 34px;
      padding: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: start;
      box-shadow: 0 28px 90px rgba(16,20,19,0.14);
    }

    .partner-box h2,
    .partner-box .lead,
    .partner-box p {
      color: #fff;
    }

    .partner-box .lead,
    .partner-box p {
      color: rgba(255,255,255,0.74);
    }

    .partner-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .partner-list div {
      padding: 12px 13px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.84);
      font-size: 13px;
      line-height: 1.4;
    }


    .reason-box {
      background: linear-gradient(135deg, rgba(255,255,255,0.86), rgba(233,255,244,0.72));
      border: 1px solid #cfe9dc;
      border-radius: 34px;
      padding: 30px;
      display: grid;
      grid-template-columns: .92fr 1.08fr;
      gap: 26px;
      align-items: start;
      box-shadow: 0 24px 80px rgba(16,20,19,0.08);
    }

    .reason-box h2 {
      margin: 0 0 10px;
      font-size: clamp(27px, 3.0vw, 38px);
      line-height: 1.08;
      letter-spacing: -1.25px;
      font-weight: 500;
    }

    .reason-copy {
      background: rgba(255,255,255,0.72);
      border: 1px solid var(--line);
      border-radius: 26px;
      padding: 24px;
      box-shadow: 0 16px 46px rgba(16,20,19,0.05);
    }

    .reason-copy h3 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.22;
      letter-spacing: -0.55px;
      font-weight: 500;
    }

    .reason-copy p {
      margin: 0 0 16px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
    }

    .reason-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }

    .reason-item {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 10px;
      align-items: start;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fbfdfb;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .reason-item span {
      width: 28px;
      height: 28px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--green-soft);
      color: var(--green-dark);
      font-weight: 500;
      font-size: 13px;
    }

    .reason-item strong {
      display: block;
      color: var(--ink);
      margin-bottom: 2px;
      font-weight: 500;
    }


    .strategy-form-box {
      background: rgba(255,255,255,0.78);
      border: 1px solid var(--line);
      border-radius: 34px;
      padding: 30px;
      box-shadow: var(--shadow-soft);
      display: grid;
      grid-template-columns: .95fr 1.05fr;
      gap: 26px;
      align-items: start;
    }

    .strategy-form-copy h2 {
      margin: 0 0 10px;
      font-size: clamp(27px, 3.0vw, 38px);
      line-height: 1.08;
      letter-spacing: -1.25px;
      font-weight: 500;
    }

    .strategy-form-copy p {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.62;
    }

    .soft-list {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }

    .soft-list div {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fbfdfb;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
      padding: 12px 13px;
    }

    .soft-list strong {
      color: var(--ink);
      font-weight: 500;
    }

    .strategy-form {
      background: #fbfdfb;
      border: 1px solid var(--line);
      border-radius: 26px;
      padding: 22px;
      box-shadow: 0 16px 46px rgba(16,20,19,0.05);
    }

    .strategy-form label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: .65px;
      margin: 0 0 8px;
    }

    .strategy-form input,
    .strategy-form select,
    .strategy-form textarea {
      width: 100%;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 14px;
      color: var(--ink);
      padding: 13px 14px;
      font-size: 15px;
      font-family: inherit;
      outline: none;
      transition: border-color .16s ease, box-shadow .16s ease;
    }

    .strategy-form textarea {
      min-height: 150px;
      resize: vertical;
      line-height: 1.5;
    }

    .strategy-form input:focus,
    .strategy-form select:focus,
    .strategy-form textarea:focus {
      border-color: rgba(11,207,116,.55);
      box-shadow: 0 0 0 4px rgba(11,207,116,.10);
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .form-field {
      margin-bottom: 14px;
    }

    .form-field.full {
      grid-column: 1 / -1;
    }

    .form-help {
      color: var(--muted-2);
      font-size: 12.5px;
      line-height: 1.45;
      margin-top: 7px;
    }

    .strategy-form .btn {
      width: 100%;
      border: 0;
      cursor: pointer;
      margin-top: 4px;
    }

    .hidden-field {
      display: none;
    }


    .simple-note {
      margin-top: 14px;
      color: #5c6863;
      font-size: 13px;
      line-height: 1.55;
    }


    /* compact landing spacing refinements */
    #systems {
      margin-top: -16px;
    }

    #simple-steps {
      margin-top: -8px;
    }

    .access {
      margin-top: 4px;
    }

    @media (max-width: 980px) {
      .hero,
      .access,
      .watch-block,
      .partner-box,
      .reason-box,
      .strategy-form-box {
        grid-template-columns: 1fr;
      }

      .hero {
        min-height: auto;
        padding-top: 56px;
      }

      .cards,
      .flow,
      .watch-points,
      .partner-list {
        grid-template-columns: 1fr;
      }

      .actions {
        grid-template-columns: 1fr;
      }

      .nav-links a:not(.nav-cta) {
        display: none;
      }
    }

    @media (max-width: 560px) {
      .wrap,
      .nav-inner {
        padding-left: 16px;
        padding-right: 16px;
      }

      h1 {
        font-size: 42px;
        letter-spacing: -2.1px;
        white-space: normal;
      }

      .row {
        grid-template-columns: 1fr 1fr;
      }

      .stat-grid,
      .form-grid {
        grid-template-columns: 1fr;
      }

      .form-field.full {
        grid-column: auto;
      }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="brand-lockup" aria-label="Vixale home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-word">
          <span class="brand-name">VIXALE</span>
          <span class="brand-tagline">live trading system</span>
        </span>
      </a>
      <div class="nav-links">
        <a href="#live-system">Live System</a>
        <a href="#systems">Start Here</a>
        <a href="#why-it-makes-sense">Why It Makes Sense</a>
        <a href="#partners">Creators</a>
        <a class="nav-cta" href="/login">Live Dashboard</a>
      </div>
    </div>
  </nav>

  <main>
    <section class="wrap hero">
      <div>
        <a class="badge" href="/login"><span class="dot"></span><span>Live trading, easy to watch</span></a>
        <a class="hero-title-link" href="/login" aria-label="Open Live Trade Dashboard">
          <h1>Watch a <span class="accent">live trading system.</span></h1>
        </a>
        <div class="smart-slogan">See the signals. See the trades. See the results.</div>
        <p class="hero-text">
          Vixale runs a live trading system that finds trade setups, sends alerts, tracks open trades, and records results in a private dashboard.
        </p>
        <p class="hero-note">
          You do not need to understand trading bots, code, or broker platforms to start. First, just watch how the system works. Then choose what you want next: signals, broker connection, strategy testing, or your own trading bot.
        </p>
        <div class="actions">
          <a class="btn btn-primary" href="/login">View Live Dashboard</a>
          <a class="btn btn-green" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Telegram Signals</a>
          <a class="btn" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Help Me Get Started</a>
        </div>
      </div>

      <div class="visual">
        <div class="product-card">
          <div class="product-top">
            <div class="window-dots"><span></span><span></span><span></span></div>
            <div class="live-pill">● Live tracking</div>
          </div>
          <div class="mock-body">
            <div class="mock-title">
              <div>
                <h2>Live Trade Dashboard</h2>
                <p>A simple view of what the system is doing right now</p>
              </div>
            </div>
            <div class="stat-grid">
              <div class="stat">
                <div class="stat-label">Open P&L</div>
                <div class="stat-value positive">+$1,248</div>
              </div>
              <div class="stat">
                <div class="stat-label">Win rate</div>
                <div class="stat-value">67.4%</div>
              </div>
              <div class="stat">
                <div class="stat-label">Pending setups</div>
                <div class="stat-value">4</div>
              </div>
              <div class="stat">
                <div class="stat-label">Closed today</div>
                <div class="stat-value positive">+$532</div>
              </div>
            </div>
            <div class="chart">
              <svg viewBox="0 0 600 160" preserveAspectRatio="none">
                <path d="M0,118 C70,90 96,128 150,100 C205,72 236,86 288,60 C348,30 382,82 440,50 C502,18 546,38 600,22" fill="none" stroke="rgba(7,143,81,0.92)" stroke-width="5" stroke-linecap="round"/>
                <path d="M0,118 C70,90 96,128 150,100 C205,72 236,86 288,60 C348,30 382,82 440,50 C502,18 546,38 600,22 L600,160 L0,160 Z" fill="rgba(11,207,116,0.10)"/>
              </svg>
            </div>
            <div class="rows">
              <div class="row"><div><strong>NVDA</strong></div><div class="positive">LONG</div><div>Open</div><div class="positive">+$248</div></div>
              <div class="row"><div><strong>NFLX</strong></div><div class="negative">SHORT</div><div>Closed</div><div class="positive">+$277</div></div>
              <div class="row"><div><strong>META</strong></div><div class="positive">LONG</div><div>Pending</div><div>—</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="live-system" class="wrap section">
      <div class="watch-block">
        <div>
          <div class="badge"><span class="dot"></span><span>Start simple: watch first</span></div>
          <h2>You can start without trading anything.</h2>
          <p class="lead">
            Open the dashboard and see what the system is doing before you make any decision.
          </p>
          <p class="simple-note">
            The dashboard shows active trade ideas, open trades, closed trades, and tracked results. You do not have to connect a broker or place a trade to understand what is happening.
          </p>
          <div class="actions" style="grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 460px;">
            <a class="btn btn-primary" href="/login">Open Live Dashboard</a>
            <a class="btn btn-green" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Signals</a>
          </div>
        </div>
        <div class="watch-points">
          <div class="watch-point"><strong>Open trades</strong>See which trades are currently active.</div>
          <div class="watch-point"><strong>Trade ideas</strong>See what the system is watching before a trade opens.</div>
          <div class="watch-point"><strong>Closed trades</strong>Review completed trades and recorded results.</div>
          <div class="watch-point"><strong>Clear tracking</strong>Follow the process without guessing.</div>
        </div>
      </div>
    </section>

    <section id="why-it-makes-sense" class="wrap section">
      <div class="reason-box">
        <div>
          <div class="badge"><span class="dot"></span><span>Clear rules. Clear tracking.</span></div>
          <h2>Why the Vixale approach makes sense.</h2>
          <p class="lead">
            Markets can feel messy when every decision depends on emotion, timing, and guesswork. Vixale makes the process easier to follow.
          </p>
          <p class="simple-note">
            The system waits for specific trade conditions, sends an alert when a setup appears, tracks the trade, and records the result. You are not asked to trust a story. You can watch the process live.
          </p>
          <div class="actions" style="grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 500px;">
            <a class="btn btn-primary" href="/login">Watch the Process Live</a>
            <a class="btn" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Ask How It Works</a>
          </div>
        </div>
        <div class="reason-copy">
          <h3>Not a prediction story. A visible process.</h3>
          <p>
            The value is not only in one signal. The value is in seeing the same process repeat over time: setup, alert, trade status, result, and review.
          </p>
          <div class="reason-list">
            <div class="reason-item"><span>1</span><div><strong>Rules instead of impulse</strong>The system reacts only when defined conditions appear.</div></div>
            <div class="reason-item"><span>2</span><div><strong>Tracking instead of guessing</strong>Open trades, closed trades, and results are recorded in one place.</div></div>
            <div class="reason-item"><span>3</span><div><strong>Visibility instead of blind trust</strong>You can see what the system is doing before deciding your next step.</div></div>
            <div class="reason-item"><span>4</span><div><strong>Review instead of memory</strong>Every trade becomes part of a record that can be checked and improved.</div></div>
          </div>
        </div>
      </div>
    </section>


    <section id="systems" class="wrap section">
      <div class="section-head">
        <h2>What can we help you with?</h2>
        <p class="lead">
          Start where you are. You do not need to have everything figured out. Choose the step that feels right for you.
        </p>
      </div>
      <div class="cards">
        <div class="card">
          <div class="card-number">01 / Watch</div>
          <h3>I want to watch first</h3>
          <p>Open the live dashboard and see how the system tracks signals, trades, and results.</p>
          <a class="btn card-action" href="/login">View Dashboard</a>
        </div>
        <div class="card">
          <div class="card-number">02 / Signals</div>
          <h3>I want trading signals</h3>
          <p>Get Telegram alerts when the system finds a trade setup.</p>
          <a class="btn card-action btn-green" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Telegram Signals</a>
        </div>
        <div class="card">
          <div class="card-number">03 / Automation</div>
          <h3>I want trades to be automated</h3>
          <p>If you use Interactive Brokers / TWS, we can help connect the alerts to your trading account setup.</p>
          <a class="btn card-action" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Connect My Broker</a>
        </div>
        <div class="card">
          <div class="card-number">04 / Setup</div>
          <h3>I need help setting this up</h3>
          <p>We can help with the basics: broker connection, alerts, Telegram updates, trade tracking, and dashboard access.</p>
          <a class="btn card-action" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Help Me Get Started</a>
        </div>
        <div class="card">
          <div class="card-number">05 / Research</div>
          <h3>I have my own strategy</h3>
          <p>Send us your idea. We can test it, code it, and tell you honestly if it looks usable.</p>
          <a class="btn card-action" href="#strategy-review">Test My Strategy</a>
        </div>
        <div class="card">
          <div class="card-number">06 / Custom bot</div>
          <h3>I want my own trading bot</h3>
          <p>We can build a custom bot based on your rules, risk settings, and trading account setup.</p>
          <a class="btn card-action" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Build My Bot</a>
        </div>
      </div>
    </section>

    <section id="strategy-review" class="wrap section">
      <div class="strategy-form-box">
        <div class="strategy-form-copy">
          <div class="badge"><span class="dot"></span><span>Have your own strategy?</span></div>
          <h2>Send us your trading rules.</h2>
          <p>
            You do not need to write a perfect technical document. Just describe the idea in your own words.
          </p>
          <p>
            We will look at the rules, ask the right questions, and tell you what the next step should be: clean it up, test it, code it, or leave it alone.
          </p>
          <div class="soft-list">
            <div><strong>Simple is fine.</strong> Tell us what you buy, what you sell, and when you get out.</div>
            <div><strong>No pressure.</strong> This is only a first look, not a commitment.</div>
            <div><strong>Honest feedback.</strong> If the idea is weak, we will not pretend it is ready.</div>
          </div>
        </div>

        <form class="strategy-form" method="POST" action="/strategy-review">
          <div class="form-grid">
            <div class="form-field">
              <label for="strategy_name">Your name</label>
              <input id="strategy_name" name="name" type="text" placeholder="John" autocomplete="name" />
            </div>
            <div class="form-field">
              <label for="strategy_contact">Email or Telegram</label>
              <input id="strategy_contact" name="contact" type="text" placeholder="@username or email" autocomplete="email" required />
            </div>
            <div class="form-field">
              <label for="strategy_market">Market</label>
              <input id="strategy_market" name="market" type="text" placeholder="Stocks, options, futures, crypto..." />
            </div>
            <div class="form-field">
              <label for="strategy_experience">Your level</label>
              <select id="strategy_experience" name="experience">
                <option value="New to trading systems">New to trading systems</option>
                <option value="I trade manually">I trade manually</option>
                <option value="I already have alerts or code">I already have alerts or code</option>
                <option value="I manage a trading audience">I manage a trading audience</option>
              </select>
            </div>
            <div class="form-field full">
              <label for="strategy_rules">Describe your rules</label>
              <textarea id="strategy_rules" name="rules" placeholder="Example: I want to buy when price pulls back after a strong move, enter near..., target..., stop..., only during market hours..." required></textarea>
              <div class="form-help">Write it like you would explain it to a trader friend. We will help clean it up.</div>
            </div>
            <div class="form-field full">
              <label for="strategy_goal">What do you want from us?</label>
              <select id="strategy_goal" name="goal">
                <option value="Tell me if this strategy makes sense">Tell me if this strategy makes sense</option>
                <option value="Backtest this strategy">Backtest this strategy</option>
                <option value="Code this strategy">Code this strategy</option>
                <option value="Build a trading bot">Build a trading bot</option>
                <option value="Package this for my audience">Package this for my audience</option>
                <option value="Not sure yet">Not sure yet</option>
              </select>
            </div>
            <div class="hidden-field">
              <label for="website">Website</label>
              <input id="website" name="website" type="text" autocomplete="off" tabindex="-1" />
            </div>
          </div>
          <button class="btn btn-primary" type="submit">Send My Strategy</button>
          <div class="form-help">We usually reply by Telegram or email. Trading involves risk, and this form does not create any financial-advice relationship.</div>
        </form>
      </div>
    </section>

    <section id="simple-steps" class="wrap section">
      <div class="section-head">
        <h2>Simple steps. Clear choices.</h2>
        <p class="lead">
          You can start by watching, then choose the next step only when it makes sense to you.
        </p>
      </div>
      <div class="flow">
        <div class="flow-step"><span>1</span><h3>Watch</h3><p>Start with the live dashboard. See signals, trades, and results.</p></div>
        <div class="flow-step"><span>2</span><h3>Choose</h3><p>Decide what you want: signals, automation, strategy testing, or your own bot.</p></div>
        <div class="flow-step"><span>3</span><h3>Set up</h3><p>We help connect the tools you need, including Telegram, TradingView, Google Sheets, and TWS / IBKR.</p></div>
        <div class="flow-step"><span>4</span><h3>Track</h3><p>You keep visibility through alerts, trade logs, and dashboard updates.</p></div>
      </div>
    </section>

    <section id="new-to-this" class="wrap section">
      <div class="access" style="grid-template-columns: 1fr;">
        <div>
          <h2>New to trading systems? Start here.</h2>
          <p>
            Many people are interested in trading systems but get lost in broker settings, alerts, code, and risk rules. You can start by simply watching the dashboard, asking questions, and deciding which next step makes sense for you.
          </p>
          <div class="small">No hype. Clear tracking, simple explanations, and honest feedback.</div>
        </div>
        <div class="access-actions" style="grid-template-columns: repeat(3, minmax(0, 1fr)); display: grid;">
          <a class="btn" href="/login">Watch First</a>
          <a class="btn secondary" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Ask Us Where To Start</a>
          <a class="btn secondary" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Telegram Signals</a>
        </div>
      </div>
    </section>

    <section id="partners" class="wrap section">
      <div class="partner-box">
        <div>
          <h2>Have an audience? Launch a trading product with Vixale.</h2>
          <p>
            If you run a Telegram channel, YouTube channel, Discord, newsletter, or trading community, we can help you turn your audience into a structured trading product.
          </p>
          <p>
            You bring the audience. We bring the trading system, dashboard, alerts, automation, research, tracking, and product packaging.
          </p>
          <a class="btn btn-green" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Partner With Vixale</a>
        </div>
        <div class="partner-list">
          <div>Signal delivery</div>
          <div>Live dashboard access</div>
          <div>Strategy research</div>
          <div>Custom bots</div>
          <div>TWS / IBKR setup</div>
          <div>White-label products</div>
          <div>Performance tracking</div>
          <div>Marketing packaging</div>
        </div>
      </div>
    </section>

    <section id="access" class="wrap section">
      <div class="access">
        <div>
          <h2>Start by watching the live system.</h2>
          <p>
            Open the dashboard, see how the system works, and decide your next step when you are ready. Contact us on Telegram for access or help getting started.
          </p>
          <div class="small">The dashboard is for transparency, tracking, and education. Trading always involves risk.</div>
        </div>
        <div class="access-actions">
          <a class="btn" href="/login">Dashboard Login</a>
          <a class="btn secondary" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Get Telegram Signals</a>
          <a class="btn secondary" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Talk To Us</a>
        </div>
      </div>
    </section>

  </main>

  <footer class="wrap footer">
    <strong>Important Risk Disclosure:</strong> Vixale is not a registered investment adviser, broker-dealer, commodity trading adviser, fiduciary, law firm, accounting firm, or tax adviser. All website content, Telegram messages, alerts, dashboards, spreadsheets, trade examples, strategy references, performance figures, and related materials are provided strictly for educational, research, and informational purposes only. Nothing presented by Vixale is personalized financial, investment, trading, legal, tax, or accounting advice, and nothing should be interpreted as an offer, solicitation, recommendation, endorsement, instruction, or invitation to buy, sell, short, hold, or trade any security, option, futures contract, cryptocurrency, derivative, or other financial instrument. Results may be backtested, hypothetical, simulated, paper-traded, forward-tested, delayed, incomplete, based on assumptions, affected by data errors, and materially different from live brokerage execution. Past performance, win rate, P&L, examples, charts, alerts, or strategy history are not guarantees, promises, projections, or reliable indicators of future results. Trading and investing involve substantial risk, including the possible loss of some or all capital. You alone are responsible for all trading decisions, position sizing, risk controls, broker selection, order execution, taxes, and compliance with applicable laws and regulations. Consult properly licensed professionals before making any financial decisions. By using this website, dashboard, Telegram channel, spreadsheets, or related materials, you agree that Vixale and its operators are not liable for any losses, damages, missed profits, execution differences, delays, outages, data inaccuracies, or reliance on any information provided.
  </footer>
</body>
</html>`;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRATEGY FORM THANK YOU HTML
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderStrategyReceivedHtml(name = '') {
  const safeName = escapeHtml(name || '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale | Strategy Received</title>
  <style>
    :root {
      --bg: #fbfcfb;
      --paper: #ffffff;
      --ink: #101413;
      --muted: #68736f;
      --line: #e3e9e5;
      --green: #0bcf74;
      --green-dark: #078f51;
      --green-soft: #e9fff4;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 18% 6%, rgba(11,207,116,0.15), transparent 32%),
        radial-gradient(circle at 84% 10%, rgba(11,207,116,0.10), transparent 28%),
        linear-gradient(180deg, #fbfcfb 0%, #f6f9f6 100%);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 560px;
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      border-radius: 30px;
      padding: 34px;
      box-shadow: 0 28px 80px rgba(16,20,19,0.08);
      backdrop-filter: blur(18px);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 15px;
      border: 1px solid rgba(184, 216, 198, 0.9);
      border-radius: 999px;
      background: rgba(255,255,255,0.82);
      color: #26302c;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 18px;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 7px rgba(11,207,116,0.13);
    }

    h1 {
      margin: 0;
      font-size: clamp(32px, 5vw, 48px);
      line-height: 1.05;
      letter-spacing: -1.6px;
      font-weight: 500;
    }

    p {
      color: var(--muted);
      line-height: 1.62;
      margin: 14px 0 0;
      font-size: 16px;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 24px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 13px 16px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      text-decoration: none;
    }

    .btn-primary {
      background: var(--ink);
      border-color: var(--ink);
      color: #fff;
    }

    .small {
      color: #5c6863;
      font-size: 13px;
      margin-top: 18px;
    }

    @media (max-width: 560px) {
      .actions { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span><span>Strategy received</span></div>
    <h1>${safeName ? `Thanks, ${safeName}.` : 'Thanks. We got it.'}</h1>
    <p>Your trading rules were sent to Vixale. We will review the idea and reply by the contact you provided.</p>
    <p>You can keep watching the live system while we review your strategy.</p>
    <div class="actions">
      <a class="btn btn-primary" href="/login">View Live Dashboard</a>
      <a class="btn" href="/">Back to Home</a>
    </div>
    <div class="small">This is a strategy review request, not financial advice. Trading involves risk and results are not guaranteed.</div>
  </div>
</body>
</html>`;
}


//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGIN HTML
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderLoginHtml(errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale Dashboard Login</title>
  <style>
    :root {
      --bg: #fbfcfb;
      --paper: #ffffff;
      --ink: #101413;
      --muted: #68736f;
      --line: #e3e9e5;
      --green: #0bcf74;
      --red: #d7424f;
    }

    * { box-sizing: border-box; }

    /* Vixale no-bold typography reset */
    b, strong { font-weight: 500; }
    button, a, input, td, th, div, p, span, h1, h2, h3 {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }


    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 18% 6%, rgba(11,207,116,0.15), transparent 32%),
        radial-gradient(circle at 84% 10%, rgba(11,207,116,0.10), transparent 28%),
        linear-gradient(180deg, #fbfcfb 0%, #f6f9f6 100%);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 440px;
      background: rgba(255,255,255,0.84);
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 34px;
      box-shadow: 0 28px 80px rgba(16,20,19,0.08);
      backdrop-filter: blur(18px);
    }

    .logo {
      font-size: 20px;
      font-weight: 500;
      letter-spacing: -0.35px;
      margin-bottom: 30px;
    }

    .logo span { color: var(--green); }

    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
      letter-spacing: -1.2px;
      font-weight: 500;
    }

    p {
      color: var(--muted);
      line-height: 1.58;
      margin: 12px 0 26px;
      font-size: 15px;
    }

    label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: .7px;
      margin-bottom: 8px;
    }

    input {
      width: 100%;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 14px;
      color: var(--ink);
      padding: 14px 15px;
      font-size: 16px;
      outline: none;
    }

    input:focus {
      border-color: rgba(11,207,116,.55);
      box-shadow: 0 0 0 4px rgba(11,207,116,.10);
    }

    button {
      width: 100%;
      margin-top: 14px;
      border: 0;
      border-radius: 14px;
      padding: 14px 18px;
      background: var(--ink);
      color: #fff;
      font-weight: 500;
      font-size: 15px;
      cursor: pointer;
    }

    .error {
      margin-top: 14px;
      color: var(--red);
      font-size: 14px;
      font-weight: 500;
    }

    .links {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 20px;
    }

    .links a {
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
    }

    .links a:hover { color: var(--ink); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Vixale<span>.</span></div>
    <h1>Dashboard access</h1>
    <p>Enter the dashboard password to view live tracking and the full trade history link.</p>
    <form method="POST" action="/dashboard-login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus />
      <button type="submit">Open Dashboard</button>
    </form>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <div class="links">
      <a href="/">← Back to Home</a>
      <a href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Access</a>
    </div>
  </div>
</body>
</html>`;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD HTML — PASSWORD PROTECTED
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderMoney(value) {
  const n = cleanNumber(value);
  if (n === '') return '';
  return formatMoney(n);
}

function renderDashboardHtml(data) {
  const s = data.summary;

  const openRows = data.open_positions.map(row => `
    <tr>
      <td class="ticker">${escapeHtml(row.symbol)}</td>
      <td class="${sideClass(row.side)}">${escapeHtml(row.side)}</td>
      <td>${num(row.entry)}</td>
      <td>${num(row.last)}</td>
      <td>${num(row.target)}</td>
      <td>${num(row.stop)}</td>
      <td>${num(row.size, 0)}</td>
      <td class="${moneyClass(row.open_pnl)}">${renderMoney(row.open_pnl)}</td>
      <td>${pct(row.to_tp)}</td>
      <td>${pct(row.to_stop)}</td>
      <td class="positive">${renderMoney(row.exposure)}</td>
      <td>${escapeHtml(row.status)}</td>
    </tr>
  `).join('');

  const pendingRows = data.pending_orders.map(row => `
    <tr>
      <td class="ticker">${escapeHtml(row.symbol)}</td>
      <td class="${sideClass(row.side)}">${escapeHtml(row.side)}</td>
      <td>${num(row.entry)}</td>
      <td>${num(row.target)}</td>
      <td>${num(row.stop)}</td>
      <td>${num(row.size, 0)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(safeDateText(row.timestamp))}</td>
      <td>${escapeHtml(row.trade_id)}</td>
    </tr>
  `).join('');

  const closedRows = data.recent_closed_trades.map(row => `
    <tr>
      <td class="ticker">${escapeHtml(row.trade_id)}</td>
      <td>${escapeHtml(safeDateText(row.open_time))}</td>
      <td>${escapeHtml(safeDateText(row.close_time))}</td>
      <td class="ticker">${escapeHtml(row.symbol)}</td>
      <td class="${sideClass(row.side)}">${escapeHtml(row.side)}</td>
      <td>${num(row.entry)}</td>
      <td>${num(row.exit)}</td>
      <td>${num(row.size, 0)}</td>
      <td class="${moneyClass(row.result)}">${renderMoney(row.result)}</td>
      <td>${escapeHtml(row.event)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="30" />
  <title>Vixale Live Strategy Dashboard</title>
  <style>
    :root {
      --page: #f7fbf8;
      --page2: #eef8f2;
      --card: rgba(255,255,255,0.88);
      --card-solid: #ffffff;
      --text: #121815;
      --muted: #63716a;
      --muted2: #87938d;
      --line: #dfe9e3;
      --line2: #ccded4;
      --green: #008f4a;
      --green2: #0bbf6a;
      --green-soft: #e9fff3;
      --red: #d8424f;
      --shadow: 0 18px 54px rgba(21, 48, 34, 0.08);
      --shadow-soft: 0 10px 30px rgba(21, 48, 34, 0.055);
    }

    * { box-sizing: border-box; }

    /* Vixale no-bold typography reset */
    b, strong { font-weight: 500; }
    body, button, a, input, table, th, td, div, p, span, h1, h2, h3 {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: geometricPrecision;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at 10% 0%, rgba(0, 143, 74, 0.10), transparent 34%),
        radial-gradient(circle at 90% 7%, rgba(0, 143, 74, 0.075), transparent 30%),
        linear-gradient(180deg, #f8fcfa 0%, #f3faf6 42%, #ffffff 100%);
      color: var(--text);
      font-weight: 400;
    }

    a { color: inherit; text-decoration: none; }

    .wrap {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
    }

    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .home-link, .dash-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      color: #17201b;
      font-size: 13px;
      line-height: 1.2;
      font-weight: 400;
      letter-spacing: -0.01em;
      box-shadow: 0 8px 24px rgba(21, 48, 34, 0.045);
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }

    .home-link:hover, .dash-btn:hover {
      transform: translateY(-1px);
      border-color: var(--line2);
      background: #ffffff;
    }

    .dashboard-links {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .dash-btn.primary {
      background: #0f1512;
      border-color: #0f1512;
      color: #ffffff;
      font-weight: 400;
      box-shadow: 0 12px 32px rgba(15, 21, 18, 0.12);
    }

    .dash-btn.primary:hover {
      background: #18211d;
      border-color: #18211d;
    }

    .hero {
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      border-radius: 30px;
      padding: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      margin-bottom: 14px;
    }

    .topline {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .brand h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.08;
      font-weight: 500;
      letter-spacing: -0.045em;
      color: #111815;
    }

    .subtitle {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
      margin-top: 7px;
      font-weight: 400;
      letter-spacing: -0.01em;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      background: var(--green-soft);
      border: 1px solid #bfe9d2;
      color: var(--green);
      font-size: 13px;
      line-height: 1.2;
      font-weight: 400;
      white-space: nowrap;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--green2);
      box-shadow: 0 0 18px rgba(11,191,106,.45);
    }

    .updated {
      color: var(--muted2);
      font-size: 12.5px;
      line-height: 1.4;
      font-weight: 400;
      margin-top: 13px;
      font-variant-numeric: tabular-nums;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
      margin-top: 20px;
    }

    .card {
      background: rgba(255,255,255,0.92);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 16px 15px;
      min-height: 96px;
      box-shadow: var(--shadow-soft);
    }

    .card .label {
      color: var(--muted2);
      font-size: 11px;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 400;
    }

    .card .value {
      margin-top: 12px;
      font-size: 24px;
      line-height: 1.06;
      font-weight: 400;
      letter-spacing: -0.035em;
      font-variant-numeric: tabular-nums;
    }

    .positive { color: var(--green) !important; }
    .negative { color: var(--red) !important; }
    .neutral { color: var(--text) !important; }
    .long { color: var(--green); font-weight: 400; }
    .short { color: var(--red); font-weight: 400; }

    .section {
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      border-radius: 24px;
      overflow: hidden;
      margin-top: 15px;
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(14px);
    }

    .section-header {
      padding: 14px 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,252,249,0.94));
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
      font-weight: 500;
      letter-spacing: -0.025em;
      color: #111815;
    }

    .section-header span {
      color: var(--muted2);
      font-size: 12px;
      line-height: 1.35;
      font-weight: 400;
    }

    .table-wrap { overflow-x: auto; }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
      background: rgba(255,255,255,0.80);
    }

    th, td {
      padding: 13px 14px;
      border-bottom: 1px solid #eef4f1;
      text-align: right;
      white-space: nowrap;
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
    }

    th {
      color: var(--muted2);
      font-size: 11px;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.055em;
      background: #fbfefd;
      font-weight: 400;
    }

    td {
      color: #202924;
      font-size: 14px;
      line-height: 1.35;
      font-weight: 400;
      letter-spacing: -0.01em;
    }

    td:first-child, th:first-child,
    td:nth-child(2), th:nth-child(2) {
      text-align: left;
    }

    tr:hover td { background: #f5fbf8; }

    .ticker {
      color: #121815;
      font-weight: 500;
      letter-spacing: -0.012em;
    }

    .empty {
      padding: 22px 18px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
      font-weight: 400;
    }

    .footer {
      margin-top: 18px;
      color: #6f7a75;
      font-size: 12px;
      line-height: 1.62;
      font-weight: 400;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.72);
      border-radius: 20px;
      padding: 16px 18px;
      box-shadow: 0 10px 34px rgba(21, 48, 34, 0.05);
    }

    @media (max-width: 1100px) {
      .cards { grid-template-columns: repeat(3, 1fr); }
    }

    @media (max-width: 720px) {
      .wrap { padding: 14px; }
      .brand h1 { font-size: 25px; }
      .cards { grid-template-columns: repeat(2, 1fr); }
      .card { min-height: 90px; }
      .card .value { font-size: 21px; }
      .dash-btn, .home-link { width: 100%; }
      .dashboard-links { width: 100%; }
      th, td { font-size: 13px; padding: 12px 10px; }
    }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top-actions">
      <a class="home-link" href="/">← Back to Home</a>

      <div class="dashboard-links">
        <a class="dash-btn primary" href="${FULL_HISTORY_URL}" target="_blank" rel="noopener noreferrer">Full Trade History</a>
        <a class="dash-btn" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Telegram Channel</a>
        <a class="dash-btn" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Contact</a>
      </div>
    </div>

    <div class="hero">
      <div class="topline">
        <div class="brand">
          <h1>Vixale Live Strategy Dashboard</h1>
          <div class="subtitle">Private live forward-test / paper-trading tracker</div>
          <div class="updated">Last refreshed: ${escapeHtml(data.updated_at)} ET · Auto-refreshes every 30 seconds</div>
        </div>
        <div class="badge"><span class="dot"></span> LIVE TRACKING</div>
      </div>

      <div class="cards">
        <div class="card">
          <div class="label">Open Positions</div>
          <div class="value">${escapeHtml(s.open_count)}</div>
        </div>
        <div class="card">
          <div class="label">Pending Orders</div>
          <div class="value">${escapeHtml(s.pending_count)}</div>
        </div>
        <div class="card">
          <div class="label">Open P&L</div>
          <div class="value ${moneyClass(s.open_pnl)}">${renderMoney(s.open_pnl)}</div>
        </div>
        <div class="card">
          <div class="label">Closed P&L Today</div>
          <div class="value ${moneyClass(s.closed_pnl_today)}">${renderMoney(s.closed_pnl_today)}</div>
        </div>
        <div class="card">
          <div class="label">Total Closed P&L</div>
          <div class="value ${moneyClass(s.total_closed_pnl)}">${renderMoney(s.total_closed_pnl)}</div>
        </div>
        <div class="card">
          <div class="label">Win Rate</div>
          <div class="value">${pct(s.win_rate)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Live Open Positions</h2>
        <span>Total exposure: ${renderMoney(s.exposure)}</span>
      </div>
      <div class="table-wrap">
        ${data.open_positions.length ? `
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Last</th>
              <th>Target</th>
              <th>Stop</th>
              <th>Qty</th>
              <th>Open P&L</th>
              <th>To TP</th>
              <th>To Stop</th>
              <th>Exposure</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${openRows}</tbody>
        </table>
        ` : `<div class="empty">No open positions.</div>`}
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Pending Orders</h2>
        <span>Working setup orders waiting for entry</span>
      </div>
      <div class="table-wrap">
        ${data.pending_orders.length ? `
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Target</th>
              <th>Stop</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Time</th>
              <th>Trade ID</th>
            </tr>
          </thead>
          <tbody>${pendingRows}</tbody>
        </table>
        ` : `<div class="empty">No pending orders.</div>`}
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Recent Closed Trades</h2>
        <span>Latest 20 completed trades. Full history available above.</span>
      </div>
      <div class="table-wrap">
        ${data.recent_closed_trades.length ? `
        <table>
          <thead>
            <tr>
              <th>Trade ID</th>
              <th>Open Time</th>
              <th>Close Time</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Qty</th>
              <th>P&L</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>${closedRows}</tbody>
        </table>
        ` : `<div class="empty">No closed trades yet.</div>`}
      </div>
    </div>

    <div class="footer">
      <strong>Important Risk Disclosure:</strong> Vixale is not a registered investment adviser, broker-dealer, commodity trading adviser, fiduciary, law firm, accounting firm, or tax adviser. This private dashboard, including all signals, alerts, spreadsheets, trade history, P&L, win rate, examples, and strategy data, is provided strictly for educational, research, and informational purposes only. Nothing shown here is personalized financial, investment, trading, legal, tax, or accounting advice, and nothing should be interpreted as an offer, solicitation, recommendation, endorsement, instruction, or invitation to buy, sell, short, hold, or trade any security, option, futures contract, cryptocurrency, derivative, or other financial instrument. Results may be backtested, hypothetical, simulated, paper-traded, forward-tested, delayed, incomplete, based on assumptions, affected by data errors, and materially different from live brokerage execution. Past performance is not indicative of future results. Trading and investing involve substantial risk, including the possible loss of some or all capital. You alone are responsible for all trading decisions, position sizing, risk controls, broker selection, order execution, taxes, and compliance with applicable laws and regulations. Consult properly licensed professionals before making any financial decisions. By using this dashboard or related materials, you agree that Vixale and its operators are not liable for any losses, damages, missed profits, execution differences, delays, outages, data inaccuracies, or reliance on any information provided.
    </div>
  </div>
</body>
</html>`;
}


//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WEBHOOK ROUTES
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleTradingViewWebhook(req, res) {
  try {
    const isJsonObject =
      typeof req.body === 'object' &&
      req.body !== null &&
      !Buffer.isBuffer(req.body);

    const message = normalizeRawMessage(req.body);

    const parsedRow = isJsonObject
      ? parseJsonTradingViewAlert(req.body)
      : parseTradingViewMessage(message);

    let finalRow = parsedRow;

    try {
      finalRow = (await processLedger(parsedRow)) || parsedRow;
    } catch (sheetErr) {
      console.error('Google Sheets / ledger failed:', sheetErr);
      finalRow = parsedRow;
    }

    if (!SILENT_TELEGRAM_EVENTS.has(finalRow.event)) {
      const telegramMessage = formatTelegramMessage(finalRow, message);
      await sendTelegram(telegramMessage);
    } else {
      console.log('Telegram skipped for silent event:', finalRow.event, finalRow.raw_event || '');
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error');
  }
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SITE ROUTES
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/', (req, res) => {
  res.status(200).send(renderLandingHtml());
});

app.get('/login', (req, res) => {
  res.status(200).send(renderLoginHtml());
});



app.post('/strategy-review', async (req, res) => {
  try {
    const body = req.body || {};

    // Basic honeypot for simple bots.
    if (body.website) {
      return res.status(200).send(renderStrategyReceivedHtml(''));
    }

    const name = String(body.name || '').trim();
    const contact = String(body.contact || '').trim();
    const market = String(body.market || '').trim();
    const experience = String(body.experience || '').trim();
    const goal = String(body.goal || '').trim();
    const rules = String(body.rules || '').trim();

    if (!contact || !rules) {
      return res.status(400).send('Please provide your contact and strategy rules.');
    }

    const message = [
      '🧠 <b>New Strategy Review Request</b>',
      '',
      name ? `Name: <b>${escapeHtml(name)}</b>` : '',
      `Contact: <b>${escapeHtml(contact)}</b>`,
      market ? `Market: <b>${escapeHtml(market)}</b>` : '',
      experience ? `Level: <b>${escapeHtml(experience)}</b>` : '',
      goal ? `Goal: <b>${escapeHtml(goal)}</b>` : '',
      '',
      '<b>Rules:</b>',
      escapeHtml(rules),
    ].filter(Boolean).join('\n');

    await sendTelegram(message);

    return res.status(200).send(renderStrategyReceivedHtml(name));
  } catch (err) {
    console.error('Strategy review form error:', err);
    return res.status(500).send('Strategy review form error. Please try again or contact us on Telegram.');
  }
});

app.post('/dashboard-login', (req, res) => {
  if (!DASHBOARD_KEY) {
    return res.status(500).send('Dashboard key is not configured.');
  }

  const password = String(req.body.password || '').trim();
  const dashboardKey = String(DASHBOARD_KEY || '').trim();

  if (password !== dashboardKey) {
    return res.status(401).send(renderLoginHtml('Incorrect password. Please try again.'));
  }

  res.cookie('vixale_dashboard_key', String(DASHBOARD_KEY || '').trim(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12,
  });

  return res.redirect('/dashboard');
});

app.get('/dashboard', async (req, res) => {
  try {
    if (!DASHBOARD_KEY) {
      return res.status(500).send('Dashboard key is not configured.');
    }

    const keyFromQuery = String(req.query.key || '').trim();
    const dashboardKey = String(DASHBOARD_KEY || '').trim();

    if (keyFromQuery === dashboardKey) {
      res.cookie('vixale_dashboard_key', String(DASHBOARD_KEY || '').trim(), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 12,
      });

      return res.redirect('/dashboard');
    }

    if (!isDashboardAuthorized(req)) {
      return res.redirect('/login');
    }

    const data = await getDashboardData();
    res.status(200).send(renderDashboardHtml(data));
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Dashboard error');
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('vixale_dashboard_key', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });

  return res.redirect('/');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Webhook endpoints
app.post('/', handleTradingViewWebhook);
app.post('/tv', handleTradingViewWebhook);

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
