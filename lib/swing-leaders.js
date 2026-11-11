'use strict';

const core = require('./swing-leaders-core');
const {createIntradayValuation}=require('./swing-intraday-valuation');
const ENGINE2_SPREADSHEET_ID = '1Ii20kcegWWhQfz_RUrDe0OhfFG1y9TNjrEI1Xy6mqyA';

function selectedSpreadsheet(env = process.env) {
  const source = env.VIXALE_SWING_SOURCE || 'LEGACY';
  if (source === 'LEGACY') return core.SWING_LEADERS_SPREADSHEET_ID;
  if (source === 'ENGINE2') return ENGINE2_SPREADSHEET_ID;
  throw new Error('Invalid VIXALE_SWING_SOURCE');
}

const CANONICAL_CANDIDATE_COUNT_FIELD = 'candidate_count';
const LEGACY_CANDIDATE_COUNT_FIELD = 'intern_count';
const CANONICAL_CANDIDATE_SECTION = 'POTENTIAL CANDIDATES';
const LEGACY_CANDIDATE_SECTION = 'INTERNS';
const ACTIVE_SECTION = 'ACTIVE PORTFOLIO';
const DEFAULT_ACTIVE_BRIEF_NOTE = 'Research note pending.';

function cleanText(value) {
  return String(value ?? '').trim();
}

function cloneRows(values) {
  return (Array.isArray(values) ? values : []).map(row => (Array.isArray(row) ? [...row] : row));
}

function fillMissingActiveBriefNotes(rows) {
  const activeIndex = rows.findIndex(row => cleanText(row?.[0]).toUpperCase() === ACTIVE_SECTION);
  if (activeIndex < 0) return rows;

  const header = rows[activeIndex + 1] || [];
  const tickerIndex = header.findIndex(value => cleanText(value) === 'ticker');
  const noteIndex = header.findIndex(value => cleanText(value) === 'brief_note');
  if (tickerIndex < 0 || noteIndex < 0) return rows;

  for (let index = activeIndex + 2; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;
    const firstCell = cleanText(row[0]).toUpperCase();
    if ([CANONICAL_CANDIDATE_SECTION, LEGACY_CANDIDATE_SECTION, 'CLOSED TRADES'].includes(firstCell)) break;
    if (!cleanText(row[tickerIndex])) continue;
    if (!cleanText(row[noteIndex])) row[noteIndex] = DEFAULT_ACTIVE_BRIEF_NOTE;
  }
  return rows;
}

function normalizePublicFeedRows(values) {
  const rows = fillMissingActiveBriefNotes(cloneRows(values));
  const canonicalCountRows = [];
  const legacyCountRows = [];
  const canonicalSectionRows = [];
  const legacySectionRows = [];

  rows.forEach((row, index) => {
    const firstCell = cleanText(row?.[0]);
    const upper = firstCell.toUpperCase();
    if (firstCell === CANONICAL_CANDIDATE_COUNT_FIELD) canonicalCountRows.push(index);
    if (firstCell === LEGACY_CANDIDATE_COUNT_FIELD) legacyCountRows.push(index);
    if (upper === CANONICAL_CANDIDATE_SECTION) canonicalSectionRows.push(index);
    if (upper === LEGACY_CANDIDATE_SECTION) legacySectionRows.push(index);
  });

  if (canonicalCountRows.length > 1 || legacyCountRows.length > 1) {
    throw new Error('Public Feed has duplicate candidate count aliases');
  }
  if (canonicalSectionRows.length > 1 || legacySectionRows.length > 1) {
    throw new Error('Public Feed has duplicate candidate section aliases');
  }

  if (canonicalCountRows.length && legacyCountRows.length) {
    const canonicalValue = cleanText(rows[canonicalCountRows[0]]?.[1]);
    const legacyValue = cleanText(rows[legacyCountRows[0]]?.[1]);
    if (canonicalValue !== legacyValue) {
      throw new Error('Public Feed has conflicting candidate count aliases');
    }
  }

  if (canonicalSectionRows.length && legacySectionRows.length) {
    throw new Error('Public Feed contains both candidate section aliases');
  }

  for (const index of canonicalCountRows) rows[index][0] = LEGACY_CANDIDATE_COUNT_FIELD;
  for (const index of canonicalSectionRows) rows[index][0] = LEGACY_CANDIDATE_SECTION;

  return rows;
}

