'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {initialize}=require('./init-shadow.cjs');
test('initializer refuses absent explicit approval before any DB connection',async()=>{
 await assert.rejects(initialize({url:'postgres://user:password@localhost/db',allow:'NO'}),/Explicit/);
});
test('initializer refuses unknown database names before any DB connection',async()=>{
 await assert.rejects(initialize({url:'postgres://user:password@localhost/production',allow:'YES'}),/unexpected database name/);
});
test('initializer refuses missing connection string',async()=>{
 await assert.rejects(initialize({allow:'YES',url:''}),/URL missing/);
});
