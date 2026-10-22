const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const start = source.indexOf('async function writeSheetRowStrict(');
const end = source.indexOf('\nfunction findRowIndexByTradeId(', start);
assert.ok(start >= 0 && end > start, 'strict writer must be present');

const sandbox = {
  GOOGLE_SHEET_ID: 'fixture-sheet',
  nextStrictSheetRow: async () => 2,
  quotedSheetName: name => "'" + name + "'",
};
vm.runInNewContext(source.slice(start, end) + '\nthis.writer = writeSheetRowStrict;', sandbox);

(async () => {
  const calls = [];
  const sheets = { spreadsheets: {
    get: async () => ({data:{sheets:[{properties:{title:'Open Positions',sheetId:123,gridProperties:{rowCount:1}}}]}}),
    batchUpdate: async req => { calls.push(['grow', req.requestBody.requests[0].appendDimension]); },
    values: {update: async req => { calls.push(['write',req.range]); }},
  }};
  const result = await sandbox.writer(sheets, 'Open Positions', 'A', 'L', ['CAT'], 'A:V');
  assert.equal(result, 2);
  assert.deepEqual(calls[0][1], {sheetId:123,dimension:'ROWS',length:1});
  assert.equal(calls[1][1], "'Open Positions'!A2:L2");

  calls.length = 0;
  sheets.spreadsheets.get = async () => ({data:{sheets:[{properties:{title:'Open Positions',sheetId:123,gridProperties:{rowCount:11}}}]}});
  await sandbox.writer(sheets, 'Open Positions', 'A', 'L', ['CAT'], 'A:V');
  assert.equal(calls.length, 1, 'do not grow grid when adequate capacity exists');
  assert.equal(calls[0][0], 'write');

  console.log('PASS: strict sheet writer grows header-only grid and preserves ordinary writes');
})().catch(error => { console.error(error); process.exitCode = 1; });
