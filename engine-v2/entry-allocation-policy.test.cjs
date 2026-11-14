'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const allocation=require('./entry-allocation-policy.cjs');
const {CAPS}=require('./core.cjs');
const {POLICY,hash,priorIdentity,etTime,fixedQuote}=require('./delayed-model-policy.cjs');
const {proposeDelayed,runDelayedCycle}=require('./delayed-model-cycle.cjs');
const {validateMorningCommit}=require('./clean-ledger.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const date='2026-11-16',runAt=etTime(date,600);
const factors=n=>Object.fromEntries(Object.entries(CAPS).map(([key,cap])=>{const v=Math.min(n,cap);n-=v;return [key,v]}));
async function fixture(scores,previous=null){
 const original=await require('./test-support/staging-fixture.cjs').providers().researchProvider.getBatch({date:'2026-10-22',runAt:'2026-10-22T14:00:00Z',session:sessionEvidence('2026-10-22')});
 const batch=JSON.parse(JSON.stringify(original).replaceAll('2026-10-22','2026-11-16').replaceAll('2026-10-21','2026-11-13'));
 batch.runAt=etTime(date,540);
 const template=batch.items[0];
 batch.items=Object.entries(scores).map(([ticker,score])=>({...structuredClone(template),ticker,score,factors:factors(score),timestamp:etTime(date,539),entryEligible:false,entryEvidenceId:null,compellingEntryEvidenceId:null}));
 batch.universe=Object.keys(scores);
 const prepared={policy:POLICY,date,sourceSession:'2026-11-13',preparedAt:etTime(date,540),priorHash:hash(priorIdentity(previous)),batch,exits:[],checkedThrough:etTime('2026-11-13',960)};
 const seal=()=>{delete prepared.fingerprint;prepared.fingerprint=hash(prepared)};seal();
 const quotes=batch.items.map(r=>fixedQuote([{ticker:r.ticker,date,start:etTime(date,579),end:etTime(date,580),close:100,volume:100,provider:'YAHOO_CHART',sourceId:'SYNTHETIC:'+r.ticker}],{ticker:r.ticker,date,fetchedAt:runAt}));
 const openings=(previous?.active||[]).map(p=>({ticker:p.ticker,date,open:100,time:etTime(date,570),minuteET:'09:30',sourceId:'YAHOO_1M:'+p.ticker+':'+Date.parse(etTime(date,570)),confirmed:true,session:'REGULAR',priceKind:'MINUTE_BAR_OPEN',indicative:true}));
 return {prepared,quotes,openings,seal};
}
const lot=ticker=>({ticker,exchange:'NASDAQ',entryDate:'2026-11-12',entryTime:etTime('2026-11-12',580),entryPrice:100,currentPrice:100,entryScore:70,currentScore:70,lastTargetCheckedAt:etTime('2026-11-13',960)});
const prior=(active=[],closed=[])=>({epoch:'2026-10-19',date:'2026-11-13',active,closed});
const close=(ticker,extra={})=>({ticker,entryDate:'2026-11-05',entryPrice:100,exitPrice:90,returnPct:-.1,exitDate:'2026-11-10',effectiveDate:'2026-11-10',includePublic:'YES',...extra});

test('new entry is strictly score >70; old commit policy and invalid scores are preserved',()=>{
 for(const n of [71,75,79,80,100])assert.equal(allocation.eligible({score:n,entryEligible:false},date),true);
 for(const n of [69,70,70.5,101,NaN,'78',null])assert.equal(allocation.eligible({score:n},date),false);
 assert.equal(allocation.eligible({score:78,entryEligible:true,entryEvidenceId:'setup'},'2026-11-13'),false);
 assert.equal(allocation.eligible({score:80,entryEligible:true,entryEvidenceId:'setup'},'2026-11-13'),true);
});
test('fills ten slots in rank order without setup flags; insufficient candidates stay honest',async()=>{
 const scores={Z:75,B:75,A:75,C:78,D:77,E:76,F:74,G:73,H:72,I:71,J:71,K:70,L:69};
 const f=await fixture(scores);
 const input=proposeDelayed({date,runAt,previous:null,...f});
 assert.equal(input.positions.length,10);
 assert.deepEqual(input.positions.map(p=>p.ticker),['C','D','E','A','B','Z','F','G','H','I']);
 assert.equal(validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
 assert.ok(input.positions.every(p=>p.entryScore>70&&p.shares===100));
 const small=await fixture({CLX:78,REGN:77,LOW:70});
 assert.equal(proposeDelayed({date,runAt,previous:null,...small}).positions.length,2);
});
test('retains 70-score holdings and fills all remaining slots despite realized losses',async()=>{
 const previous=prior([lot('AIZ'),lot('EXR')],[close('OLD')]);
 const f=await fixture({AIZ:70,EXR:70,CLX:78,REGN:77,A:75,B:75,C:75,D:74,E:73,F:72,G:71},previous);
 const input=proposeDelayed({date,runAt,previous,...f});
 assert.equal(input.positions.length,10);
 assert.equal(input.events.filter(e=>e.type==='KEEP').length,2);
 assert.equal(input.events.filter(e=>e.type==='OPEN').length,8);
 assert.deepEqual(input.closed,previous.closed);
 const v=validateMorningCommit(input);assert.equal(v.status,'READY_FOR_SHADOW_COMMIT');
 assert.ok(Math.abs(v.plan.model.realized+1000)<1e-6);
 assert.ok(Math.abs(v.plan.model.equity-99000)<1e-6);
 // Derived cash remains -$1K; no history or formula is reset to pretend a gain.
 assert.ok(Math.abs(100000+v.plan.model.realized-input.positions.length*10000+1000)<1e-6);
});
test('prior closed ticker can qualify as a new lot; same-day closes and excluded historical lots cannot duplicate',async()=>{
 const previous=prior([],[close('CLX'),close('REGN',{includePublic:'NO'}),close('TODAY',{exitDate:date,effectiveDate:date})]);
 const f=await fixture({CLX:78,REGN:77,TODAY:90},previous);
 const input=proposeDelayed({date,runAt,previous,...f});
 assert.deepEqual(input.positions.map(p=>p.ticker),['CLX','REGN']);
 assert.ok(input.positions.every(p=>p.entryDate===date));
 assert.deepEqual(input.closed,previous.closed);
 assert.equal(validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
});
test('full portfolio makes no new entries, and opening exits release a replacement slot',async()=>{
 const names=Array.from({length:10},(_,i)=>String.fromCharCode(65+i));
 const previous=prior(names.map(lot)),scores=Object.fromEntries([...names.map(t=>[t,75]),['NEW',90]]);
 const f=await fixture(scores,previous);
 assert.equal(proposeDelayed({date,runAt,previous,...f}).events.filter(e=>e.type==='OPEN').length,0);
 f.openings[0].open=95;
 const input=proposeDelayed({date,runAt,previous,...f});
 assert.equal(input.positions.length,10);assert.equal(input.closed.at(-1).reason,'STOP LOSS');
 assert.equal(input.events.at(-1).ticker,'NEW');assert.equal(input.events.at(-1).type,'OPEN');
 assert.equal(validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
});
test('quote collection requests selected entries only and old false flags cannot withhold prices',async()=>{
 const f=await fixture(Object.fromEntries(Array.from({length:12},(_,i)=>[String.fromCharCode(65+i),78])));
 let committed;
 const r=await runDelayedCycle({date,runAt,prepared:f.prepared,clock:()=>new Date(runAt),getPrior:async()=>null,
  quoteProvider:{getQuotes:async({tickers})=>{assert.deepEqual(tickers,['A','B','C','D','E','F','G','H','I','J']);return f.quotes.filter(q=>tickers.includes(q.ticker))}},
  commit:async({inputs})=>{committed=inputs;return {status:'SHADOW_COMMITTED'}}});
 assert.equal(r.status,'SHADOW_COMMITTED');assert.equal(committed.positions.length,10);
 assert.equal(validateMorningCommit(committed).status,'READY_FOR_SHADOW_COMMIT');
});
test('missing price, stale research, tampered factors and after-hours writes still block',async()=>{
 const f=await fixture({CLX:78});
 assert.throws(()=>proposeDelayed({date,runAt,previous:null,...f,quotes:[]}),/QUOTE_MISSING/);
 assert.throws(()=>proposeDelayed({date,runAt:etTime(date,960),previous:null,...f}),/REVIEW_UNVERIFIED/);
 f.prepared.batch.items[0].score=79;f.seal();
 assert.throws(()=>proposeDelayed({date,runAt,previous:null,...f}),/REVIEW_UNVERIFIED/);
});
test('Google production pricing path promotes a 78-score candidate with no extra signal',async()=>{
 const f=await fixture({CLX:78});
 const {GOOGLE_POLICY,normalizeGoogleQuote}=require('./google-quote-provider.cjs');
 const q=normalizeGoogleQuote({symbol:'NYSE:CLX',price:120,tradeTimeET:date+' 09:55:00',delayMinutes:15,dailyVolume:1000},{date,fetchedAt:runAt});
 const input=proposeDelayed({date,runAt,previous:null,...f,quotes:[q],pricePolicy:GOOGLE_POLICY});
 assert.equal(input.positions[0].entryPrice,120);assert.equal(input.positions[0].entryScore,78);
 assert.equal(validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
 const v=validateMorningCommit(input);
 const artifact=require('./staging-artifact.cjs').buildStagingArtifact({run_id:v.plan.runId,payload_hash:'synthetic',model:v.plan.model,evidence_manifest:{inputs:input}});
 assert.equal(artifact.feed.active_count,1);
});
