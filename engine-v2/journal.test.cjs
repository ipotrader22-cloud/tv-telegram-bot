'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reduce}=require('./journal.cjs');
const open={eventId:'open-1',type:'OPEN',ticker:'PLTR',entryDate:'2026-10-16',entryPrice:100,entryTime:'2026-10-16T10:00:00-04:00'};
const close={eventId:'close-1',type:'CLOSE',ticker:'PLTR',entryDate:'2026-10-16',exitPrice:110,exitTime:'2026-10-16T14:00:00-04:00',reason:'TARGET',effectiveDate:'2026-10-16',includePublic:'YES'};
test('replay of same event has no second effect',()=>{let a=reduce(undefined,open);let b=reduce(a.state,open);assert.equal(b.applied,false);assert.equal(b.state.positions.length,1)});
test('duplicate open with different event id is rejected',()=>{let a=reduce(undefined,open);assert.throws(()=>reduce(a.state,{...open,eventId:'other'}),/duplicate open/)});
test('close is recorded once with stable lot identity',()=>{let a=reduce(undefined,open);let b=reduce(a.state,close);assert.equal(b.state.positions.length,0);assert.equal(b.state.closed[0].includePublic,'YES');assert.equal(reduce(b.state,close).applied,false);assert.throws(()=>reduce(b.state,{...close,eventId:'close-2'}),/lot not open/)});
test('invalid event never changes original state',()=>{let a=reduce(undefined,open);assert.throws(()=>reduce(a.state,{...close,eventId:'bad',reason:'UNKNOWN'}));assert.equal(a.state.closed.length,0);assert.equal(a.state.positions.length,1)});
