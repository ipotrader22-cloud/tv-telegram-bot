'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assertDisposableTestDatabase}=require('./disposable-test-guard.cjs');
test('reject missing CI authorization',()=>assert.throws(()=>assertDisposableTestDatabase({}),/approval/));
