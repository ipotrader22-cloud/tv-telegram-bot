// Regression for the actual strict writer extracted from app.js without starting the service.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const begin = source.indexOf('function sheetCellHasValue(');
const end = source.indexOf('\nfunction findRowIndexByTradeId(', begin);
assert(begin >= 0 && end > begin, 'strict writer definitions must exist');
const isolated = source.slice(begin, end);
const calls = [];
let gridRows = 1;
const sheets = { spreadsheets: {
  get: async () => ({ data: { sheets: [{ properties: { sheetId: 77, title: 'Open Positions', gridProperties: { rowCount: gridRows } } }] } }),
  batchUpdate: async ({ requestBody }) => {
    const request = requestBody.requests[0].appendDimension;
    assert.equal(request.sheetId, 77);
    assert.equal(request.dimension, 'ROWS');
    calls.push(['grow', request.length]);
    gridRows += request.length;
  },
  values: {
    get: async () => ({ data: { values: [['trade_id', 'symbol']] } }),
    update: async ({ range, requestBody }) => {
      assert(gridRows >= 2, 'writer must expand grid before writing');
      assert.equal(range, "'Open Positions'!A2:L2");
      assert.deepEqual(requestBody.values, [['TEST', 'EQT']]);
      calls.push(['write', range]);
    },
  },
} };
const context = { GOOGLE_SHEET_ID: 'test', readSheet: async () => [['trade_id', 'symbol']], quotedSheetName: n => "'" + n + "'", console };
vm.createContext(context);
vm.runInContext(isolated + '\nthis.writer = writeSheetRowStrict;', context);
(async () => {
  assert.equal(await context.writer(sheets, 'Open Positions', 'A', 'L', ['TEST', 'EQT']), 2);
  assert.deepEqual(calls, [['grow', 1], ['write', "'Open Positions'!A2:L2"]]);
  calls.length = 0;
  assert.equal(await context.writer(sheets, 'Open Positions', 'A', 'L', ['TEST', 'EQT']), 2);
  assert.deepEqual(calls, [['write', "'Open Positions'!A2:L2"]], 'no redundant grid growth');
  console.log('PASS strict writer grows header-only grid before broker-confirmed row write');
})().catch(err => { console.error(err); process.exitCode = 1; });
