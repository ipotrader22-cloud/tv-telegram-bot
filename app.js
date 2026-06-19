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
  <title>Vixale | Trading Systems, Engineered</title>
  <meta name="description" content="Vixale builds and monitors systematic trading infrastructure with private live dashboard access." />
  <style>
    :root {
      --bg: #f5f5f7;
      --surface: rgba(255,255,255,0.78);
      --surface-solid: #ffffff;
      --ink: #0b0d12;
      --muted: #667085;
      --line: rgba(20, 26, 38, 0.10);
      --soft-line: rgba(20, 26, 38, 0.075);
      --green: #0bbf6a;
      --green-dark: #07864b;
      --blue: #2563eb;
      --dark: #090d14;
      --shadow: 0 24px 70px rgba(18, 26, 43, 0.10);
      --shadow-strong: 0 34px 100px rgba(18, 26, 43, 0.16);
      --radius-xl: 32px;
      --radius-lg: 24px;
      --radius-md: 16px;
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at 16% 8%, rgba(37, 99, 235, 0.14), transparent 28%),
        radial-gradient(circle at 86% 12%, rgba(11, 191, 106, 0.16), transparent 27%),
        linear-gradient(180deg, #fbfbfd 0%, var(--bg) 48%, #ffffff 100%);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, Segoe UI, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .nav {
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(22px);
      background: rgba(251, 251, 253, 0.72);
      border-bottom: 1px solid var(--soft-line);
    }

    .nav-inner {
      max-width: 1180px;
      margin: 0 auto;
      padding: 15px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
    }

    .logo {
      font-size: 21px;
      font-weight: 650;
      letter-spacing: -0.55px;
    }

    .logo span {
      color: var(--green);
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 24px;
      color: #596275;
      font-size: 14px;
      font-weight: 500;
    }

    .nav-links a:hover {
      color: var(--ink);
    }

    .nav-cta {
      color: white !important;
      background: #0b0d12;
      padding: 9px 14px;
      border-radius: 999px;
      box-shadow: 0 10px 25px rgba(11,13,18,0.14);
    }

    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .hero {
      padding: 92px 0 68px;
      display: grid;
      grid-template-columns: 1.02fr 0.98fr;
      gap: 58px;
      align-items: center;
      min-height: 760px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: #344054;
      background: rgba(255,255,255,0.66);
      box-shadow: 0 10px 30px rgba(18,26,43,0.05);
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 24px;
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 0 5px rgba(11,191,106,0.12), 0 0 22px rgba(11,191,106,0.55);
    }

    h1 {
      margin: 0;
      max-width: 780px;
      font-size: clamp(56px, 7.2vw, 92px);
      line-height: 0.94;
      letter-spacing: -4.6px;
      font-weight: 680;
    }

    .hero-text {
      margin: 26px 0 0;
      max-width: 640px;
      color: #475467;
      font-size: 21px;
      line-height: 1.55;
      letter-spacing: -0.2px;
      font-weight: 400;
    }

    .access-note {
      max-width: 650px;
      margin: 18px 0 0;
      color: #667085;
      font-size: 16px;
      line-height: 1.65;
    }

    .access-note strong {
      color: var(--ink);
      font-weight: 600;
    }

    .actions {
      display: flex;
      flex-wrap: nowrap;
      gap: 12px;
      margin-top: 32px;
      align-items: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 999px;
      font-size: 15px;
      font-weight: 520;
      border: 1px solid var(--line);
      color: var(--ink);
      background: rgba(255,255,255,0.72);
      box-shadow: 0 10px 26px rgba(18,26,43,0.055);
      transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
      white-space: nowrap;
    }

    .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 14px 34px rgba(18,26,43,0.08);
      background: white;
    }

    .btn-primary {
      background: #0b0d12;
      color: white;
      border-color: #0b0d12;
    }

    .btn-primary:hover {
      background: #181b22;
    }

    .btn-green {
      color: #053b23;
      border-color: rgba(11,191,106,0.22);
      background: rgba(11,191,106,0.105);
    }

    .hero-visual {
      position: relative;
      min-height: 520px;
    }

    .halo {
      position: absolute;
      inset: -60px -60px auto auto;
      width: 390px;
      height: 390px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(11,191,106,0.20), transparent 64%);
      filter: blur(8px);
      z-index: 0;
    }

    .product-frame {
      position: relative;
      z-index: 2;
      background: rgba(255,255,255,0.74);
      border: 1px solid rgba(255,255,255,0.70);
      border-radius: 34px;
      padding: 14px;
      box-shadow: var(--shadow-strong);
      backdrop-filter: blur(18px);
      transform: rotate(-1deg);
    }

    .product-inner {
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid rgba(15,23,42,0.08);
      background: #090d14;
      color: white;
    }

    .product-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.035);
    }

    .dotset {
      display: flex;
      gap: 7px;
    }

    .dotset span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: rgba(255,255,255,0.26);
    }

    .live-badge {
      color: #72f2ae;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid rgba(114,242,174,0.24);
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(114,242,174,0.10);
    }

    .mock-body {
      padding: 18px;
    }

    .mock-title {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: end;
      margin-bottom: 16px;
    }

    .mock-title h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 620;
      letter-spacing: -0.5px;
    }

    .mock-title small {
      color: rgba(255,255,255,0.46);
      font-size: 12px;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }

    .metric {
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 14px;
    }

    .metric-label {
      color: rgba(255,255,255,0.50);
      font-size: 11px;
      font-weight: 500;
    }

    .metric-value {
      margin-top: 9px;
      font-size: 22px;
      font-weight: 610;
      letter-spacing: -0.4px;
    }

    .green {
      color: #45e893;
    }

    .red {
      color: #ff6b78;
    }

    .chart {
      position: relative;
      height: 150px;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
      background:
        linear-gradient(180deg, rgba(69,232,147,0.12), transparent),
        linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px),
        linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px);
      background-size: auto, 42px 42px, 42px 42px;
      margin-bottom: 14px;
    }

    .chart svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .trade-row {
      display: grid;
      grid-template-columns: 1fr 0.9fr 0.9fr 0.9fr;
      gap: 10px;
      padding: 12px 2px;
      border-top: 1px solid rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.64);
      font-size: 13px;
    }

    .trade-row strong {
      color: white;
      font-weight: 600;
    }

    .float-card {
      position: absolute;
      z-index: 3;
      right: -22px;
      bottom: 42px;
      width: 210px;
      padding: 16px;
      border-radius: 22px;
      background: rgba(255,255,255,0.82);
      border: 1px solid rgba(255,255,255,0.72);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .float-card .label {
      color: #667085;
      font-size: 12px;
    }

    .float-card .value {
      margin-top: 8px;
      font-size: 25px;
      font-weight: 650;
      letter-spacing: -0.65px;
    }

    .section {
      padding: 76px 0;
    }

    .section-head {
      max-width: 820px;
      margin-bottom: 28px;
    }

    .section h2 {
      margin: 0 0 14px;
      font-size: clamp(34px, 4.6vw, 58px);
      line-height: 1.04;
      letter-spacing: -2.4px;
      font-weight: 650;
    }

    .lead {
      margin: 0;
      color: #667085;
      font-size: 19px;
      line-height: 1.62;
      max-width: 780px;
    }

    .feature-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .feature-card {
      background: rgba(255,255,255,0.70);
      border: 1px solid rgba(15,23,42,0.08);
      border-radius: 28px;
      padding: 28px;
      box-shadow: 0 16px 48px rgba(18,26,43,0.055);
      min-height: 250px;
    }

    .feature-card .index {
      color: var(--green-dark);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.6px;
      margin-bottom: 48px;
    }

    .feature-card h3 {
      margin: 0 0 10px;
      font-size: 23px;
      letter-spacing: -0.55px;
      font-weight: 620;
    }

    .feature-card p {
      margin: 0;
      color: #667085;
      line-height: 1.62;
      font-size: 15.5px;
    }

    .workflow {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .step {
      background: #ffffff;
      border: 1px solid rgba(15,23,42,0.08);
      border-radius: 26px;
      padding: 24px;
      box-shadow: 0 12px 36px rgba(18,26,43,0.045);
      min-height: 180px;
    }

    .step-number {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      margin-bottom: 18px;
      color: var(--green-dark);
      background: rgba(11,191,106,0.10);
      font-weight: 600;
    }

    .step h3 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 620;
      letter-spacing: -0.25px;
    }

    .step p {
      margin: 0;
      color: #667085;
      line-height: 1.55;
      font-size: 14.5px;
    }

    .access-panel {
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 22px;
      align-items: center;
      background:
        radial-gradient(circle at 12% 16%, rgba(11,191,106,0.18), transparent 32%),
        linear-gradient(135deg, #0b0d12 0%, #121826 100%);
      color: white;
      border-radius: 36px;
      padding: 42px;
      box-shadow: 0 34px 100px rgba(18,26,43,0.18);
      overflow: hidden;
      position: relative;
    }

    .access-panel:after {
      content: "";
      position: absolute;
      width: 320px;
      height: 320px;
      border-radius: 50%;
      right: -120px;
      top: -110px;
      background: radial-gradient(circle, rgba(37,99,235,0.28), transparent 65%);
    }

    .access-panel > * {
      position: relative;
      z-index: 2;
    }

    .access-panel h2 {
      margin: 0 0 14px;
      font-size: clamp(34px, 4.6vw, 58px);
      letter-spacing: -2.2px;
      line-height: 1.04;
      font-weight: 650;
    }

    .access-panel p {
      margin: 0;
      color: rgba(255,255,255,0.70);
      line-height: 1.65;
      font-size: 17px;
      max-width: 680px;
    }

    .access-buttons {
      display: grid;
      gap: 12px;
    }

    .access-buttons .btn {
      background: rgba(255,255,255,0.10);
      color: white;
      border-color: rgba(255,255,255,0.14);
      box-shadow: none;
      width: 100%;
    }

    .access-buttons .btn-primary {
      background: white;
      color: #0b0d12;
      border-color: white;
    }

    .tiny {
      margin-top: 14px;
      color: rgba(255,255,255,0.54);
      font-size: 13px;
      line-height: 1.55;
    }

    .footer {
      padding: 34px 0 42px;
      color: #667085;
      border-top: 1px solid var(--soft-line);
      font-size: 13px;
      line-height: 1.7;
    }

    @media (max-width: 980px) {
      .hero,
      .access-panel {
        grid-template-columns: 1fr;
      }

      .hero {
        min-height: auto;
        padding-top: 58px;
      }

      .feature-grid,
      .workflow {
        grid-template-columns: 1fr;
      }

      .float-card {
        display: none;
      }

      .actions {
        flex-wrap: wrap;
      }
    }

    @media (max-width: 640px) {
      .wrap,
      .nav-inner {
        padding-left: 16px;
        padding-right: 16px;
      }

      h1 {
        letter-spacing: -2.8px;
      }

      .nav-links a:not(.nav-cta) {
        display: none;
      }

      .actions {
        flex-direction: column;
        align-items: stretch;
      }

      .btn {
        width: 100%;
      }

      .metric-grid {
        grid-template-columns: 1fr;
      }

      .trade-row {
        grid-template-columns: 1fr 1fr;
      }

      .product-frame {
        transform: none;
      }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-inner">
      <a class="logo" href="/">Vixale<span>.</span></a>
      <div class="nav-links">
        <a href="#systems">Systems</a>
        <a href="#workflow">Workflow</a>
        <a href="#access">Access</a>
        <a class="nav-cta" href="/login">Live Dashboard</a>
      </div>
    </div>
  </nav>

  <main>
    <section class="wrap hero">
      <div>
        <div class="eyebrow"><span class="pulse"></span> Private live trade dashboard</div>
        <h1>Systematic trade execution, monitored live.</h1>
        <p class="hero-text">
          Vixale is a trading-systems infrastructure project: signals, execution workflow, Telegram alerts, and a private live dashboard for forward-test visibility.
        </p>
        <p class="access-note">
          To receive access to the <strong>Live Trade Dashboard</strong>, request the password on Telegram or join the channel for updates.
        </p>
        <div class="actions">
          <a class="btn btn-primary" href="/login">View Live Dashboard</a>
          <a class="btn btn-green" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Access</a>
          <a class="btn" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Join Telegram Channel</a>
        </div>
      </div>

      <div class="hero-visual">
        <div class="halo"></div>
        <div class="product-frame">
          <div class="product-inner">
            <div class="product-top">
              <div class="dotset"><span></span><span></span><span></span></div>
              <div class="live-badge">● LIVE TRACKING</div>
            </div>
            <div class="mock-body">
              <div class="mock-title">
                <h2>Strategy Dashboard</h2>
                <small>auto-refresh · protected</small>
              </div>

              <div class="metric-grid">
                <div class="metric">
                  <div class="metric-label">Open P&L</div>
                  <div class="metric-value green">+$1,248</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Win Rate</div>
                  <div class="metric-value">67.4%</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Pending</div>
                  <div class="metric-value">4</div>
                </div>
              </div>

              <div class="chart">
                <svg viewBox="0 0 620 170" preserveAspectRatio="none">
                  <path d="M0,125 C56,96 98,128 142,94 C190,58 236,76 286,52 C340,26 382,76 430,44 C486,6 540,38 620,18" fill="none" stroke="rgba(69,232,147,0.95)" stroke-width="5" stroke-linecap="round"/>
                  <path d="M0,125 C56,96 98,128 142,94 C190,58 236,76 286,52 C340,26 382,76 430,44 C486,6 540,38 620,18 L620,170 L0,170 Z" fill="rgba(69,232,147,0.10)"/>
                </svg>
              </div>

              <div class="trade-row"><div><strong>NVDA</strong></div><div class="green">LONG</div><div>OPEN</div><div class="green">+$248</div></div>
              <div class="trade-row"><div><strong>NFLX</strong></div><div class="red">SHORT</div><div>CLOSED</div><div class="green">+$277</div></div>
              <div class="trade-row"><div><strong>META</strong></div><div class="green">LONG</div><div>PENDING</div><div>—</div></div>
            </div>
          </div>
        </div>

        <div class="float-card">
          <div class="label">Full history</div>
          <div class="value">inside dashboard</div>
        </div>
      </div>
    </section>

    <section id="systems" class="wrap section">
      <div class="section-head">
        <h2>Built as infrastructure, not hype.</h2>
        <p class="lead">
          The product is designed around process: rules, execution, logging, and transparency. No vague alerts. No screenshots without context.
        </p>
      </div>

      <div class="feature-grid">
        <div class="feature-card">
          <div class="index">01 / Strategy logic</div>
          <h3>Clear trade lifecycle</h3>
          <p>Each setup is tracked from signal to entry, target, stop, cancellation, or end-of-day close.</p>
        </div>
        <div class="feature-card">
          <div class="index">02 / Execution workflow</div>
          <h3>Designed for automation</h3>
          <p>Signals can flow from TradingView into Telegram, broker bridge logic, and a structured trade ledger.</p>
        </div>
        <div class="feature-card">
          <div class="index">03 / Private visibility</div>
          <h3>Dashboard access</h3>
          <p>Approved users can view the live tracker and full trade-history link behind a password wall.</p>
        </div>
      </div>
    </section>

    <section id="workflow" class="wrap section">
      <div class="section-head">
        <h2>One workflow from signal to record.</h2>
        <p class="lead">
          A clean pipeline for forward-test visibility: strategy signal, execution event, Telegram notification, dashboard, and complete history.
        </p>
      </div>

      <div class="workflow">
        <div class="step"><div class="step-number">1</div><h3>Signal</h3><p>TradingView strategy events produce structured alerts.</p></div>
        <div class="step"><div class="step-number">2</div><h3>Execution</h3><p>Orders and cancels can be handled by the local broker bridge.</p></div>
        <div class="step"><div class="step-number">3</div><h3>Alerts</h3><p>Telegram receives readable trade lifecycle updates.</p></div>
        <div class="step"><div class="step-number">4</div><h3>Dashboard</h3><p>Positions, pending orders, P&L, and closed trades are tracked live.</p></div>
      </div>
    </section>

    <section id="access" class="wrap section">
      <div class="access-panel">
        <div>
          <h2>Request access to the Live Trade Dashboard.</h2>
          <p>
            Dashboard access is private. Contact us on Telegram to request the password, or join the channel for updates and strategy announcements.
          </p>
          <div class="tiny">Full Google Sheets trade history is available only inside the password-protected dashboard.</div>
        </div>
        <div class="access-buttons">
          <a class="btn btn-primary" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Access on Telegram</a>
          <a class="btn" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Join Telegram Channel</a>
          <a class="btn" href="/login">Open Dashboard Login</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="wrap footer">
    <strong>Disclaimer:</strong> This website and dashboard are for educational and informational purposes only and do not constitute financial advice, investment advice, or an offer to buy or sell securities. Results may include paper trading, simulated execution, or forward-testing data. Trading involves risk, and future results are not guaranteed.
  </footer>
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
      --bg: #f5f5f7;
      --surface: rgba(255,255,255,0.82);
      --ink: #0b0d12;
      --muted: #667085;
      --line: rgba(20, 26, 38, 0.10);
      --green: #0bbf6a;
      --red: #e5484d;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 14% 9%, rgba(37, 99, 235, 0.13), transparent 30%),
        radial-gradient(circle at 86% 15%, rgba(11, 191, 106, 0.16), transparent 28%),
        linear-gradient(180deg, #fbfbfd 0%, var(--bg) 100%);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, Segoe UI, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 440px;
      background: var(--surface);
      border: 1px solid rgba(255,255,255,0.78);
      border-radius: 30px;
      padding: 34px;
      box-shadow: 0 30px 90px rgba(18,26,43,0.12);
      backdrop-filter: blur(20px);
    }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: 0;
      font-size: 22px;
      font-weight: 650;
      letter-spacing: -0.5px;
      margin-bottom: 26px;
    }

    .logo span {
      color: var(--green);
    }

    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.05;
      letter-spacing: -1.4px;
      font-weight: 650;
    }

    p {
      color: var(--muted);
      line-height: 1.6;
      margin: 12px 0 28px;
      font-size: 15.5px;
    }

    label {
      display: block;
      color: #475467;
      font-size: 13px;
      font-weight: 520;
      margin-bottom: 8px;
    }

    input {
      width: 100%;
      background: rgba(255,255,255,0.74);
      border: 1px solid var(--line);
      border-radius: 16px;
      color: var(--ink);
      padding: 15px 16px;
      font-size: 16px;
      outline: none;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
    }

    input:focus {
      border-color: rgba(11, 191, 106, 0.45);
      box-shadow: 0 0 0 4px rgba(11, 191, 106, 0.10);
    }

    button {
      width: 100%;
      margin-top: 14px;
      border: 0;
      border-radius: 999px;
      padding: 14px 18px;
      background: #0b0d12;
      color: #ffffff;
      font-weight: 540;
      font-size: 15px;
      cursor: pointer;
      box-shadow: 0 14px 34px rgba(11,13,18,0.16);
    }

    .error {
      margin-top: 14px;
      color: var(--red);
      font-weight: 520;
      font-size: 14px;
    }

    .links {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-top: 22px;
      flex-wrap: wrap;
    }

    .links a {
      color: var(--muted);
      font-size: 14px;
    }

    .links a:hover {
      color: var(--ink);
    }
  </style>
</head>
<body>
  <div class="card">
    <a class="logo" href="/">Vixale<span>.</span></a>
    <h1>Private dashboard access.</h1>
    <p>Enter your dashboard password to view live positions, pending orders, P&L, and full trade-history access.</p>

    <form method="POST" action="/dashboard-login">
      <label for="password">Dashboard password</label>
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
      --bg: #05070c;
      --line: rgba(255,255,255,0.12);
      --text: #f5f7fb;
      --muted: #9da9bc;
      --green: #00e676;
      --red: #ff4d5e;
      --white: #ffffff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background:
        radial-gradient(circle at 12% 4%, rgba(90,169,255,0.22), transparent 30%),
        radial-gradient(circle at 85% 12%, rgba(0,230,118,0.12), transparent 28%),
        linear-gradient(180deg, #05070c 0%, #070b12 100%);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }

    a { color: inherit; text-decoration: none; }

    .wrap {
      max-width: 1440px;
      margin: 0 auto;
      padding: 28px;
    }

    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }

    .home-link, .dash-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.055);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
      font-weight: 850;
    }

    .home-link:hover, .dash-btn:hover {
      color: var(--text);
      background: rgba(255,255,255,0.09);
    }

    .dashboard-links {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .dash-btn {
      color: var(--text);
    }

    .dash-btn.primary {
      background: var(--green);
      border-color: var(--green);
      color: #031008;
    }

    .hero {
      background: linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045));
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 28px;
      box-shadow: 0 40px 120px rgba(0,0,0,0.38);
      backdrop-filter: blur(18px);
      margin-bottom: 20px;
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
      font-size: 36px;
      letter-spacing: -1.4px;
      line-height: 1.05;
    }

    .subtitle {
      color: var(--muted);
      font-size: 14px;
      margin-top: 7px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      background: rgba(0, 230, 118, 0.10);
      border: 1px solid rgba(0, 230, 118, 0.24);
      color: var(--green);
      font-weight: 900;
      font-size: 13px;
      white-space: nowrap;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 20px var(--green);
    }

    .updated {
      color: var(--muted);
      font-size: 13px;
      margin-top: 14px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 14px;
      margin-top: 24px;
    }

    .card {
      background: rgba(0,0,0,0.16);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px 16px;
      min-height: 112px;
    }

    .card .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.75px;
      font-weight: 900;
    }

    .card .value {
      margin-top: 13px;
      font-size: 26px;
      font-weight: 950;
      letter-spacing: -0.6px;
    }

    .positive { color: var(--green) !important; }
    .negative { color: var(--red) !important; }
    .neutral { color: var(--text) !important; }
    .long { color: var(--green); font-weight: 950; }
    .short { color: var(--red); font-weight: 950; }

    .section {
      background: rgba(255,255,255,0.055);
      border: 1px solid var(--line);
      border-radius: 22px;
      overflow: hidden;
      margin-top: 18px;
      box-shadow: 0 24px 70px rgba(0,0,0,0.22);
      backdrop-filter: blur(14px);
    }

    .section-header {
      padding: 16px 18px;
      background: rgba(255,255,255,0.055);
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: -0.2px;
    }

    .section-header span {
      color: var(--muted);
      font-size: 12px;
    }

    .table-wrap { overflow-x: auto; }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
    }

    th, td {
      padding: 13px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      text-align: right;
      font-size: 13px;
      white-space: nowrap;
    }

    th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.65px;
      background: rgba(0,0,0,0.16);
      font-weight: 950;
    }

    td:first-child, th:first-child,
    td:nth-child(2), th:nth-child(2) {
      text-align: left;
    }

    tr:hover td { background: rgba(90, 169, 255, 0.055); }

    .ticker {
      font-weight: 950;
      color: var(--white);
    }

    .empty {
      padding: 24px 18px;
      color: var(--muted);
      font-size: 14px;
    }

    .footer {
      margin-top: 20px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.045);
      border-radius: 18px;
      padding: 16px 18px;
    }

    @media (max-width: 1100px) {
      .cards { grid-template-columns: repeat(3, 1fr); }
    }

    @media (max-width: 720px) {
      .wrap { padding: 14px; }
      .brand h1 { font-size: 27px; }
      .cards { grid-template-columns: repeat(2, 1fr); }
      .card { min-height: 94px; }
      .card .value { font-size: 21px; }
      .dash-btn, .home-link { width: 100%; }
      .dashboard-links { width: 100%; }
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
      <strong>Disclaimer:</strong> Live strategy tracking dashboard. This page is for educational and informational purposes only and does not constitute financial advice. Results may include paper trading or forward-testing data. Trading involves risk, and future results are not guaranteed.
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
