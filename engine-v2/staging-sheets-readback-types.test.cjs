'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertPlannedCells}=require('./staging-sheets-publisher.cjs');
const id=968436309;
const number=n=>({userEnteredValue:{numberValue:n}});
const formula=s=>({userEnteredValue:{formulaValue:s}});
const string=s=>({userEnteredValue:{stringValue:s}});
const plan={requests:[{updateCells:{range:{sheetId:id,startRowIndex:3,endRowIndex:4,startColumnIndex:0,endColumnIndex:4},
 rows:[{values:[number(10000),formula('=A4*2'),string('AMD'),{}]}]}}]};
test('staging readback accepts numeric cells independently of locale formatting',()=>{
 assert.doesNotThrow(()=>assertPlannedCells(plan,[{values:[['$10,000.00','=A4*2','AMD','']]}],[{values:[[10000,20000,'AMD','']]}]));
});
test('staging readback rejects altered formulas despite correct computed values',()=>{
 assert.throws(()=>assertPlannedCells(plan,[{values:[['$10,000.00','=10000*2','AMD','']]}],[{values:[[10000,20000,'AMD','']]}]),/STAGING_CELL_MISMATCH/);
});
test('staging readback rejects incorrect raw numbers even when formatted values match',()=>{
 assert.throws(()=>assertPlannedCells(plan,[{values:[['$10,000.00','=A4*2','AMD','']]}],[{values:[[9999,20000,'AMD','']]}]),/STAGING_CELL_MISMATCH/);
});
test('staging readback rejects number-as-text and incorrect membership',()=>{
 assert.throws(()=>assertPlannedCells(plan,[{values:[['$10,000.00','=A4*2','AMD','']]}],[{values:[['10000',20000,'AMD','']]}]),/STAGING_CELL_MISMATCH/);
 assert.throws(()=>assertPlannedCells(plan,[{values:[['$10,000.00','=A4*2','NVDA','']]}],[{values:[[10000,20000,'NVDA','']]}]),/STAGING_CELL_MISMATCH/);
});
test('staging readback requires complete dual provider responses',()=>{
 assert.throws(()=>assertPlannedCells(plan,[],[]),/STAGING_READ_INCOMPLETE/);
});
