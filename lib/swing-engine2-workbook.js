'use strict';

const FINANCIAL_WORKBOOK = '1Ii20kcegWWhQfz_RUrDe0OhfFG1y9TNjrEI1Xy6mqyA';
const STAGING_SITE = 'srv-dbn675ui0phs73857rp0';

function engine2Workbook(env = process.env) {
  const copy = env.VIXALE_SWING_QA_WORKBOOK_ID;
  if (!copy) return FINANCIAL_WORKBOOK;
  if (env.RENDER_SERVICE_ID !== STAGING_SITE ||
      env.SITE_BASE_URL !== 'https://vixale-engine2-website-staging.onrender.com' ||
      !/^[A-Za-z0-9_-]{30,100}$/.test(copy) ||
      [FINANCIAL_WORKBOOK, env.GOOGLE_SHEET_ID, require('./swing-leaders-core').SWING_LEADERS_SPREADSHEET_ID].includes(copy)) {
    throw new Error('Invalid isolated Swing workbook configuration');
  }
  return copy;
}

module.exports = {engine2Workbook};
