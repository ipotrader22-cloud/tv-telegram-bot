'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {firstDayPortfolio}=require('./first-day-selector.cjs');
const {CAPS}=require('./core.cjs');
const d='2026-10-19',runAt='2026-10-19T10:00:00-04:00',time='2026-10-19T09:59:20-04:00';
const factorEvidence=Object.fromEntries(Object.keys(CAPS).map(k=>[k,{sourceId:k,explanation:'Verified factor'}]));
const record={entryEligible:true,entryEvidenceId:'approved-setup',ticker:'NVDA',date:d,complete:true,timestamp:time,score:100,factors:{...CAPS},factorsEvidence:factorEvidence,completedDailyBars:250,lastCompletedSessionDate:'2026-10-16',ohlcvSourceId:'ohlcv',newsEvidenceId:'news',marketEvidenceId:'market',sectorEvidenceId:'sector',volumeRvol:1,exchangeVolumeVerified:true,ma20:190,ma50:170,ma200:140};
const rb={date:d,runAt,session:{date:d,isTradingDay:true,providerVerified:true},universe:['NVDA'],benchmarks:[{sourceId:'SPY',timestamp:time}],items:[record]};
const q={ticker:'NVDA',price:200,sourceId:'verified-trade',provider:'quote-provider',timestamp:time,session:'REGULAR',verified:true,exchangeVolume:100};
const args={date:d,runAt,session:rb.session,researchBatch:rb,quotes:[q]};
test('first trading day selects qualifying stock at contemporaneous model price',()=>{const x=firstDayPortfolio(args);assert.equal(x.status,'VALIDATED_SHADOW_ONLY');assert.equal(x.positions[0].entryPrice,200);assert.equal(x.positions[0].shares,50);assert.equal(x.events.length,1);assert.equal(x.publishable,false)});
test('missing market quote means no partial model portfolio',()=>assert.equal(firstDayPortfolio({...args,quotes:[]}).status,'BLOCKED'));
test('no legacy holdings carry into new epoch',()=>assert.equal(firstDayPortfolio({...args,priorActive:[{ticker:'OLD'}]}).reason,'LEGACY_POSITIONS_NOT_ALLOWED'));
test('incomplete research blocks even if positions would otherwise be empty',()=>assert.equal(firstDayPortfolio({...args,researchBatch:{...rb,universe:[]}}).status,'BLOCKED'));
test('ineligible score produces verified no-position session, not a fabricated OPEN',()=>{const result=firstDayPortfolio({...args,researchBatch:{...rb,items:[{...record,score:69,factors:{...CAPS,market:0,sector:0,leadership:0,catalyst:9}}]}});assert.equal(result.status,'BLOCKED')});

test('no more than two fully authorized new model entries in one morning',()=>{
 const names=['NVDA','AMD','MU'];
 const items=names.map((ticker,i)=>({...record,ticker,score:100-i,factors:{...record.factors,market:10-i},entryEligible:true,entryEvidenceId:'setup-'+ticker}));
 const universe=names;
 const quotes=names.map(ticker=>({...q,ticker,sourceId:'trade-'+ticker}));
 const x=firstDayPortfolio({...args,researchBatch:{...rb,universe,items},quotes});
 assert.equal(x.status,'VALIDATED_SHADOW_ONLY');
 assert.equal(x.positions.length,2);
});
test('70-to-79 point new entry needs compelling entry proof',()=>{
 const factors75={...record.factors,market:5,sector:10,leadership:10,catalyst:5,base:10};
 const r75={...record,factors:factors75,score:75,entryEligible:true,entryEvidenceId:'entry'};
 const out=firstDayPortfolio({...args,researchBatch:{...rb,items:[r75]}});
 assert.equal(out.status,'VALIDATED_SHADOW_ONLY');assert.equal(out.positions.length,0);
});
