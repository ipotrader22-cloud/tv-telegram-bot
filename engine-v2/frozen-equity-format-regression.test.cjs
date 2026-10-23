'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareImported}=require('./live-sheet-check.cjs');
const base=()=>({
 asOf:'2026-10-03',
 closed:[{ticker:'ABC',entryDate:'2026-10-01',effectiveDate:'2026-10-02',includePublic:'YES',returnPct:0.02}],
 active:[],
 equity:[{date:'2026-10-02',realized:200,unrealized:0,total:200,equity:10200,activeCount:0},{date:'2026-10-03',realized:200,unrealized:0,total:200,equity:10200,activeCount:0}]
});
test('equivalent numeric formatting does not cause frozen-history drift',()=>{
 const stored=base(),live=base();live.equity[0].realized='200.00';
 assert.equal(compareImported(live,stored).frozenChanged,false);
});
test('property ordering does not cause frozen-history drift',()=>{
 const stored=base(),live=base();live.equity[0]=Object.fromEntries(Object.entries(live.equity[0]).reverse());
 assert.equal(compareImported(live,stored).frozenChanged,false);
});
