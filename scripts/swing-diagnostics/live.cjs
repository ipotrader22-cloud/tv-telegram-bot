'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {createRequire} = require('node:module');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const {reconcile} = require('./reconcile.cjs');

async function readWorkbook(google, spreadsheetId) {
  const credentials = JSON.parse(process.env.VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON);
  assert.equal(credentials.client_email,'vixale-engine2-staging@tv-trading-journal.iam.gserviceaccount.com');
  const auth = new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const sheets = google.sheets({version:'v4',auth}).spreadsheets;
  const meta = (await sheets.get({spreadsheetId,fields:'spreadsheetId,properties(timeZone),sheets(properties(title,sheetId,gridProperties(rowCount)))'})).data;
  assert.equal(meta.spreadsheetId,spreadsheetId);
  assert.equal(meta.properties.timeZone,'America/New_York');
  const ranges = [['Portfolio',1474454824,'R'],['Open Positions',968436309,'R'],['Closed Trades',650700609,'R'],
    ['Public Feed',1441454616,'L'],['Equity History',177001100,'G']].map(([name,id,col])=>{
    const tab = meta.sheets.find(s=>s.properties.title===name)?.properties;
    assert.equal(tab?.sheetId,id);
    return "'"+name+"'!A1:"+col+tab.gridProperties.rowCount;
  });
  async function read(ranges,valueRenderOption) {
    const data=(await sheets.values.batchGet({spreadsheetId,ranges,valueRenderOption})).data;
    assert.equal(data.spreadsheetId,spreadsheetId);
    assert.equal(data.valueRanges.length,ranges.length);
    return data.valueRanges.map(r=>r.values||[]);
  }
  const [portfolio,open,closed,feed,history]=await read(ranges,'UNFORMATTED_VALUE');
  const [cash,spill,equity]=await read(["'Public Feed'!B7","'Public Feed'!A33","'Equity History'!C2:F"+history.length],'FORMULA');
  return {portfolio,open,closed,feed,history,formulas:{cash:cash[0][0],spill:spill[0][0],equity}};
}

async function live(date,spreadsheetId,db) {
  const engine=createRequire(path.resolve('engine-v2/clean-ledger.cjs'));
  const origin='https://vixale-engine-v2-shadow-observer.onrender.com';
  const token=randomUUID();
  const opts={redirect:'error',cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)};
  const [sheet,response,page]=await Promise.all([
    readWorkbook({auth:engine('google-auth-library'),sheets:engine('googleapis/build/src/apis/sheets').sheets},spreadsheetId),
    fetch(origin+'/v2/model/snapshot?engine2_readback='+token,opts),
    fetch(origin+'/v2/swing-trading?engine2_readback='+token,opts)
  ]);
  for(const r of [response,page]) {
    assert.equal(r.status,200);
    assert.match(r.headers.get('cache-control')||'',/no-store/i);
  }
  const api=await response.json();
  assert.equal(await page.text(),engine('./shadow-swing-page.cjs').renderShadowSwing(api),'observer HTML and API differ');
  return {...reconcile({date,sheet,db,api}),observerHtml:'PASS',runId:db.runId,decisionAt:db.decisionAt,
    observedAt:new Date().toISOString(),events:db.events,openingProofs:db.openingProofs,factorReviews:db.factorReviews,
    deliveryJournal:db.delivery};
}

if(require.main===module) live(process.argv[2],process.argv[3],JSON.parse(fs.readFileSync(process.argv[4],'utf8'))).then(result=>{
  console.log(JSON.stringify(result));
  if(result.status!=='PASS')process.exitCode=1;
}).catch(error=>{
  console.error(JSON.stringify({status:'UNVERIFIED',reason:error.code||error.name}));
  process.exitCode=1;
});
module.exports={live,readWorkbook};
