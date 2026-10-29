'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GOOGLE_POLICY,normalizeGoogleQuote,validGoogleQuote,sourceTime,createGoogleQuoteProvider,QUOTE_SHEET_ID}=require('./google-quote-provider.cjs');
const {hash,priorIdentity,POLICY}=require('./delayed-model-policy.cjs');
const {STAGING_ID}=require('./native-sheets-lease.cjs');
const date='2026-10-22',runAt=date+'T14:00:00.000Z';
const source={symbol:'NASDAQ:AMD',price:112,tradeTimeET:date+' 09:52:17',delayMinutes:15,dailyVolume:100000};
const quote=v=>normalizeGoogleQuote(v,{date,fetchedAt:runAt});
test('Google quote preserves actual delayed source time, never claims 09:40 candle',()=>{
 const q=quote(source);
 assert.equal(q.timestamp,date+'T13:52:17.000Z');assert.equal(q.priceKind,'DELAYED_LAST_QUOTE');
 assert.equal(q.modelFill,false);assert.equal(q.exchangeVolume,undefined);
 assert.equal(validGoogleQuote(JSON.parse(JSON.stringify(q)),{date,runAt}),true);
 assert.equal(validGoogleQuote({...q,price:999},{date,runAt}),false);
 assert.equal(sourceTime('2026-11-02 09:52:17'),'2026-11-02T14:52:17.000Z');
});
test('Google source rejects missing, old, future, prior-session and malformed evidence',()=>{
 for(const v of [
  {...source,tradeTimeET:''},{...source,tradeTimeET:date+' 09:39:59'},
  {...source,tradeTimeET:date+' 10:00:01'},{...source,tradeTimeET:'2026-10-21 09:52:17'},
  {...source,price:0},{...source,price:'112'},{...source,dailyVolume:0},
  {...source,delayMinutes:21},{...source,tradeTimeET:date+' 09:99:00'}
 ])assert.throws(()=>quote(v));
});
function gridFixture(){
 const str=s=>({userEnteredValue:{stringValue:s},effectiveValue:{stringValue:s}});
 const formula=(f,v)=>({userEnteredValue:{formulaValue:f},effectiveValue:typeof v==='number'?{numberValue:v}:{stringValue:v}});
 const cells=[str(source.symbol),formula('=IFERROR(GOOGLEFINANCE(A2,"price"),"")',112),
  formula('=IFERROR(TEXT(GOOGLEFINANCE(A2,"tradetime"),"yyyy-mm-dd hh:mm:ss"),"")',source.tradeTimeET),
  formula('=IFERROR(GOOGLEFINANCE(A2,"datadelay"),"")',15),formula('=IFERROR(GOOGLEFINANCE(A2,"volume"),"")',100000)];
 return {spreadsheetId:STAGING_ID,properties:{timeZone:'America/New_York'},
  sheets:[{properties:{sheetId:QUOTE_SHEET_ID,title:'Engine 2 Quotes'},data:[{rowData:[{}, {values:cells}]}]}]};
}
test('authenticated provider reads only staging quote grid and validates resolved formulas',async()=>{
 const data=gridFixture();let reads=0;
 const api={spreadsheets:{get:async req=>{reads++;assert.equal(req.spreadsheetId,STAGING_ID);assert.deepEqual(req.ranges,["'Engine 2 Quotes'!A1:F11"]);return {data};}}};
 const p=createGoogleQuoteProvider({api,clock:()=>new Date(runAt)});
 assert.equal((await p.getQuotes({date,tickers:['AMD']}))[0].price,112);assert.equal(reads,1);
 for(const mutate of [
  d=>d.spreadsheetId='legacy',d=>d.properties.timeZone='UTC',
  d=>d.sheets[0].data[0].rowData[1].values[1].userEnteredValue.formulaValue='=112'
 ]){
  const d=gridFixture();mutate(d);
  await assert.rejects(()=>createGoogleQuoteProvider({api:{spreadsheets:{get:async()=>({data:d})}},clock:()=>new Date(runAt)}).getQuotes({date,tickers:['AMD']}));
 }
 await assert.rejects(()=>p.getQuotes({date,tickers:['MISSING']}));
});
async function prepared(previous=null){
 const {providers}=require('./test-support/staging-fixture.cjs');
 const {sessionEvidence}=require('./nyse-session-adapter.cjs');
 const b=await providers().researchProvider.getBatch({date,runAt,session:sessionEvidence(date)});
 const batch=JSON.parse(JSON.stringify(b).replaceAll('14:00:00','12:59:00').replaceAll('13:59:00','12:58:00'));
 const p={policy:POLICY,date,sourceSession:'2026-10-21',preparedAt:date+'T12:59:00Z',
  priorHash:hash(priorIdentity(previous)),batch,exits:[],checkedThrough:'2026-10-21T20:00:00.000Z'};
 p.fingerprint=hash(p);return p;
}
test('Google policy recomputes immutable ledger inputs, JSONB order and visible source times',async()=>{
 const {proposeDelayed}=require('./delayed-model-cycle.cjs'),{validateMorningCommit}=require('./clean-ledger.cjs');
 const {buildStagingArtifact}=require('./staging-artifact.cjs'),{renderShadowSwing}=require('./shadow-swing-page.cjs');
 const input=proposeDelayed({date,runAt,prepared:await prepared(),previous:null,quotes:[quote(source)],pricePolicy:GOOGLE_POLICY});
 const check=validateMorningCommit(input);assert.equal(check.status,'READY_FOR_SHADOW_COMMIT');
 const reordered=JSON.parse(JSON.stringify(input),(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value);
 assert.equal(validateMorningCommit(reordered).status,'READY_FOR_SHADOW_COMMIT');
 assert.equal(input.positions[0].entryTime,date+'T13:52:17.000Z');assert.equal(input.events[0].decisionAt,runAt);
 const a=buildStagingArtifact({run_id:check.plan.runId,payload_hash:'google-proof',model:check.plan.model,evidence_manifest:{inputs:input}});
 assert.equal(a.feed.quote_times[0].timestamp,date+'T13:52:17.000Z');
 const html=renderShadowSwing(a.feed);assert.match(html,/Latest timestamped Google/);assert.doesNotMatch(html,/Model prices as of 09:40/);
 for(const mutate of [
  i=>i.positions[0].entryPrice=1,i=>i.sourceEvidence.quotes[0].timestamp=date+'T13:40:00Z',i=>i.priceAsOf=date+'T13:40:00Z'
 ]){
  const i=structuredClone(input);mutate(i);assert.equal(validateMorningCommit(i).status,'BLOCKED');
 }
});
test('Google cycle closes first using each stock source time, not a common fabricated cutoff',async()=>{
 const {proposeDelayed}=require('./delayed-model-cycle.cjs');
 const previous={epoch:'2026-10-19',date:'2026-10-21',active:[{ticker:'OLD',entryDate:'2026-10-20',entryTime:'2026-10-20T13:40:00Z',entryPrice:100,exchange:'NASDAQ'}],closed:[]};
 const p=await prepared(previous),r=structuredClone(p.batch.items[0]);r.ticker='OLD';p.batch.universe.push('OLD');p.batch.items.push(r);
 p.exits.push({ticker:'OLD',entryDate:'2026-10-20',reason:'STOP LOSS',triggerAt:'2026-10-21T15:00:00Z',sourceId:'prior-low'});
 delete p.fingerprint;p.fingerprint=hash(p);
 const input=proposeDelayed({date,runAt,prepared:p,previous,pricePolicy:GOOGLE_POLICY,quotes:[quote(source),quote({...source,symbol:'NASDAQ:OLD',price:91,tradeTimeET:date+' 09:53:00'})]});
 assert.equal(input.events[0].type,'CLOSE');assert.equal(input.events[1].type,'OPEN');
 assert.equal(input.closed[0].exitTime,date+'T13:53:00.000Z');assert.equal(input.positions[0].entryTime,date+'T13:52:17.000Z');
 assert.equal(require('./clean-ledger.cjs').validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
});
test('Google policy keeps preopen scheduling and cannot commit after morning window',async()=>{
 const {runScheduled}=require('./staging-cron.cjs');let preparedCalls=0;
 const result=await runScheduled({env:{VIXALE_V2_SHADOW_MODE:'READ_ONLY',VIXALE_V2_SHADOW_DATABASE_URL:'postgres://localhost/vixale_engine_v2_shadow_20990101',VIXALE_V2_STAGING_PRICE_POLICY:GOOGLE_POLICY},
  clock:()=>new Date('2026-10-26T12:00:00Z'),createWorker:()=>({status:()=>({enabled:true,missing:[]}),prepare:async()=>{preparedCalls++;return {status:'PREOPEN_PREPARED'};}})});
 assert.equal(result.status,'PREOPEN_PREPARED');assert.equal(preparedCalls,1);
 let commits=0;const p=await prepared();
 const out=await require('./delayed-model-cycle.cjs').runDelayedCycle({date,runAt,prepared:p,pricePolicy:GOOGLE_POLICY,clock:()=>new Date(date+'T14:06:00Z'),getPrior:async()=>null,quoteProvider:{getQuotes:async()=>[quote(source)]},commit:async()=>{commits++;}});
 assert.equal(out.status,'BLOCKED');assert.equal(commits,0);
});
test('Google artifact retries preserve one ledger/Sheet write and email remains off',async t=>{
 const {harness}=require('./test-support/staging-harness.cjs');
 const {runDelayedCycle}=require('./delayed-model-cycle.cjs'),{validateMorningCommit}=require('./clean-ledger.cjs');
 const p=await prepared(),q=quote(source);let record=null,state=null,commits=0;
 const ledger={readRun:async()=>record,readState:async()=>state,runCycle:args=>runDelayedCycle({...args,pricePolicy:GOOGLE_POLICY,getPrior:async()=>null,commit:async({inputs})=>{
  const v=validateMorningCommit(inputs);assert.equal(v.status,'READY_FOR_SHADOW_COMMIT');commits++;
  record={run_id:v.plan.runId,payload_hash:'google-proof',model:v.plan.model,evidence_manifest:{inputs,publicCandidates:[]}};
  state={epoch:'2026-10-19',date,active:inputs.positions,closed:inputs.closed,history:[{date,equity:v.plan.model.equity,realized:0,unrealized:0}]};return {status:'SHADOW_COMMITTED'};
 }})};
 const h=await harness(t,{ledger});h.args.emailEnabled=false;h.args.prepareProviders=async()=>({prepared:p,quoteProvider:{getQuotes:async()=>[q]}});
 assert.equal((await h.run()).status,'STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED');
 assert.equal((await h.run()).status,'STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED');
 assert.equal(commits,1);assert.equal(h.sheets.writes,1);assert.equal(h.sends,0);
});
