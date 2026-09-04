'use strict';

const core = require('./swing-leaders-core');

const CANONICAL_CANDIDATE_COUNT_FIELD = 'candidate_count';
const LEGACY_CANDIDATE_COUNT_FIELD = 'intern_count';
const CANONICAL_CANDIDATE_SECTION = 'POTENTIAL CANDIDATES';
const LEGACY_CANDIDATE_SECTION = 'INTERNS';

function cleanText(value) {
  return String(value ?? '').trim();
}

function cloneRows(values) {
  return (Array.isArray(values) ? values : []).map(row => (Array.isArray(row) ? [...row] : row));
}

function normalizePublicFeedRows(values) {
  const rows = cloneRows(values);
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
  return {
    ...options,
    getSheetsClient: wrapGetSheetsClient(options.getSheetsClient, publicRange),
  };
}

function parsePublicFeed(values) {
  return core.parsePublicFeed(normalizePublicFeedRows(values));
}

function createSwingLeadersService(options = {}) {
  return core.createSwingLeadersService(normalizedOptions(options));
}

function createSwingLeadersHandlers(options = {}) {
  if (options.service) return core.createSwingLeadersHandlers(options);
  return core.createSwingLeadersHandlers(normalizedOptions(options));
}

module.exports = {
  ...core,
  CANONICAL_CANDIDATE_COUNT_FIELD,
  LEGACY_CANDIDATE_COUNT_FIELD,
  CANONICAL_CANDIDATE_SECTION,
  LEGACY_CANDIDATE_SECTION,
  normalizePublicFeedRows,
  parsePublicFeed,
  createSwingLeadersService,
  createSwingLeadersHandlers,
};
