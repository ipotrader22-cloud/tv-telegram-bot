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
  const keyFromQuery = String(req.query.key || '');
  const cookies = parseCookies(req);
  const keyFromCookie = cookies.vixale_dashboard_key || '';

  return DASHBOARD_KEY && (keyFromQuery === DASHBOARD_KEY || keyFromCookie === DASHBOARD_KEY);
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OLD TEXT ALERT PARSER
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
// NEW JSON ALERT PARSER
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
// LANDING PAGE HTML
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderLandingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vixale | Trading Systems, Engineered</title>
  <meta name="description" content="Vixale builds, tests, and monitors algorithmic trading systems with live forward-test transparency." />
  <style>
    :root {
      --bg: #060a12;
      --panel: #0f1724;
      --panel2: #131d2b;
      --line: #223044;
      --text: #eef5ff;
      --muted: #9fb2ca;
      --green: #00e676;
      --red: #ff4d5e;
      --blue: #4da3ff;
      --white: #ffffff;
      --gold: #ffd166;
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
        radial-gradient(circle at top left, rgba(77, 163, 255, 0.18), transparent 34%),
        radial-gradient(circle at top right, rgba(0, 230, 118, 0.12), transparent 30%),
        radial-gradient(circle at bottom right, rgba(255, 209, 102, 0.07), transparent 22%),
        var(--bg);
      color: var(--text);
      font-family: Inter, Arial, Helvetica, sans-serif;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .nav {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(18px);
      background: rgba(6, 10, 18, 0.76);
      border-bottom: 1px solid rgba(34, 48, 68, 0.75);
    }

    .nav-inner {
      max-width: 1180px;
      margin: 0 auto;
      padding: 16px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }

    .logo {
      font-weight: 950;
      font-size: 22px;
      letter-spacing: -0.4px;
    }

    .logo span {
      color: var(--green);
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 20px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 700;
    }

    .nav-links a:hover {
      color: var(--white);
    }

    .nav-cta {
      border: 1px solid rgba(0, 230, 118, 0.32);
      background: rgba(0, 230, 118, 0.10);
      color: var(--green) !important;
      padding: 10px 14px;
      border-radius: 999px;
    }

    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 22px;
    }

    .hero {
      padding: 86px 0 68px;
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 44px;
      align-items: center;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      background: rgba(77, 163, 255, 0.10);
      border: 1px solid rgba(77, 163, 255, 0.24);
      color: #b9d9ff;
      font-size: 13px;
      font-weight: 900;
      margin-bottom: 18px;
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 18px var(--green);
    }

    h1 {
      margin: 0;
      font-size: clamp(44px, 6vw, 76px);
      line-height: 0.96;
      letter-spacing: -2.8px;
    }

    .grad {
      background: linear-gradient(135deg, var(--white), #b8d5ff 48%, var(--green));
      -webkit-background-clip: text;
      color: transparent;
    }

    .hero-text {
      margin-top: 22px;
      max-width: 620px;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.65;
    }

    .hero-actions {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 30px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      padding: 14px 18px;
      border-radius: 14px;
      font-weight: 900;
      border: 1px solid var(--line);
      transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }

    .btn:hover {
      transform: translateY(-1px);
    }

    .btn-primary {
      background: var(--green);
      color: #031008;
      border-color: var(--green);
      box-shadow: 0 12px 30px rgba(0, 230, 118, 0.18);
    }

    .btn-secondary {
      background: rgba(15, 23, 36, 0.82);
      color: var(--text);
    }

    .hero-card {
      border: 1px solid var(--line);
      background: linear-gradient(145deg, rgba(15,23,36,0.95), rgba(8,13,22,0.95));
      border-radius: 24px;
      padding: 22px;
      box-shadow: 0 24px 70px rgba(0,0,0,0.35);
    }

    .mini-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }

    .mini-title {
      font-weight: 950;
      font-size: 18px;
    }

    .live-badge {
      color: var(--green);
      background: rgba(0,230,118,0.10);
      border: 1px solid rgba(0,230,118,0.25);
      padding: 7px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 900;
    }

    .mini-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .mini-box {
      background: rgba(17,26,40,0.86);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
    }

    .mini-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      font-weight: 900;
    }

    .mini-value {
      margin-top: 10px;
      font-size: 25px;
      font-weight: 950;
    }

    .positive {
      color: var(--green);
    }

    .negative {
      color: var(--red);
    }

    .mock-table {
      margin-top: 14px;
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }

    .mock-row {
      display: grid;
      grid-template-columns: 1fr 0.8fr 0.8fr 0.9fr;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(34,48,68,0.55);
      font-size: 13px;
    }

    .mock-row:last-child {
      border-bottom: 0;
    }

    .mock-head {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.7px;
      font-weight: 950;
      background: rgba(8,13,22,0.58);
    }

    .section {
      padding: 64px 0;
    }

    .section h2 {
      font-size: clamp(30px, 4vw, 46px);
      margin: 0 0 12px;
      letter-spacing: -1.4px;
    }

    .section-lead {
      color: var(--muted);
      font-size: 17px;
      line-height: 1.65;
      max-width: 760px;
      margin-bottom: 28px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .service-card {
      border: 1px solid var(--line);
      background: rgba(15,23,36,0.78);
      border-radius: 20px;
      padding: 24px;
      min-height: 210px;
    }

    .service-card .icon {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: rgba(77,163,255,0.12);
      border: 1px solid rgba(77,163,255,0.25);
      color: #b9d9ff;
      font-size: 20px;
      margin-bottom: 16px;
    }

    .service-card h3 {
      margin: 0 0 10px;
      font-size: 19px;
    }

    .service-card p {
      margin: 0;
      color: var(--muted);
      line-height: 1.58;
      font-size: 15px;
    }

    .split {
      display: grid;
      grid-template-columns: 0.9fr 1.1fr;
      gap: 22px;
      align-items: stretch;
    }

    .panel {
      border: 1px solid var(--line);
      background: rgba(15,23,36,0.78);
      border-radius: 22px;
      padding: 26px;
    }

    .bullets {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }

    .bullet {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      color: var(--muted);
      line-height: 1.5;
    }

    .check {
      color: var(--green);
      font-weight: 950;
      margin-top: 1px;
    }

    .cta {
      border: 1px solid rgba(0,230,118,0.24);
      background: linear-gradient(135deg, rgba(0,230,118,0.10), rgba(77,163,255,0.09));
      border-radius: 28px;
      padding: 36px;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: center;
      flex-wrap: wrap;
    }

    .cta h2 {
      margin: 0 0 8px;
      font-size: 34px;
    }

    .cta p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
      max-width: 720px;
    }

    .footer {
      padding: 34px 0;
      color: var(--muted);
      border-top: 1px solid var(--line);
      font-size: 13px;
      line-height: 1.65;
    }

    @media (max-width: 920px) {
      .hero {
        grid-template-columns: 1fr;
        padding-top: 54px;
      }

      .cards {
        grid-template-columns: 1fr;
      }

      .split {
        grid-template-columns: 1fr;
      }

      .nav-links a:not(.nav-cta) {
        display: none;
      }
    }

    @media (max-width: 560px) {
      .nav-inner {
        padding: 14px;
      }

      .wrap {
        padding: 0 14px;
      }

      .mini-grid {
        grid-template-columns: 1fr;
      }

      .mock-row {
        grid-template-columns: 1fr 0.8fr;
      }

      .hero-actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  </style>
</head>
<body>
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
        <div class="eyebrow"><span class="pulse"></span> Algorithmic trading systems + live tracking</div>
        <h1>Trading Systems, <span class="grad">Engineered.</span></h1>
        <p class="hero-text">
          Vixale builds, tests, and monitors algorithmic trading systems with a focus on execution, transparency, and forward-test visibility for active traders.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/login">View Live Dashboard</a>
          <a class="btn btn-secondary" href="#access">Request Strategy Access</a>
        </div>
      </div>

      <div class="hero-card">
        <div class="mini-top">
          <div class="mini-title">Live Strategy Tracker</div>
          <div class="live-badge">● LIVE</div>
        </div>

        <div class="mini-grid">
          <div class="mini-box">
            <div class="mini-label">Open Positions</div>
            <div class="mini-value">Live</div>
          </div>
          <div class="mini-box">
            <div class="mini-label">Pending Orders</div>
            <div class="mini-value">Tracked</div>
          </div>
          <div class="mini-box">
            <div class="mini-label">Running P&L</div>
            <div class="mini-value positive">Visible</div>
          </div>
          <div class="mini-box">
            <div class="mini-label">Closed Trades</div>
            <div class="mini-value">Logged</div>
          </div>
        </div>

        <div class="mock-table">
          <div class="mock-row mock-head">
            <div>Symbol</div>
            <div>Side</div>
            <div>Status</div>
            <div>P&L</div>
          </div>
          <div class="mock-row">
            <div><strong>NVDA</strong></div>
            <div class="positive"><strong>LONG</strong></div>
            <div>Open</div>
            <div class="positive">+$248</div>
          </div>
          <div class="mock-row">
            <div><strong>NFLX</strong></div>
            <div class="negative"><strong>SHORT</strong></div>
            <div>Closed</div>
            <div class="positive">+$277</div>
          </div>
        </div>
      </div>
    </section>

    <section id="systems" class="wrap section">
      <h2>What Vixale Builds</h2>
      <p class="section-lead">
        A practical trading infrastructure layer: strategy research, signal delivery, execution automation, and live monitoring.
      </p>

      <div class="cards">
        <div class="service-card">
          <div class="icon">⚙️</div>
          <h3>Trading Systems</h3>
          <p>Custom strategy logic, backtesting workflows, optimization support, and deployment-ready execution rules.</p>
        </div>

        <div class="service-card">
          <div class="icon">📡</div>
          <h3>Live Signals</h3>
          <p>Structured trade alerts with entry, target, stop, quantity, and lifecycle tracking from setup to close.</p>
        </div>

        <div class="service-card">
          <div class="icon">🤖</div>
          <h3>Execution Automation</h3>
          <p>TradingView alerts, broker bridge logic, Telegram notifications, and live trade ledger infrastructure.</p>
        </div>
      </div>
    </section>

    <section id="transparency" class="wrap section">
      <div class="split">
        <div class="panel">
          <h2>Forward-Test Transparency</h2>
          <p class="section-lead">
            A strategy is only useful when its live behavior can be monitored. Vixale keeps a structured journal of setups, fills, pending orders, open positions, and closed trades.
          </p>
          <a class="btn btn-primary" href="/login">Open Live Dashboard</a>
        </div>

        <div class="panel">
          <h2>What traders can see</h2>
          <div class="bullets">
            <div class="bullet"><span class="check">✓</span><span>Current open positions and running P&L</span></div>
            <div class="bullet"><span class="check">✓</span><span>Pending orders waiting for entry</span></div>
            <div class="bullet"><span class="check">✓</span><span>Recent closed trades with P&L and exit type</span></div>
            <div class="bullet"><span class="check">✓</span><span>Win rate, total closed P&L, and daily closed P&L</span></div>
            <div class="bullet"><span class="check">✓</span><span>Auto-refreshing dashboard for live forward-test review</span></div>
          </div>
        </div>
      </div>
    </section>

    <section id="access" class="wrap section">
      <div class="cta">
        <div>
          <h2>Request Strategy Access</h2>
          <p>
            Vixale is currently focused on forward-tested trading systems, signal infrastructure, and automation workflows for active traders.
          </p>
        </div>
        <a class="btn btn-primary" href="mailto:info@vixale.com">Contact Vixale</a>
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
      --bg: #060a12;
      --panel: #0f1724;
      --line: #223044;
      --text: #eef5ff;
      --muted: #9fb2ca;
      --green: #00e676;
      --red: #ff4d5e;
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
        radial-gradient(circle at top left, rgba(77, 163, 255, 0.18), transparent 34%),
        radial-gradient(circle at top right, rgba(0, 230, 118, 0.12), transparent 30%),
        var(--bg);
      color: var(--text);
      font-family: Inter, Arial, Helvetica, sans-serif;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 440px;
      background: linear-gradient(135deg, rgba(17,26,40,0.96), rgba(10,15,24,0.96));
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 24px 70px rgba(0,0,0,0.35);
    }

    .logo {
      font-size: 28px;
      font-weight: 950;
      margin-bottom: 10px;
      letter-spacing: -0.5px;
    }

    .logo span {
      color: var(--green);
    }

    h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: -0.4px;
    }

    p {
      color: var(--muted);
      line-height: 1.55;
      margin: 10px 0 24px;
    }

    label {
      display: block;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      margin-bottom: 8px;
    }

    input {
      width: 100%;
      background: #070b13;
      border: 1px solid var(--line);
      border-radius: 14px;
      color: var(--text);
      padding: 14px 15px;
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
      border-radius: 14px;
      padding: 14px 18px;
      background: var(--green);
      color: #031008;
      font-weight: 950;
      font-size: 15px;
      cursor: pointer;
    }

    .error {
      margin-top: 14px;
      color: var(--red);
      font-weight: 800;
      font-size: 14px;
    }

    .back {
      display: inline-block;
      margin-top: 18px;
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
    }

    .back:hover {
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Vixale<span>.</span></div>
    <h1>Dashboard Access</h1>
    <p>Enter the dashboard password to view the live forward-test tracker.</p>

    <form method="POST" action="/dashboard-login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus />
      <button type="submit">Open Dashboard</button>
    </form>

    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}

    <a class="back" href="/">← Back to Vixale</a>
  </div>
