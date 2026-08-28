'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.ok(source.includes("require('./lib/swing-leaders')"), 'app.js must load the isolated Swing Leaders display module');
assert.ok(source.includes("createSwingLeadersHandlers({ getSheetsClient })"), 'app.js must reuse the existing server-side Google Sheets client');
assert.ok(source.includes("app.get('/swing-leaders', swingLeadersHandlers.page)"), 'public Swing Leaders page route must exist');
assert.ok(source.includes("app.get('/api/swing-leaders', swingLeadersHandlers.api)"), 'sanitized Swing Leaders API route must exist');
assert.ok(source.includes('href="/swing-leaders"'), 'Trading Systems Swing section must link to Swing Leaders');

assert.ok(!source.includes("app.post('/swing-leaders'"), 'Swing Leaders must remain read-only');
assert.ok(!source.includes("app.post('/api/swing-leaders'"), 'Swing Leaders API must remain read-only');

console.log('Swing Leaders app route integration tests passed.');
