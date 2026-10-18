'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// Exercise the exact exported Express handler with injected session authorization.
// Loading app.js for this test does not start the server or any IB/TWS process.
const { requireSwingAuthorization, safeSwingReturnPath } = require('../app').__test;

assert.equal(safeSwingReturnPath('/trading-systems/swing-trading'), '/trading-systems/swing-trading');
for (const unsafe of ['https://evil.test', '//evil.test', '/dashboard', '/trading-systems/swing-trading?key=secret', '../swing-leaders']) {
  assert.equal(safeSwingReturnPath(unsafe), '', 'return path must be strict allowlist only');
}
function response() {
  return {
    statusCode: 200, headers: {}, redirected: null, payload: null,
    set(o) { Object.assign(this.headers, o); return this; },
    vary(k) { this.headers.Vary = k; return this; },
    status(n) { this.statusCode = n; return this; },
    redirect(n, u) { this.statusCode = n; this.redirected = u; return this; },
    json(v) { this.payload = v; return this; },
    send(v) { this.payload = v; return this; }
  };
}
(async () => {
  for (const path of ['/swing-leaders', '/api/swing-leaders']) {
    for (const lang of ['en', 'ru']) {
      for (const method of ['GET', 'HEAD']) {
        const req = { path, method, headers: {host: lang === 'ru' ? 'ru.vixale.com' : 'www.vixale.com'} };
        const res = response();
        let passed = 0;
        await requireSwingAuthorization(req, res, () => { passed++; }, async () => ({authorized: false}));
        assert.equal(passed, 0, 'anonymous requests cannot render or access data');
        assert.match(res.headers['Cache-Control'], /private.*no-store/);
        assert.equal(res.headers.Vary, 'Cookie');
        if (path.startsWith('/api/')) {
          assert.equal(res.statusCode, 401);
          assert.equal(res.payload.error, 'swing_unauthorized');
        } else {
          assert.equal(res.statusCode, 302);
          assert.equal(res.redirected, '/login?next=%2Ftrading-systems%2Fswing-trading');
        }
        for (const role of ['owner', 'viewer']) {
          const authorized = response();
          let nextCount = 0;
          await requireSwingAuthorization(req, authorized, () => { nextCount++; }, async () => ({authorized: true, role}));
          assert.equal(nextCount, 1);
          assert.match(authorized.headers['Cache-Control'], /private.*no-store/);
        }
      }
    }
  }
  const fail = response();
  await requireSwingAuthorization({path:'/api/swing-leaders'}, fail, () => assert.fail('fail-closed'), async () => {throw new Error('mock auth unavailable');});
  assert.equal(fail.statusCode, 503);
  assert.match(source, /res\.clearCookie\('vixale_admin_key'/);
  assert.match(source, /renderLoginHtml\('', nextPath\)/);
  assert.match(source, /return res\.redirect\(nextPath \|\| '\/dashboard'\)/);
  console.log('Issue #331 Swing authorization tests passed.');
})().catch(err => {console.error(err);process.exitCode=1;});
