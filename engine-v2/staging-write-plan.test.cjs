'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildStagingWrites}=require('./staging-write-plan.cjs');
const {STAGING_ID,SOURCE_ID}=require('./native-sheets-lease.cjs');
const day='2026-10-22',p={ticker:'AMD',entryDate:day,entryPrice:200,currentPrice:203,entryScore:80,currentScore:80,
 fullReviewDate:day,exchange:'NASDAQ',shares:50,quoteSourceId:'YAHOO_1M:AMD'};
const manifest={status:'PUBLICATION_PLAN_ONLY',fingerprint:'sha256-fixture',
 payload:{epoch:'2026-10-19',date:day,runId:'engine2|2026-10-19|2026-10-22|morning',
 active:[{ticker:'AMD',note:'Oct22 AMD news checked; ranking 80'}],
 model:{activeCount:1,realized:0,unrealized:150,total:150,equity:100150}}};
const arg={spreadsheetId:STAGING_ID,manifest,positions:[p],closed:[],timeEt:'10:02 ET',equityRowIndex:2};
test('no writes ever target production workbook ID',()=>assert.throws(()=>buildStagingWrites({...arg,spreadsheetId:SOURCE_ID})));
test('builds complete staging plan preserving legacy formula sections',()=>{
 const x=buildStagingWrites(arg);
 assert.equal(x.status,'STAGING_WRITE_PLAN');assert.equal(x.writeApproved,false);
 assert.equal(x.targetSpreadsheetId,STAGING_ID);
 assert.equal(x.requests.some(v=>v.updateCells?.range?.sheetId===177001100),true);
 assert.equal(x.requests.some(v=>v.updateCells?.range?.sheetId===1441454616),true);
 assert.equal(x.requests.some(v=>v.updateCells?.range?.sheetId===650700609),false);
});
test('missing quote current score and stale review cannot publish',()=>assert.throws(()=>buildStagingWrites({...arg,positions:[{...p,fullReviewDate:'2026-10-21'}]})));
test('closed trade writes strict Q/R and formula-linked return, not shares as model P&L',()=>{
 const x=buildStagingWrites({...arg,closed:[{ticker:'MU',entryDate:'2026-10-19',exitDate:day,
 entryPrice:100,exitPrice:110,includePublic:'YES',effectiveDate:day,lastScore:82}]});
 const row=x.requests.find(q=>q.updateCells?.range?.sheetId===650700609).updateCells.rows[0].values;
 assert.equal(row[11].userEnteredValue.formulaValue,'=IFERROR((I4-F4)/F4,0)');
 assert.equal(row[16].userEnteredValue.stringValue,'YES');
});
