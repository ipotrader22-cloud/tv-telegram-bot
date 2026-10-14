'use strict';
// Read-only connection preflight. Never mutate Sheets or send email.
const { google } = require('googleapis');
const SHEET_ID = '14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
const REQUIRED_TABS = ['Portfolio','Open Positions','Closed Trades','Automation Config','Public Feed','Equity History'];
const fail = (message) => { throw new Error(message); };
async function main() {
  const raw = process.env.VIXALE_GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) fail('Missing Google Service Account secret');
  let credentials;
  try { credentials = JSON.parse(raw); } catch { fail('Google Service Account secret is not valid JSON'); }
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) fail('Invalid Google Service Account structure');
  const resend = process.env.VIXALE_RESEND_API_KEY;
  if (!resend || !resend.startsWith('re_')) fail('Resend secret missing or malformed (no email sent)');
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({version:'v4',auth});
  const response = await sheets.spreadsheets.get({
    spreadsheetId:SHEET_ID,
    fields:'spreadsheetId,properties(title,timeZone),sheets(properties(title,sheetId)),developerMetadata(metadataId,metadataKey,metadataValue,visibility)',
    includeGridData:false
  });
  const workbook = response.data;
  const tabs = new Set((workbook.sheets || []).map(x => x.properties.title));
  const missing = REQUIRED_TABS.filter(x=>!tabs.has(x));
  if (missing.length) fail('Required workbook tabs missing: '+missing.join(', '));
  const md = workbook.developerMetadata || [];
  const guard = (id,key) => md.filter(x=>x.metadataId===id && x.metadataKey===key);
  if (guard(1030101,'VIXALE_SWING_FENCE_V1').length!==1) fail('Fence metadata missing or duplicated: do not enable writer');
  if (guard(1030100,'VIXALE_SWING_LEASE_V1').length>1) fail('Lease metadata duplicated: do not enable writer');
  console.log(JSON.stringify({
    gate:'READ_ONLY_CREDENTIAL_PREFLIGHT',status:'PASS',spreadsheetId:SHEET_ID,
    title:workbook.properties.title,timeZone:workbook.properties.timeZone,
    requiredTabsPresent:true,fencePresent:true,leaseRecordCount:guard(1030100,'VIXALE_SWING_LEASE_V1').length,
    resendKeyFormatPresent:true,
    note:'No sheet writes, no email, no portfolio or publication validation'
  }));
}
main().catch(e=>{console.error('PREFLIGHT BLOCKED: '+(e.response?.status||'')+' '+e.message);process.exitCode=1;});
