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
    async get({range}) {
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
const command = require('../package.json').scripts.start;
for (const [, preload] of command.matchAll(/-r\s+(\S+)/g)) require(path.resolve(root, preload));
const api = require('../app').__test;

const DAY = '/trading-systems/day-trading';
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
let server;
let port;
let tlsDirectory;
const browserQa = process.env.ISSUE337_BROWSER_QA === '1';
function jar() { return new Map(); }
function cookies(j) {
  return [...j.entries()].filter(([,c]) => c.exp > now).map(([name,c]) => `${name}=${c.value}`).join('; ');
}
async function request(url, host, j = jar(), options = {}) {
  return new Promise((resolve, reject) => {
    const req = (browserQa ? https : http).request({hostname:'127.0.0.1',port,path:url,rejectUnauthorized:false,method:options.method || 'GET',
      headers:{Host:host,Cookie:cookies(j),...(options.body ? {'Content-Type':'application/x-www-form-urlencoded'} : {})}}, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => {body += chunk;});
      res.on('end', () => {
        for (const value of res.headers['set-cookie'] || []) {
          const [pair] = value.split(';');
          const at = pair.indexOf('=');
          const maxAge = /Max-Age=(-?\d+)/i.exec(value);
          j.set(pair.slice(0, at), {value:pair.slice(at+1),exp:maxAge ? now + Number(maxAge[1])*1000 : Infinity});
        }
        resolve({status:res.statusCode,headers:res.headers,body});
      });
    });
    req.on('error', reject); if (options.body) req.write(options.body); req.end();
  });
}
function privateResponse(r) {
  assert.match(r.headers['cache-control'], /private.*no-store/);
  assert.match(r.headers.vary || '', /Cookie/i);
}
async function dashboard(host, j) {
  const r = await request('/dashboard',host,j);
  assert.equal(r.status,200); privateResponse(r);
  assert.match(r.body,/QA337/); // protected open-position canary
  assert.match(r.body,host.startsWith('ru.') ? /<html lang="ru"/ : /<html lang="en"/);
  return r;
}
async function dayDashboard(host, j, method = 'GET') {
  const r = await request(DAY,host,j,{method});
  assert.equal(r.status,302); assert.equal(r.headers.location,'/dashboard'); privateResponse(r);
  assert.equal(r.headers['set-cookie'],undefined,'navigation must not renew or replace credentials');
  assert(!r.body.includes('QA337'));
  if (method === 'GET') await dashboard(host,j);
}

