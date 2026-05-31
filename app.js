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
const POSITIONS_SHEET = 'Positions';
const CLOSED_TRADES_SHEET = 'Closed Trades';

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
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

function nowIso() {
  return new Date().toISOString();
}

function normalizeRawMessage(reqBody) {
  return typeof reqBody === 'string'
    ? reqBody
    : JSON.stringify(reqBody, null, 2);
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Parser
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function parseTradingViewMessage(message) {
  const raw = String(message || '').trim();

  let symbol = '';
  let side = '';
  let event = '';

  const firstLine = raw.split('\n')[0] || '';

  const headerMatch = firstLine.match(/([A-Z0-9:_\.-]+)\s+(LONG|SHORT)/i);
  if (headerMatch) {
    symbol = headerMatch[1].trim();
    side = headerMatch[2].trim().toUpperCase();
  }

  if (/SETUP/i.test(firstLine)) {
    event = 'SETUP';
  } else if (/Entry filled/i.test(raw)) {
    event = 'FILL';
  } else if (/EOD CLOSE/i.test(firstLine)) {
    event = 'EOD';
  } else if (/ЦЕЛЬ/i.test(firstLine) || /Profit:/i.test(raw)) {
    event = 'TP';
  } else if (/СТОП/i.test(firstLine) || /Actual loss:/i.test(raw)) {
    event = 'SL';
  } else if (/CANCELED/i.test(firstLine)) {
    event = 'CANCEL';
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
    cleanNumber(extract(/ЦЕЛЬ:\s*([0-9\.,-]+)/i, raw));

  const filled =
    cleanNumber(extract(/Filled:\s*([0-9\.,-]+)/i, raw));

  const close =
    cleanNumber(extract(/Close:\s*([0-9\.,-]+)/i, raw));

  const stop = cleanNumber(
    extract(/СТОП на закрытие (?:ниже|выше)\s*([0-9\.,-]+)/i, raw)
  );

  let exit = '';
  if (event === 'TP') exit = filled;
  if (event === 'SL' || event === 'EOD') exit = close;

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
    timestamp: nowIso(),
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
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Google Sheets client
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

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trades raw log
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function appendToTradesSheet(sheets, row) {
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

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Positions sheet helpers
// Headers:
// trade_id | timestamp | symbol | side | status | entry | size | target | stop | unrealized | raw
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function readPositions(sheets) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${POSITIONS_SHEET}!A:K`,
  });

  return response.data.values || [];
}

function findPositionRowIndex(values, tradeId) {
  // values[0] = headers, sheet rows are 1-based
  for (let i = 1; i < values.length; i++) {
    if ((values[i][0] || '').toUpperCase() === tradeId.toUpperCase()) {
      return i + 1;
    }
  }
  return -1;
}

async function upsertPosition(sheets, row, status) {
  if (!row.trade_id) return;

  const values = await readPositions(sheets);
  const sheetRow = findPositionRowIndex(values, row.trade_id);

  const existing = sheetRow > 0 ? values[sheetRow - 1] : [];

  const positionRow = [
    row.trade_id,
    row.timestamp || existing[1] || '',
    row.symbol || existing[2] || '',
    row.side || existing[3] || '',
    status,
    row.entry || existing[5] || '',
    row.size || existing[6] || '',
    row.target || existing[7] || '',
    row.stop || existing[8] || '',
    '',
    row.raw || existing[10] || '',
  ];

  if (sheetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${POSITIONS_SHEET}!A${sheetRow}:K${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [positionRow],
      },
    });

    console.log('Position updated:', row.trade_id, status);
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${POSITIONS_SHEET}!A:K`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [positionRow],
      },
    });

    console.log('Position appended:', row.trade_id, status);
  }
}

async function clearPosition(sheets, tradeId) {
  if (!tradeId) return null;

  const values = await readPositions(sheets);
  const sheetRow = findPositionRowIndex(values, tradeId);

  if (sheetRow < 0) return null;

  const existing = values[sheetRow - 1];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${POSITIONS_SHEET}!A${sheetRow}:K${sheetRow}`,
  });

  console.log('Position cleared:', tradeId);

  return {
    trade_id: existing[0] || '',
    open_time: existing[1] || '',
    symbol: existing[2] || '',
    side: existing[3] || '',
    status: existing[4] || '',
    entry: existing[5] || '',
    size: existing[6] || '',
    target: existing[7] || '',
    stop: existing[8] || '',
    raw_open: existing[10] || '',
  };
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Closed Trades sheet
// Headers:
// trade_id | open_time | close_time | symbol | side | entry | exit | size | result | exit_reason | raw_open | raw_close
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    requestBody: {
      values: [closedRow],
    },
  });

  console.log('Closed trade appended:', closeRow.trade_id, closeRow.event, closeRow.result);
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ledger processor
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function processLedger(row) {
  const sheets = await getSheetsClient();
  if (!sheets) return;

  // Always preserve current raw log behavior.
  await appendToTradesSheet(sheets, row);

  if (!row.trade_id || row.event === 'UNKNOWN') return;

  if (row.event === 'SETUP') {
    await upsertPosition(sheets, row, 'pending');
    return;
  }

  if (row.event === 'FILL') {
    await upsertPosition(sheets, row, 'open');
    return;
  }

  if (row.event === 'CANCEL') {
    await clearPosition(sheets, row.trade_id);
    return;
  }

  if (row.event === 'TP' || row.event === 'SL' || row.event === 'EOD') {
    const openPosition = await clearPosition(sheets, row.trade_id);
    await appendClosedTrade(sheets, openPosition, row);
    return;
  }
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Telegram
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function sendTelegram(message) {
  if (!TOKEN || !CHAT_ID) {
    console.log('Telegram env vars missing. Skipping Telegram.');
    return;
  }

  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json();
  console.log('Telegram response:', JSON.stringify(data));
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/', async (req, res) => {
  try {
    const message = normalizeRawMessage(req.body);
    const parsedRow = parseTradingViewMessage(message);

    // Telegram first, so current TV → TG flow stays alive.
    await sendTelegram(message);

    // Sheets second. If Sheets fails, Telegram still worked.
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
});

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