</body>
</html>`;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD HTML
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
      --bg: #070b13;
      --panel: #0f1724;
      --panel2: #151f2d;
      --card: #111a28;
      --line: #223044;
      --text: #eaf2ff;
      --muted: #8fa3bd;
      --green: #00e676;
      --red: #ff4d5e;
      --yellow: #ffd166;
      --blue: #4da3ff;
      --white: #ffffff;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(77, 163, 255, 0.18), transparent 34%),
        radial-gradient(circle at top right, rgba(0, 230, 118, 0.10), transparent 28%),
        var(--bg);
      color: var(--text);
      font-family: Inter, Arial, Helvetica, sans-serif;
    }

    .wrap {
      max-width: 1440px;
      margin: 0 auto;
      padding: 28px;
    }

    .hero {
      background: linear-gradient(135deg, rgba(17,26,40,0.96), rgba(10,15,24,0.96));
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.32);
      margin-bottom: 22px;
    }

    .topline {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .brand h1 {
      margin: 0;
      font-size: 34px;
      letter-spacing: -0.6px;
      line-height: 1.05;
    }

    .brand .subtitle {
      color: var(--muted);
      font-size: 14px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      background: rgba(0, 230, 118, 0.10);
      border: 1px solid rgba(0, 230, 118, 0.25);
      color: var(--green);
      font-weight: 700;
      font-size: 13px;
      white-space: nowrap;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
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
      background: rgba(15, 23, 36, 0.86);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px 16px;
      min-height: 110px;
    }

    .card .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      font-weight: 800;
    }

    .card .value {
      margin-top: 13px;
      font-size: 25px;
      font-weight: 900;
      letter-spacing: -0.4px;
    }

    .positive {
      color: var(--green) !important;
    }

    .negative {
      color: var(--red) !important;
    }

    .neutral {
      color: var(--text) !important;
    }

    .long {
      color: var(--green);
      font-weight: 900;
    }

    .short {
      color: var(--red);
      font-weight: 900;
    }

    .section {
      background: rgba(15, 23, 36, 0.90);
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
      margin-top: 18px;
      box-shadow: 0 14px 40px rgba(0,0,0,0.22);
    }

    .section-header {
      padding: 16px 18px;
      background: rgba(21, 31, 45, 0.92);
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: 0.2px;
    }

    .section-header span {
      color: var(--muted);
      font-size: 12px;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
    }

    th, td {
      padding: 13px 14px;
      border-bottom: 1px solid rgba(34,48,68,0.55);
      text-align: right;
      font-size: 13px;
      white-space: nowrap;
    }

    th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.65px;
      background: rgba(8, 13, 22, 0.48);
      font-weight: 900;
    }

    td:first-child, th:first-child,
    td:nth-child(2), th:nth-child(2) {
      text-align: left;
    }

    tr:hover td {
      background: rgba(77, 163, 255, 0.055);
    }

    .ticker {
      font-weight: 900;
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
      line-height: 1.55;
      border: 1px solid var(--line);
      background: rgba(15, 23, 36, 0.62);
      border-radius: 16px;
      padding: 16px 18px;
    }

    @media (max-width: 1100px) {
      .cards {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 720px) {
      .wrap {
        padding: 14px;
      }

      .brand h1 {
        font-size: 26px;
      }

      .cards {
        grid-template-columns: repeat(2, 1fr);
      }

      .card {
        min-height: 92px;
      }

      .card .value {
        font-size: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="topline">
        <div class="brand">
          <h1>Vixale Live Strategy Dashboard</h1>
          <div class="subtitle">Live forward-test / paper-trading tracker</div>
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
        <span>Latest 20 completed trades</span>
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
      finalRow = await processLedger(parsedRow);
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

  const password = String(req.body.password || '');

  if (password !== DASHBOARD_KEY) {
    return res.status(401).send(renderLoginHtml('Incorrect password. Please try again.'));
  }

  res.cookie('vixale_dashboard_key', DASHBOARD_KEY, {
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

    const keyFromQuery = String(req.query.key || '');

    if (keyFromQuery === DASHBOARD_KEY) {
      res.cookie('vixale_dashboard_key', DASHBOARD_KEY, {
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
