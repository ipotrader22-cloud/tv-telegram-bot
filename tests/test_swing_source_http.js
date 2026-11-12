'use strict';

// Run the real Express application with every production preload, real signed
// sessions and a disposable Sheets double. No external account or broker calls.
const assert = require('node:assert/strict');
const Module = require('node:module');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const realExpress = require('express');
let app;
function captureExpress(...args) { app = realExpress(...args); return app; }
Object.assign(captureExpress, realExpress);
Object.assign(process.env, {
  ADMIN_DASHBOARD_KEY: 'issue337-fixture-owner',
  DASHBOARD_KEY: '', GOOGLE_SHEET_ID: 'issue337-fixture',
  GOOGLE_SERVICE_ACCOUNT_JSON: '{}', BRIDGE_FORWARD_ENABLED: 'false',
});
const codeExpiry = Date.now() + 24 * 60 * 60 * 1000;
const rows = {
  'Dashboard Access Codes': [
    ['ID','Code','Name','Email','Created At','Expires At','Status','Last Login At','Source Request ID','Telegram'],
    ['viewer-337','VX-TEST-0337','Fixture','',new Date().toISOString(),new Date(codeExpiry).toISOString(),'ACTIVE','','',''],
  ],
  'Open Positions': [['Trade ID'], ['QA337_LONG','2026-10-22 10:00:00','QA337','LONG','OPEN',100,1,110,95,101,1,'']],
};
let sheetsReads = 0;
const sheetName = range => range.split('!')[0].replace(/^'|'$/g, '');
const sheets = { spreadsheets: {
  async get() { return { data: { sheets: Object.keys(rows).map((title, sheetId) => ({properties:{title,sheetId}})) } }; },
  async batchUpdate({requestBody}) {
    for (const request of requestBody.requests || []) {
      if (request.addSheet) rows[request.addSheet.properties.title] = [];
    }
    return {data:{}};
  },
  values: {
    async batchGet({ranges}) {
      return {data:{valueRanges:await Promise.all(ranges.map(async range=>({range,...(await this.get({range})).data})))}};
    },
    async get({range,spreadsheetId}) {
      if (['Public Feed','Equity History'].includes(sheetName(range))) {
        assert.equal(spreadsheetId, expectedWorkbook, 'feed and history use selected workbook');
        swingReads++;
      }
      sheetsReads++;
      return {data:{values:(rows[sheetName(range)] || [['ID']]).map(row => [...row])}};
    },
    async update({range,requestBody}) {
      const name = sheetName(range);
      const rowNumber = Number(range.split('!')[1].match(/\d+/)?.[0] || 1);
      rows[name] ||= [];
      rows[name][rowNumber - 1] = [...requestBody.values[0]];
      return {data:{}};
    },
  },
} };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'express') return captureExpress;
  if (request === 'googleapis') return { google: { auth: { GoogleAuth: class {} }, sheets: () => sheets } };
  return originalLoad.call(this, request, parent, isMain);
};

const swing = require('../lib/swing-leaders');
const mode = process.env.VIXALE_SWING_SOURCE || 'ENGINE2';
process.env.VIXALE_SWING_SOURCE = mode;
const expectedWorkbook = swing.selectedSpreadsheet();
let swingReads = 0;
const fixtureSource = fs.readFileSync(path.join(__dirname,'test_swing_leaders.js'),'utf8');
const fixtureContext = {...swing};
vm.runInNewContext(fixtureSource.slice(fixtureSource.indexOf('function fixtureRows()'),fixtureSource.indexOf('function deepClone')) + '\nthis.feed=fixtureRows();this.history=equityHistoryRows();',fixtureContext);
const fixture = process.env.SWING_QA_INPUT ? JSON.parse(fs.readFileSync(process.env.SWING_QA_INPUT,'utf8')) : fixtureContext;
rows['Public Feed'] = fixture.feed;
rows['Equity History'] = fixture.history;
const expected = swing.parsePublicFeed(fixture.feed);
const command = require('../package.json').scripts.start;
for (const [, preload] of command.matchAll(/-r\s+(\S+)/g)) require(path.resolve(root, preload));
require('../app');
const SWING = '/trading-systems/swing-trading';
let server;
async function request(url,host,cookie='',body) {
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method:body?'POST':'GET',headers:{Host:host,Cookie:cookie,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',v=>text+=v);
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text}));
  });req.on('error',reject);if(body)req.write(body);req.end();
 });
}
(async()=>{
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 for(const host of ['www.vixale.com','ru.vixale.com']) {
  const before=swingReads;
  const anon=await request(SWING,host);assert.equal(anon.status,302);assert.match(anon.headers.location,/login/);
  const denied=await request('/api/swing-leaders',host);assert.equal(denied.status,401);assert.equal(swingReads,before);
  for(const [role,password] of [['owner','issue337-fixture-owner'],['viewer','VX-TEST-0337']]) {
   const login=await request('/dashboard-login',host,'',new URLSearchParams({password,next:SWING}).toString());
   assert.equal(login.status,302);
   const cookie=(login.headers['set-cookie']||[]).map(v=>v.split(';')[0]).join('; ');
   assert.match(cookie,/vixale_dashboard_session=/);
   const page=await request(SWING,host,cookie), api=await request('/api/swing-leaders',host,cookie);
   assert.equal(page.status,200);assert.equal(api.status,200);
   for (const match of page.body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type=["']application\/(?:ld\+)?json/.test(match[1])) continue;
    assert.doesNotThrow(()=>new vm.Script(match[2]), host+' '+role+' rendered inline script syntax');
   }
   const payload=JSON.parse(api.body);
   assert.equal(payload.snapshot_date,expected.snapshot_date);
   assert.equal(payload.active_count,expected.active_count);
   assert.equal(payload.equity_history_stale,false);
   const history = mode === 'ENGINE2' ? swing.normalizeEngine2EquityRows(fixture.history) : fixture.history;
   assert.deepEqual(payload.equity_history,swing.parseEquityHistory(history));
   assert.deepEqual(payload.closed_trades,expected.closed_trades);
   assert.equal(page.headers['x-vixale-swing-snapshot-id'],api.headers['x-vixale-swing-snapshot-id']);
   assert.equal(page.headers['x-vixale-swing-snapshot-date'],expected.snapshot_date);
   assert.match(page.headers['cache-control'],/no-store/);
   assert.match(page.body,host.startsWith('ru.')?/<html lang="ru"/:/<html lang="en"/);
   assert.ok(page.body.includes(expected.snapshot_date));
   for(const closed of expected.closed_trades)assert.ok(page.body.includes(closed.ticker));
   const logout=await request('/logout',host,cookie);assert.equal(logout.status,302);
   const after=await request(SWING,host);assert.equal(after.status,302);
   console.log('PASS '+mode+' '+host+' '+role+': login, page/API snapshot, locale, no-store, logout');
  }
 }
 assert.ok(swingReads>=2);
 console.log('Full startup Swing HTTP checks passed; snapshot '+expected.snapshot_date);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}Module._load=originalLoad});
