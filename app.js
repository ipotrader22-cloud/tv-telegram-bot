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

function pnlEmoji(value) {
  const n = cleanNumber(value);

  if (n === '') return '';
  if (n > 0) return '😊';
  if (n < 0) return '😞';

  return '😐';
}

function formatPnlLine(row) {
  if (!row || row.result === '') return '';

  const emoji = pnlEmoji(row.result);
  const money = formatMoney(row.result);

  let pct = '';

  if (row.result_pct !== undefined && row.result_pct !== '') {
    pct = formatPercent(row.result_pct);
  } else {
    const calculatedPct = calcResultPercent(row, row);
    pct = calculatedPct === '' ? '' : formatPercent(calculatedPct);
  }

  if (pct !== '') {
    return `${emoji} <b>${money}</b> / <b>${pct}</b>`;
  }

  return `${emoji} <b>${money}</b>`;
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
  const capital = entry !== '' && size !== '' ? entry * size : '';

  if (entry === '' || size === '' || result === '' || capital === 0 || capital === '') {
    return '';
  }

  return Number(((result / capital) * 100).toFixed(2));
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

  if (enriched.result_pct === undefined || enriched.result_pct === '') {
    enriched.result_pct = calcResultPercent(openPosition, enriched);
  }

  return enriched;
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

  const symbol
