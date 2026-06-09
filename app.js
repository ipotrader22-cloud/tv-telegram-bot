const express = require('express');
const { google } = require('googleapis');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: '*/*', limit: '2mb' }));

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const TRADES_SHEET = 'Trades';
const PENDING_SHEET = 'Pending';
const OPEN_POSITIONS_SHEET = 'Open Positions';
const CLOSED_TRADES_SHEET = 'Closed Trades';
const LEGACY_POSITIONS_SHEET = 'Positions';

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

    // EOD_CLOSE is real position close.
    EOD_CLOSE: 'EOD',
    NEW_DAY_EMERGENCY_CLOSE: 'EOD',

    // These are pending-order/session resets, not closed trades.
    EOD_RESET: 'CANCEL',
    NEW_DAY_RESET: 'CANCEL',
    CANCEL_REPLACE: 'CANCEL',
  };

  const event = eventMap[eventRaw] || eventRaw || 'UNKNOWN';

  const symbol = String(data.symbol || '').trim();

  // Important:
  // If side is missing on EOD_RESET / NEW_DAY_RESET, leave side blank.
  // That allows us to remove all pending rows by symbol.
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
    status,
    raw: JSON.stringify(data, null, 2),

    // Kept in raw/debug, not displayed in TG
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
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
      row.result !== '' ? `Profit: $${row.result}` : '',
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'SL') {
    return [
      `⛔ <b>${titleBase} CLOSE STOP</b>`,
      '',
      row.exit !== '' ? `❌ Exit Close: <b>${row.exit}</b>` : '',
      row.size !== '' ? `📦 Qty: <b>${row.size}</b>` : '',
      row.result !== '' ? `Loss: -$${Math.abs(row.result)}` : '',
    ].filter(Boolean).join('\n');
  }

  if (row.event === 'EOD') {
    return [
      `⏰ <b>${titleBase || row.symbol} EOD CLOSE</b>`,
      '',
      row.exit !== '' ? `Exit Price: <b>${row.exit}</b>` : '',
      row.size !== '' ? `Qty: <b>${row.size}</b>` : '',
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

  // Go bottom-up so row numbers don't shift after deletion.
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
  if (!sheets) return;

  await appendToTradesSheet(sheets, row);

  if (!row || row.event === 'UNKNOWN') return;

  // SETUP → Pending
  if (row.event === 'SETUP') {
    if (!row.trade_id) return;
    await upsertPending(sheets, row);
    return;
  }

  // FILL → remove Pending, add/update Open Positions
  if (row.event === 'FILL') {
    if (!row.trade_id) return;

    const pendingRow = await removeRowByTradeId(sheets, PENDING_SHEET, row.trade_id);
    await cleanupLegacyPositionIfExists(sheets, row.trade_id);
    await upsertOpenPosition(sheets, row, pendingRow);
    return;
  }

  // CANCEL / EOD_RESET / NEW_DAY_RESET / CANCEL_REPLACE
  if (row.event === 'CANCEL') {
    if (row.trade_id) {
      await removeRowByTradeId(sheets, PENDING_SHEET, row.trade_id);
      await cleanupLegacyPositionIfExists(sheets, row.trade_id);
      return;
    }

    // If side is missing, remove all pending rows for this symbol.
    if (row.symbol) {
      await removePendingRowsBySymbol(sheets, row.symbol);
      return;
    }

    return;
  }

  // TP / SL / EOD → remove Open Position, add Closed Trade
  if (row.event === 'TP' || row.event === 'SL' || row.event === 'EOD') {
    if (!row.trade_id) return;

    const openPosition = await removeOpenPosition(sheets, row.trade_id);
    await cleanupLegacyPositionIfExists(sheets, row.trade_id);
    await appendClosedTrade(sheets, openPosition, row);
    return;
  }
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

  // Fallback if Telegram rejects HTML parsing for some old/raw alert text.
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

    const telegramMessage = formatTelegramMessage(parsedRow, message);

    await sendTelegram(telegramMessage);

    try {
      await processLedger(parsedRow);
    } catch (sheetErr) {
      console.error('Google Sheets / ledger failed:', sheetErr);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error');
  }
}

app.post('/', handleTradingViewWebhook);
app.post('/tv', handleTradingViewWebhook);

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