// Engine 2's accounting format renders zero as "-"; unused template rows
// contain zero formulas but no date/time/count. Keep malformed real rows strict.
function normalizeEngine2EquityRows(values) {
  const rows = cloneRows(values);
  const header = rows[0] || [];
  const at = name => header.indexOf(name);
  const monetary = ['realized_model_pnl', 'unrealized_model_pnl', 'total_model_pnl', 'model_equity'];
  if (core.EQUITY_HISTORY_SOURCE_FIELDS.some(name => at(name) < 0)) return rows;
  return rows.filter((row, index) => {
    if (!index || !Array.isArray(row)) return true;
    const emptyIdentity = ['snapshot_date','snapshot_time_et','active_count'].every(name => !cleanText(row[at(name)]));
    const template = emptyIdentity && cleanText(row[at('realized_model_pnl')]) === '-'
      && !cleanText(row[at('unrealized_model_pnl')])
      && cleanText(row[at('total_model_pnl')]) === '-'
      && cleanText(row[at('model_equity')]) === '$100,000.00';
    return !template;
  }).map((row, index) => {
    if (!index || !Array.isArray(row)) return row;
    for (const name of monetary) if (cleanText(row[at(name)]) === '-') row[at(name)] = '$0.00';
    return row;
  });
}

function wrapGetSheetsClient(getSheetsClient, publicRange) {
  if (typeof getSheetsClient !== 'function') return getSheetsClient;

  return async function getNormalizedSheetsClient() {
    const client = await getSheetsClient();
    const valuesApi = client?.spreadsheets?.values;
    if (!valuesApi || typeof valuesApi.get !== 'function') return client;

    const originalGet = valuesApi.get.bind(valuesApi);
    return {
      ...client,
      spreadsheets: {
        ...client.spreadsheets,
        values: {
          ...valuesApi,
          async get(request) {
            const response = await originalGet(request);
            if (request?.spreadsheetId === ENGINE2_SPREADSHEET_ID && request?.range === core.SWING_LEADERS_EQUITY_HISTORY_RANGE) {
              return { ...response, data: { ...(response?.data || {}), values: normalizeEngine2EquityRows(response?.data?.values || []) } };
            }
            if (request?.range !== publicRange) return response;
            return {
              ...response,
              data: {
                ...(response?.data || {}),
                values: normalizePublicFeedRows(response?.data?.values || []),
              },
            };
          },
        },
      },
    };
  };
}

function normalizedOptions(options = {}) {
  if (typeof options.getSheetsClient !== 'function') return options;
  const publicRange = options.range || core.SWING_LEADERS_RANGE;
  const spreadsheetId = options.spreadsheetId || selectedSpreadsheet();
  return {
    ...options,
    spreadsheetId,
    getSheetsClient: wrapGetSheetsClient(options.getSheetsClient, publicRange),
  };
}

function parsePublicFeed(values) {
  return core.parsePublicFeed(normalizePublicFeedRows(values));
}

function createSwingLeadersService(options = {}) {
  const normalized = normalizedOptions(options);
  const base = core.createSwingLeadersService(normalized);
  // The immutable Engine 2 morning model and LEGACY source stay separate.
  // Never use valuation projection as trading decision/source Sheet data.
  if (normalized.spreadsheetId !== ENGINE2_SPREADSHEET_ID ||
      normalized.intradayValuation === false) return base;
  const decorate = createIntradayValuation({
    getSheetsClient: normalized.getSheetsClient,
    clock: normalized.valuationClock || (() => new Date()),
    chart: normalized.chartValuationProvider,
  });
  return {
    ...base,
    async getSnapshot(args) {
      return decorate(await base.getSnapshot(args));
    },
  };
}

function createSwingLeadersHandlers(options = {}) {
  if (options.service) return core.createSwingLeadersHandlers(options);
  return core.createSwingLeadersHandlers({service:createSwingLeadersService(options)});
}

module.exports = {
  ...core,
  normalizeEngine2EquityRows,
  selectedSpreadsheet,
  ENGINE2_SPREADSHEET_ID,
  CANONICAL_CANDIDATE_COUNT_FIELD,
  LEGACY_CANDIDATE_COUNT_FIELD,
  CANONICAL_CANDIDATE_SECTION,
  LEGACY_CANDIDATE_SECTION,
  ACTIVE_SECTION,
  DEFAULT_ACTIVE_BRIEF_NOTE,
  fillMissingActiveBriefNotes,
  normalizePublicFeedRows,
  parsePublicFeed,
  createSwingLeadersService,
  createSwingLeadersHandlers,
};
