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
  <meta name="description" content="Vixale builds and monitors algorithmic trading systems with private live dashboard access." />
  <style>
    :root {
      --bg: #05070c;
      --text: #f5f7fb;
      --muted: #9da9bc;
      --muted2: #c3ccda;
      --green: #00e676;
      --blue: #5aa9ff;
      --red: #ff4d5e;
      --line: rgba(255,255,255,0.12);
      --line2: rgba(255,255,255,0.22);
      --panel: rgba(255,255,255,0.055);
      --panel2: rgba(255,255,255,0.085);
    }

    * { box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
      margin: 0;
      background:
        radial-gradient(circle at 12% 4%, rgba(90,169,255,0.24), transparent 30%),
        radial-gradient(circle at 85% 12%, rgba(0,230,118,0.16), transparent 28%),
        radial-gradient(circle at 50% 95%, rgba(255,255,255,0.055), transparent 26%),
        linear-gradient(180deg, #05070c 0%, #070b12 52%, #03050a 100%);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      overflow-x: hidden;
    }

    a { color: inherit; text-decoration: none; }

    .noise {
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.035;
      background-image:
        linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: radial-gradient(circle at center, black, transparent 80%);
    }

    .nav {
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: blur(22px);
      background: rgba(5, 7, 12, 0.72);
      border-bottom: 1px solid var(--line);
    }

    .nav-inner {
      max-width: 1180px;
      margin: 0 auto;
      padding: 16px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
    }

    .logo {
      font-size: 22px;
      font-weight: 950;
      letter-spacing: -0.6px;
    }

    .logo span { color: var(--green); }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 20px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 750;
    }

    .nav-links a:hover { color: var(--text); }

    .nav-cta {
      color: #06100a !important;
      background: var(--green);
      border-radius: 999px;
      padding: 10px 14px;
      box-shadow: 0 0 30px rgba(0,230,118,0.18);
    }

    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 22px;
      position: relative;
      z-index: 2;
    }

    .hero {
      min-height: 760px;
      display: grid;
      grid-template-columns: 1fr 0.92fr;
      gap: 52px;
      align-items: center;
      padding: 80px 0 72px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 9px 13px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 999px;
      color: var(--muted2);
      background: rgba(255,255,255,0.055);
      font-size: 13px;
      font-weight: 850;
      margin-bottom: 22px;
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 22px var(--green);
    }

    h1 {
      margin: 0;
      font-size: clamp(52px, 8vw, 94px);
      line-height: 0.91;
      letter-spacing: -4.2px;
      max-width: 780px;
    }

    .grad {
      background: linear-gradient(135deg, #ffffff 0%, #d8e6ff 45%, var(--green) 100%);
      -webkit-background-clip: text;
      color: transparent;
    }

    .hero-text {
      margin: 26px 0 0;
      max-width: 635px;
      color: var(--muted2);
      font-size: 19px;
      line-height: 1.62;
    }

    .access-note {
      margin-top: 18px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.55;
      max-width: 630px;
    }

    .access-note strong { color: var(--text); }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 13px;
      margin-top: 30px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      border-radius: 15px;
      padding: 14px 18px;
      font-weight: 900;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.055);
      color: var(--text);
      transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
    }

    .btn:hover {
      transform: translateY(-2px);
      border-color: var(--line2);
      background: rgba(255,255,255,0.09);
    }

    .btn-primary {
      background: var(--green);
      border-color: var(--green);
      color: #031008;
      box-shadow: 0 16px 38px rgba(0,230,118,0.18);
    }

    .btn-primary:hover { background: #19f284; }

    .btn-ghost { color: var(--muted2); }

    .hero-visual { position: relative; }

    .orb {
      position: absolute;
      width: 360px;
      height: 360px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(0,230,118,0.18), transparent 64%);
      top: -70px;
      right: -80px;
      filter: blur(8px);
      z-index: -1;
    }

    .mock-window {
      border: 1px solid rgba(255,255,255,0.16);
      background: linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045));
      border-radius: 28px;
      padding: 14px;
      box-shadow: 0 40px 120px rgba(0,0,0,0.55);
      backdrop-filter: blur(16px);
      transform: rotate(-1deg);
    }

    .mock-inner {
      background: rgba(4,8,14,0.88);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      overflow: hidden;
    }

    .window-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.09);
      background: rgba(255,255,255,0.04);
    }

    .dots { display: flex; gap: 7px; }

    .dots span {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.28);
    }

    .live {
      font-size: 12px;
      font-weight: 900;
      color: var(--green);
      background: rgba(0,230,118,0.10);
      border: 1px solid rgba(0,230,118,0.24);
      border-radius: 999px;
      padding: 6px 9px;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      padding: 16px;
    }

    .metric {
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 16px;
      padding: 15px;
    }

    .metric-label {
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      font-weight: 900;
    }

    .metric-value {
      margin-top: 10px;
      font-size: 25px;
      font-weight: 950;
      letter-spacing: -0.6px;
    }

    .positive { color: var(--green); }
    .negative { color: var(--red); }

    .mini-chart {
      height: 125px;
      margin: 4px 16px 16px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.09);
      background:
        linear-gradient(180deg, rgba(0,230,118,0.16), transparent),
        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px),
        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
      background-size: auto, 44px 44px, 44px 44px;
      position: relative;
      overflow: hidden;
    }

    .mini-chart svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .ticker-row {
      display: grid;
      grid-template-columns: 1fr 0.8fr 0.9fr 0.9fr;
      gap: 12px;
      padding: 13px 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
      color: var(--muted2);
    }

    .ticker-row strong { color: var(--text); }

    .section { padding: 72px 0; }

    .section-head {
      max-width: 780px;
      margin-bottom: 28px;
    }

    .section h2 {
      margin: 0 0 12px;
      font-size: clamp(34px, 4.5vw, 54px);
      letter-spacing: -2.2px;
      line-height: 1.02;
    }

    .section p.lead {
      margin: 0;
      color: var(--muted2);
      font-size: 18px;
      line-height: 1.65;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 26px;
      min-height: 240px;
      backdrop-filter: blur(18px);
    }

    .card .num {
      color: var(--green);
      font-weight: 950;
      font-size: 13px;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 44px;
    }

    .card h3 {
      margin: 0 0 12px;
      font-size: 22px;
      letter-spacing: -0.6px;
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

    .flow-box {
      background: rgba(255,255,255,0.055);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 22px;
      min-height: 150px;
    }

    .flow-box span {
      display: inline-flex;
      width: 38px;
      height: 38px;
      border-radius: 14px;
      align-items: center;
      justify-content: center;
      background: rgba(0,230,118,0.10);
      border: 1px solid rgba(0,230,118,0.23);
      color: var(--green);
      font-weight: 950;
      margin-bottom: 16px;
    }

    .flow-box h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .flow-box p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
      font-size: 14px;
    }

    .access-panel {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 18px;
      background: linear-gradient(135deg, rgba(0,230,118,0.12), rgba(90,169,255,0.08));
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 30px;
      padding: 34px;
      align-items: center;
    }

    .access-panel h2 {
      font-size: clamp(32px, 4vw, 50px);
      margin: 0 0 12px;
      letter-spacing: -1.8px;
    }

    .access-panel p {
      color: var(--muted2);
      line-height: 1.65;
      font-size: 17px;
      margin: 0;
    }

    .access-buttons {
      display: grid;
      gap: 12px;
    }

    .small-note {
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .footer {
      padding: 36px 0;
      color: var(--muted);
      border-top: 1px solid var(--line);
      font-size: 13px;
      line-height: 1.7;
    }

    @media (max-width: 960px) {
      .hero {
        grid-template-columns: 1fr;
        min-height: auto;
        padding-top: 54px;
      }

      .cards, .flow, .access-panel {
        grid-template-columns: 1fr;
      }

      .nav-links a:not(.nav-cta) {
        display: none;
      }
    }

    @media (max-width: 560px) {
      .wrap, .nav-inner {
        padding-left: 15px;
        padding-right: 15px;
      }

      h1 { letter-spacing: -2.4px; }

      .btn { width: 100%; }

      .metric-grid { grid-template-columns: 1fr; }

      .ticker-row { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="noise"></div>

  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="logo">Vixale<span>.</span></a>
      <div class="nav-links">
        <a href="#systems">Systems</a>
        <a href="#transparency">Transparency</a>
        <a href="#access">Access</a>
        <a class="nav-cta" href="/login">Live Dashboard</a>
      </div>
    </div>
  </nav>

  <main>
    <section class="wrap hero">
      <div>
        <div class="eyebrow"><span class="pulse"></span> Live-tested trading infrastructure</div>
        <h1>Trading Systems, <span class="grad">Engineered.</span></h1>
        <p class="hero-text">
          Vixale builds, monitors, and documents algorithmic trading systems with a clean execution workflow and private live dashboard access.
        </p>
        <p class="access-note">
          To request access to the <strong>Live Trade Dashboard</strong>, contact us on Telegram or join the Telegram channel for updates.
        </p>

        <div class="actions">
          <a class="btn btn-primary" href="/login">View Live Dashboard</a>
          <a class="btn" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Access on Telegram</a>
          <a class="btn btn-ghost" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Join Telegram Channel</a>
        </div>
      </div>

      <div class="hero-visual">
        <div class="orb"></div>
        <div class="mock-window">
          <div class="mock-inner">
            <div class="window-top">
              <div class="dots"><span></span><span></span><span></span></div>
              <div class="live">● LIVE TRACKING</div>
            </div>

            <div class="metric-grid">
              <div class="metric">
                <div class="metric-label">Open P&L</div>
                <div class="metric-value positive">+$1,248</div>
              </div>
              <div class="metric">
                <div class="metric-label">Win Rate</div>
                <div class="metric-value">67.4%</div>
              </div>
              <div class="metric">
                <div class="metric-label">Pending Orders</div>
                <div class="metric-value">4</div>
              </div>
              <div class="metric">
                <div class="metric-label">Closed Today</div>
                <div class="metric-value positive">+$532</div>
              </div>
            </div>

            <div class="mini-chart">
              <svg viewBox="0 0 600 160" preserveAspectRatio="none">
                <path d="M0,118 C55,92 82,132 132,102 C185,68 210,86 260,58 C325,22 365,78 420,46 C478,12 520,38 600,18" fill="none" stroke="rgba(0,230,118,0.95)" stroke-width="5" stroke-linecap="round"/>
                <path d="M0,118 C55,92 82,132 132,102 C185,68 210,86 260,58 C325,22 365,78 420,46 C478,12 520,38 600,18 L600,160 L0,160 Z" fill="rgba(0,230,118,0.10)"/>
              </svg>
            </div>

            <div class="ticker-row">
              <div><strong>NVDA</strong></div>
              <div class="positive">LONG</div>
              <div>OPEN</div>
              <div class="positive">+$248</div>
            </div>
            <div class="ticker-row">
              <div><strong>NFLX</strong></div>
              <div class="negative">SHORT</div>
              <div>CLOSED</div>
              <div class="positive">+$277</div>
            </div>
            <div class="ticker-row">
              <div><strong>META</strong></div>
              <div class="positive">LONG</div>
              <div>PENDING</div>
              <div>—</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="systems" class="wrap section">
      <div class="section-head">
        <h2>Built like trading software, not a signal room.</h2>
        <p class="lead">
          The system is designed around structured alerts, execution workflow, tracking, and clean reporting.
        </p>
      </div>

      <div class="cards">
        <div class="card">
          <div class="num">01 / Research</div>
          <h3>Strategy Logic</h3>
          <p>Rules-based trading systems with defined entry, target, stop, and lifecycle events.</p>
        </div>

        <div class="card">
          <div class="num">02 / Signals</div>
          <h3>Live Alerts</h3>
          <p>Signal delivery with structured trade data: symbol, side, entry, target, stop, and quantity.</p>
        </div>

        <div class="card">
          <div class="num">03 / Tracking</div>
          <h3>Live Dashboard</h3>
          <p>Private dashboard access for open positions, pending orders, closed trades, and P&L tracking.</p>
        </div>
      </div>
    </section>

    <section id="transparency" class="wrap section">
      <div class="section-head">
        <h2>Signal → execution → tracking.</h2>
        <p class="lead">
          Vixale focuses on the full workflow: from strategy signal to broker bridge, notifications, and transparent trade logging.
        </p>
      </div>

      <div class="flow">
        <div class="flow-box">
          <span>1</span>
          <h3>TradingView Signal</h3>
          <p>Strategy alerts generate structured setup, entry, target, stop, and close events.</p>
        </div>

        <div class="flow-box">
          <span>2</span>
          <h3>Execution Bridge</h3>
          <p>Signals can be routed into an execution workflow for broker-side order handling.</p>
        </div>

        <div class="flow-box">
          <span>3</span>
          <h3>Telegram Alerts</h3>
          <p>Trade events are delivered to Telegram with readable status and P&L details.</p>
        </div>

        <div class="flow-box">
          <span>4</span>
          <h3>Live Dashboard</h3>
          <p>Open positions, pending orders, and closed trades are tracked in a private dashboard.</p>
        </div>
      </div>
    </section>

    <section id="access" class="wrap section">
      <div class="access-panel">
        <div>
          <h2>Request access to the Live Trade Dashboard.</h2>
          <p>
            Dashboard access is private. To request the password, contact us on Telegram or join the channel for updates and strategy announcements.
          </p>
          <div class="small-note">
            Full trade history is available only inside the password-protected dashboard.
          </div>
        </div>

        <div class="access-buttons">
          <a class="btn btn-primary" href="${TELEGRAM_DM_URL}" target="_blank" rel="noopener noreferrer">Request Access on Telegram</a>
          <a class="btn" href="${TELEGRAM_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Join Telegram Channel</a>
          <a class="btn btn-ghost" href="/login">Go to Dashboard Login</a>
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
      --bg: #05070c;
      --line: rgba(255,255,255,0.14);
      --text: #f5f7fb;
      --muted: #9da9bc;
      --green: #00e676;
      --red: #ff4d5e;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top left, rgba(90, 169, 255, 0.22), transparent 34%),
        radial-gradient(circle at top right, rgba(0, 230, 118, 0.14), transparent 30%),
        linear-gradient(180deg, #05070c 0%, #070b12 100%);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 450px;
      background: linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045));
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 34px;
      box-shadow: 0 40px 120px rgba(0,0,0,0.55);
      backdrop-filter: blur(18px);
    }

    .logo {
      font-size: 28px;
      font-weight: 950;
      margin-bottom: 10px;
      letter-spacing: -0.6px;
    }

    .logo span { color: var(--green); }

    h1 {
      margin: 0;
      font-size: 26px;
      letter-spacing: -0.8px;
    }

    p {
      color: var(--muted);
      line-height: 1.58;
      margin: 11px 0 26px;
    }

    label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
    }

    input {
      width: 100%;
      background: rgba(0,0,0,0.24);
      border: 1px solid var(--line);
      border-radius: 15px;
      color: var(--text);
      padding: 15px;
      font-size: 16px;
      outline: none;
    }

    input:focus {
      border-color: rgba(0, 230, 118, 0.55);
      box-shadow: 0 0 0 4px rgba(0, 230, 118, 0.08);
    }

    button {
      width: 100%;
      margin-top: 16px;
      border: 0;
      border-radius: 15px;
      padding: 15px 18px;
      background: var(--green);
      color: #031008;
      font-weight: 950;
      font-size: 15px;
      cursor: pointer;
      box-shadow: 0 16px 38px rgba(0,230,118,0.18);
    }

    .error {
      margin-top: 14px;
      color: var(--red);
      font-weight: 850;
      font-size: 14px;
    }

    .links {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .links a {
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
    }

    .links a:hover { color: var(--text); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Vixale<span>.</span></div>
    <h1>Live Dashboard Access</h1>
    <p>Enter the dashboard password to view the live trade tracker and full trade history link.</p>

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
