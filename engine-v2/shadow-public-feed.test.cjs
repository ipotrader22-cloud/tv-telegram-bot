'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeReadOnlyFeed}=require('./shadow-public-feed.cjs');
test('empty new epoch does not fabricate a current reviewed date',()=>{
 const x=makeReadOnlyFeed(null);
 assert.equal(x.status,'INCEPTION_ONLY_NOT_REVIEWED');assert.equal(x.snapshot_date,null);
 assert.equal(x.starting_model_equity,100000);assert.equal(x.current_model_equity,null);
});
test('new epoch computes 10k normalized model profit and hides private factor evidence',()=>{
 const x=makeReadOnlyFeed({epoch:'2026-10-19',date:'2026-10-22',active:[{
  ticker:'AMD',entryDate:'2026-10-22',entryPrice:100,currentPrice:102,currentScore:82,fullReviewDate:'2026-10-22',
  modelEntryIndicative:true,privateFactors:{market:10}}],closed:[]});
 assert.ok(Math.abs(x.current_model_equity-100200)<0.01);
 assert.equal(x.active_portfolio[0].indicative_entry,true);
 assert.equal(JSON.stringify(x).includes('privateFactors'),false);
 assert.equal(x.published,false);
});
test('only Q YES and effective R date count as public realized performance',()=>{
 const x=makeReadOnlyFeed({epoch:'2026-10-19',date:'2026-10-22',active:[],closed:[
  {ticker:'A',entryDate:'2026-10-19',exitDate:'2026-10-21',entryPrice:100,exitPrice:110,includePublic:'YES',effectiveDate:'2026-10-21'},
  {ticker:'B',entryDate:'2026-10-19',exitDate:'2026-10-21',entryPrice:100,exitPrice:50,includePublic:'NO',effectiveDate:'2026-10-21'},
  {ticker:'C',entryDate:'2026-10-19',exitDate:'2026-10-21',entryPrice:100,exitPrice:50,includePublic:'YES',effectiveDate:'2026-10-23'}
 ]});
 assert.equal(x.closed_trades.length,1);assert.ok(Math.abs(x.realized_model_pnl-1000)<1e-7);
});
test('reject carryover state from earlier epoch',()=>assert.throws(()=>makeReadOnlyFeed({epoch:'2026-08-21',date:'2026-10-22',active:[],closed:[]})));
