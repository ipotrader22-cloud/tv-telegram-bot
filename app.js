const express = require('express');
const { google } = require('googleapis');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: '*/*', limit: '2mb' }));

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const SHEET_NAME = 'Trades';

function cleanNumber(value) {
  if (value === undefined || value === null) return '';

  const str = String(value)
    .replace('$', '')
    .replace(',', '')
    .replace('+', '')
    .trim();

  const n = Number(str);
  return Number.isFinite(n) ? n : '';
}

function extract(regex, text) {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

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
    cleanNumber(extract(/ЦЕЛЬ:\s*([0-9\.,-]+)/i, raw)) ||
    cleanNumber(extract(/Filled:\s*([0-9\.,-]+)/i, raw));

  const stop = cleanNumber(
    extract(/СТОП на закрытие (?:ниже|выше)\s*([0-9\.,-]+)/i, raw)
  );

  let result = '';

  if (event === 'TP') {
    result = cleanNumber(extract(/Profit:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
  }

  if (event === 'SL') {
    const loss = cleanNumber(extract(/Actual loss:\s*([+\-]?\$?[0-9\.,-]+)/i, raw));
    result = loss === '' ? '' : -Math.abs(loss);
  }

  const status =
    event === 'SETUP' ? 'pending' :
    event === 'FILL' ? 'open' :
    event === 'TP' ? 'closed' :
    event === 'SL' ? 'closed' :
    event === 'CANCEL' ? 'canceled' :
    'unknown';

  return {
    timestamp: new Date().toISOString(),
    symbol,
    side,
    event,
    entry,
    size,
    target,
    stop,
    result,
    status,
    raw,
  };
}

async function appendToGoogleSheet(row) {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.log('Google Sheets env vars missing. Skipping sheet logging.');
    return;
  }

  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A:K`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        row.timestamp,
        row.symbol,
        row.side,
        row.event,
        row.entry,
        row.size,
        row.target,
        row.stop,
        row.result,
        row.status,
        row.raw,
      ]],
    },
  });

  console.log('Google Sheet row appended:', row.symbol, row.side, row.event);
}

async function sendTelegram(message) {
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

app.post('/', async (req, res) => {
  try {
    const message =
      typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body, null, 2);

    const parsedRow = parseTradingViewMessage(message);

    // Telegram first, so current TV → TG flow stays alive.
    await sendTelegram(message);

    // Sheets second. If Sheets fails, Telegram still worked.
    try {
      await appendToGoogleSheet(parsedRow);
    } catch (sheetErr) {
      console.error('Google Sheets logging failed:', sheetErr);
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