async function runBrowserQa() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    for (const host of ['www.vixale.com','ru.vixale.com']) {
      for (const width of [1440,390]) for (const password of ['issue337-fixture-owner','VX-TEST-0337']) {
        const context = await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900},
          extraHTTPHeaders:{'X-Issue337-Test-Host':host}});
        // The loopback-only fixture applies the locale Host below. HTTP tests
        // separately verify real Host handling and host-only cookie attributes.
        const origin = `https://localhost:${port}`;
        // Browser tests cannot contact production, analytics, email or brokers.
        await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        const page = await context.newPage();
        try {
          await page.goto(origin+'/login');
          await page.locator('input[name="password"]').fill(password);
          await page.locator('form[action="/dashboard-login"] button').click();
          await page.waitForURL(origin+'/dashboard');
          assert(await page.locator('body').innerText().then(text=>text.includes('QA337')));
          // Use actual links, then browser back/forward and hard reload.
          await page.locator('a[href="/"]').first().click();
          await page.waitForURL(origin+'/');
          await page.locator('a[href="/trading-systems/day-trading"]:visible').first().click();
          await page.waitForURL(origin+'/dashboard');
          await page.reload();
          assert((await page.locator('body').innerText()).includes('QA337'));
          await page.goBack();
          await page.waitForURL(origin+'/');
          await page.goForward();
          await page.waitForURL(origin+'/dashboard');
          assert((await page.locator('body').innerText()).includes('QA337'));
          const issued = await context.cookies();
          const signed = issued.find(cookie=>cookie.name==='vixale_dashboard_session');
          assert(signed && signed.httpOnly && signed.secure && signed.sameSite==='Lax');
          // Logout must evict protected content even on browser history return.
          await page.goto(origin+'/logout');
          await page.waitForURL(origin+'/login');
          await page.goBack();
          await page.waitForURL(origin+'/login');
          assert(!(await page.locator('body').innerText()).includes('QA337'));
          await page.goto(origin+DAY);
          assert(!(await page.locator('body').innerText()).includes('QA337'));
          await context.clearCookies();
          await context.addCookies([{name:'vixale_dashboard_session',value:api.createDashboardSession('viewer','viewer-337',now-1000),url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
          await page.goto(origin+'/dashboard');
          await page.waitForURL(origin+'/login');
          assert(!(await page.locator('body').innerText()).includes('QA337'));
          console.log(`BROWSER PASS ${host} ${width}px ${password.startsWith('VX-')?'viewer':'owner'}: login/link/back/forward/reload/logout/expiry`);
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
}
(async () => {
  if (browserQa) {
    tlsDirectory = fs.mkdtempSync(path.join(os.tmpdir(),'issue337-tls-'));
    const key = path.join(tlsDirectory,'key.pem'),cert = path.join(tlsDirectory,'cert.pem');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=issue337.test'],{stdio:'ignore'});
    server = https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
      if (req.headers['x-issue337-test-host']) req.headers.host = req.headers['x-issue337-test-host'];
      app(req,res);
    }).listen(0,'127.0.0.1');
  } else server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  port = server.address().port;
  for (const host of ['www.vixale.com','ru.vixale.com']) {
    const anon = await request(DAY,host);
    assert.equal(anon.status,200); privateResponse(anon); assert(!anon.body.includes('QA337'));
    assert.match(anon.body,/vx-day-live-access|vx-conversion-system-hero/);
    const deniedApi = await request('/api/swing-leaders',host);
    assert.equal(deniedApi.status,401); privateResponse(deniedApi);
    const deniedPage = await request('/trading-systems/swing-trading',host);
    assert.equal(deniedPage.status,302); assert.match(deniedPage.headers.location,/login/);
    const fresh = await request('/dashboard',host);
    assert.equal(fresh.status,302); assert.equal(fresh.headers.location,'/login'); privateResponse(fresh);
    for (const [role,password] of [['owner','issue337-fixture-owner'],['viewer','VX-TEST-0337']]) {
      const j = jar();
      const login = await request('/dashboard-login',host,j,{method:'POST',body:new URLSearchParams({password}).toString()});
      assert.equal(login.status,302); assert.equal(login.headers.location,'/dashboard');
      const cookie = login.headers['set-cookie'].find(c=>c.startsWith('vixale_dashboard_session='));
      for (const attribute of [/HttpOnly/i,/Secure/i,/SameSite=Lax/i,/Path=\//i,/Max-Age=/i]) assert.match(cookie,attribute);
      assert(!/Domain=/i.test(cookie),'host-only cookie policy stays unchanged');
      await dashboard(host,j);
      // Real requests through the production preload chain reproduce link-return,
      // fresh GET, reload and back/forward destinations with the same cookie jar.
      for (const publicPage of ['/','/results','/pricing']) {
        const page = await request(publicPage,host,j);
        assert.equal(page.status,200);
        assert.match(page.body,/href="\/trading-systems\/day-trading"/);
        await dayDashboard(host,j);
      }
      await dayDashboard(host,j); // fresh GET / reload
      await dayDashboard(host,j,'HEAD');
      const pnl = await request('/dashboard/live-pnl.json',host,j);
      assert.equal(pnl.status,200);
      const otherHost = host.startsWith('ru.') ? 'www.vixale.com' : 'ru.vixale.com';
      assert.equal((await request('/dashboard',otherHost)).status,302,'no cross-host cookie widening');
      const logout = await request('/logout',host,j);
      privateResponse(logout);
      for (const name of ['vixale_dashboard_session','vixale_admin_key','vixale_dashboard_key']) {
        assert(logout.headers['set-cookie'].some(c=>c.startsWith(`${name}=`) && /Expires=Thu, 01 Jan 1970/i.test(c)));
        j.delete(name); // apply browser cookie deletion
      }
      assert.equal((await request('/dashboard',host,j)).status,302);
      assert.equal((await request('/dashboard/live-pnl.json',host,j)).status,401);
      const loggedOutDay = await request(DAY,host,j);
      assert.equal(loggedOutDay.status,200); assert(!loggedOutDay.body.includes('QA337'));
      const expired = jar();
      expired.set('vixale_dashboard_session',{value:api.createDashboardSession(role,role==='viewer'?'viewer-337':'owner',now-1000),exp:Infinity});
      assert.equal((await request('/dashboard',host,expired)).status,302);
      assert.equal((await request('/dashboard/live-pnl.json',host,expired)).status,401);
      assert.equal((await request(DAY,host,expired)).status,200);
      const invalid = jar(); invalid.set('vixale_dashboard_session',{value:'forged.signature',exp:Infinity});
      assert.equal((await request('/dashboard',host,invalid)).status,302);
      assert.equal((await request(DAY,host,invalid)).status,200);
      console.log(`PASS ${host}: ${role} login, public-page return, GET/HEAD/reload destinations, logout, expiry, invalid session`);
    }
  }
  if (browserQa) await runBrowserQa();
  // A signed viewer session never substitutes for an active, unexpired code.
  for (const status of ['DISABLED','ACTIVE']) {
    rows['Dashboard Access Codes'][1][6] = status;
    if (status === 'ACTIVE') rows['Dashboard Access Codes'][1][5] = new Date(now-1000).toISOString();
    now += 31_000; // exceed existing bounded authorization cache, without sleeping
    const j = jar();j.set('vixale_dashboard_session',{value:api.createDashboardSession('viewer','viewer-337',now+60000),exp:Infinity});
    assert.equal((await request(DAY,'www.vixale.com',j)).status,200);
    assert.equal((await request('/dashboard/live-pnl.json','www.vixale.com',j)).status,401);
  }
  let nextCalls = 0;
  const failure = { set(){},vary(){},status(n){this.code=n;return this;},send(text){this.body=text;} };
  await api.restoreDayTradingDashboard({originalUrl:DAY,url:'/trading-systems',method:'GET'},failure,()=>{nextCalls++;},async()=>{throw Error('fixture outage');});
  assert.equal(failure.code,503);assert.equal(nextCalls,0);
  const before = sheetsReads;
  assert.equal((await request(DAY,'www.vixale.com',jar(),{method:'POST'})).status,404);
  assert.equal(sheetsReads,before,'non-read request must not load protected data');
  console.log('Issue #337 full-preload HTTP session/navigation regression passed.');
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async()=>{
  Date.now=realNow;
  if (server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if (tlsDirectory) fs.rmSync(tlsDirectory,{recursive:true,force:true});
});
