'use strict';
const assert = require('node:assert/strict');
const { selectedSpreadsheet, ENGINE2_SPREADSHEET_ID, SWING_LEADERS_SPREADSHEET_ID, createSwingLeadersService } = require('../lib/swing-leaders');
assert.equal(selectedSpreadsheet({}), SWING_LEADERS_SPREADSHEET_ID);
assert.equal(selectedSpreadsheet({VIXALE_SWING_SOURCE:'ENGINE2'}), ENGINE2_SPREADSHEET_ID);
assert.equal(selectedSpreadsheet({VIXALE_SWING_SOURCE:'LEGACY'}), SWING_LEADERS_SPREADSHEET_ID);
assert.throws(()=>selectedSpreadsheet({VIXALE_SWING_SOURCE:'engine2'}), /Invalid/);
const fs = require('node:fs');
const vm = require('node:vm');
// Reuse the established parser fixtures for the routing and rollback contract.
const source = fs.readFileSync(require.resolve('./test_swing_leaders'), 'utf8');
const fixtures = source.slice(source.indexOf('function fixtureRows()'), source.indexOf('function deepClone'));
const mod = require('../lib/swing-leaders');
const context = { ...mod };
vm.runInNewContext(fixtures + '\nthis.rows=fixtureRows();this.history=equityHistoryRows();', context);
(async()=>{
 const original = process.env.VIXALE_SWING_SOURCE;
 try {
  for (const [mode,id] of [['ENGINE2',ENGINE2_SPREADSHEET_ID],['LEGACY',SWING_LEADERS_SPREADSHEET_ID]]) {
   process.env.VIXALE_SWING_SOURCE=mode;
   const requests=[];
   const service=createSwingLeadersService({getSheetsClient:async()=>({spreadsheets:{values:{get:async request=>{
    requests.push(request);
    return {data:{values:request.range.includes('Equity History')?context.history:context.rows}};
   }}}})});
   const result=await service.getSnapshot();
   assert.equal(result.available,true);
   assert.equal(requests.length,2);
   assert.ok(requests.every(r=>r.spreadsheetId===id));
  }
 } finally {
  if(original===undefined)delete process.env.VIXALE_SWING_SOURCE;
  else process.env.VIXALE_SWING_SOURCE=original;
 }
 console.log('Swing source selection and rollback PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
