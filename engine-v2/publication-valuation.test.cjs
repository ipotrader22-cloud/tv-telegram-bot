'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {harness}=require('./test-support/staging-harness.cjs');
const {runAt}=require('./test-support/staging-fixture.cjs');
const {composeValuation}=require('./intraday-valuation.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const {directReadback}=require('./direct-publication-readback.cjs');
const {createReadbackSnapshotReader}=require('./readback-snapshot-reader.cjs');
async function valuedHarness(t,mutate=()=>{},htmlMutate=x=>x){
 const h=await harness(t),original=h.args.fetcher;
 const read=createReadbackSnapshotReader({read:async()=>{
  const feed=await h.store.publishedFeed();
  const quotes=feed.active_portfolio.map(p=>({ticker:p.ticker,price:p.entry_price*1.03,
   timestamp:runAt,provider:'GOOGLEFINANCE',priceKind:'DELAYED_LAST_QUOTE',
   session:'REGULAR',verified:true,delayMinutes:0,privateRaw:'must-not-leak'}));
  const out=composeValuation(feed,quotes,{now:new Date(runAt)});mutate(out);return out;
 }});
 h.args.readback=options=>directReadback({...options,clock:()=>new Date(runAt)});
 h.args.fetcher=async(url,opts)=>{
  if(String(url).startsWith('https://api.resend.com/'))return original(url,opts);
  const u=new URL(url),feed=await read(u.searchParams.get('engine2_readback'));
  const body=u.pathname.endsWith('/snapshot')?JSON.stringify(feed):htmlMutate(renderShadowSwing(feed));
  return new Response(body,{headers:{'cache-control':'no-store'}});
 };
 return h;
}
test('real pipeline accepts live valuation, preserves decision, sends once after restart',async t=>{
 const h=await valuedHarness(t);assert.equal((await h.run()).status,'ACCEPTED_NOT_DELIVERED');
 assert.equal(h.sends,1);h.deliver();assert.equal((await h.run()).status,'DELIVERED');
 assert.equal(h.sends,1);assert.equal(h.sheets.writes,1);
});
for(const [name,mutate] of [
 ['entry',f=>f.active_portfolio[0].entry_price++],
 ['score',f=>f.active_portfolio[0].score++],
 ['P&L',f=>f.active_portfolio[0].unrealized_model_pnl++],
 ['quantity',f=>f.active_portfolio[0].model_quantity_shares++],
 ['total',f=>f.current_valuation_model_equity++],
 ['coverage',f=>f.valuation_coverage++],
 ['realized',f=>f.realized_model_pnl++],
 ['snapshot',f=>f.snapshot_id='wrong'],
 ['extra field',f=>f.unrecognized=true],
 ['stale timestamp',f=>f.valuation_as_of=new Date(Date.parse(runAt)-61000).toISOString()],
 ['future timestamp',f=>f.valuation_as_of=new Date(Date.parse(runAt)+6000).toISOString()],
 ['raw evidence field',f=>f.valuation_quotes[0].privateRaw='not allowed']
])test('valued publication rejects '+name+' tampering before email',async t=>{
 const h=await valuedHarness(t,mutate);const r=await h.run();
 assert.equal(r.reason,'WEBSITE:EXACT_API_SNAPSHOT_MISMATCH');assert.equal(h.sends,0);
});
test('valued HTML must match every byte of the verified API',async t=>{
 const h=await valuedHarness(t,()=>{},x=>x+' ');
 assert.equal((await h.run()).reason,'WEBSITE:EXACT_VISIBLE_HTML_MISMATCH');assert.equal(h.sends,0);
});
test('readback tokens pair concurrent API/HTML, expire, bound memory, and recover errors',async()=>{
 let at=0,calls=0,reject=false;
 const read=createReadbackSnapshotReader({clock:()=>at,limit:2,read:async()=>{
  calls++;if(reject)throw Error('offline');return {calls};
 }});
 const a=randomUUID(),b=randomUUID(),c=randomUUID();
 const pair=await Promise.all([read(a),read(a)]);assert.equal(pair[0],pair[1]);assert.equal(calls,1);
 await read(b);await read(c);await read(a);assert.equal(calls,4);
 at=45001;await read(a);assert.equal(calls,5);
 await read();await read('invalid');assert.equal(calls,7);
 reject=true;const d=randomUUID();await assert.rejects(read(d));reject=false;await read(d);assert.equal(calls,9);
});
test('transport retry pairs the nonce and changes it between attempts',async()=>{
 const seen=[];
 const r=await directReadback({manifest:{payload:{feed:{}}},apiUrl:'https://example.test/api',htmlUrl:'https://example.test/html',
  pause:async()=>{},fetcher:async url=>{seen.push(new URL(url).searchParams.get('engine2_readback'));return new Response('',{status:503})}});
 assert.equal(r.reason,'TRANSIENT_READBACK_UNAVAILABLE');assert.equal(seen.length,6);
 for(let i=0;i<6;i+=2)assert.equal(seen[i],seen[i+1]);
 assert.equal(new Set(seen).size,3);
});
