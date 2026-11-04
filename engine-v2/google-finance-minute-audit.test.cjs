'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {count,probe,flatten,unpack}=require('./google-finance-minute-audit.cjs');
const make=()=>Array.from({length:390},(_,i)=>({
 time:new Date(Date.parse('2026-11-03T14:30:00Z')+i*60000).toISOString(),
 open:100,high:101,low:99,close:100,volume:1234
}));
test('exact 09:31–15:59 minute coverage passes whether 09:30 exists or not',()=>{
 const all=count(make(),{symbol:'CVX:NYSE'});
 const withoutOpening=count(make().slice(1),{symbol:'CVX:NYSE'});
 for(const r of [all,withoutOpening]){
  assert.equal(r.status,'PASS');assert.equal(r.count,389);
  assert.equal(r.expected,389);assert.equal(r.missing,0);
  assert.equal(r.firstRequired931,true);assert.equal(r.last1559,true);
  assert.equal(r.requiredFromET,'09:31');assert.equal(r.requiredThroughET,'15:59');
  assert.equal(r.opening930RequiredForTarget,false);
  assert.equal(r.opening930StopProof,'INDEPENDENT_PRICEOPEN_REQUIRED');
 }
 assert.equal(all.opening930,true);
 assert.equal(withoutOpening.opening930,false);
});
test('missing 09:31 blocks even when 09:30 exists; 09:30 does not replace a later minute',()=>{
 const bars=make(),miss931=bars.filter((_,i)=>i!==1);
 const r=count(miss931,{symbol:'CVX:NYSE'});
 assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'COVERAGE_GAP');
 assert.equal(r.opening930,true);assert.equal(r.firstRequired931,false);
 assert.equal(r.count,388);assert.equal(r.missing,1);
});
test('09:30 is not accepted as an independent stop trigger just because target coverage passes',()=>{
 const bars=make().slice(1);
 bars[0]={...bars[0],open:101,high:102,low:100,close:101};
 const r=count(bars,{symbol:'CVX:NYSE'});
 assert.equal(r.status,'PASS');
 assert.equal(r.opening930,false);
 assert.equal(r.opening930StopProof,'INDEPENDENT_PRICEOPEN_REQUIRED');
});
test('missing, duplicate, malformed, wrong date and zero volume block',()=>{
 const a=make();a.splice(40,1);assert.equal(count(a,{symbol:'CVX:NYSE'}).reason,'COVERAGE_GAP');
 const b=make();b.push(b[12]);assert.equal(count(b,{symbol:'CVX:NYSE'}).reason,'DUPLICATE_MINUTES');
 for(const key of ['volume','high','time']){
  const x=make();if(key==='volume')x[10].volume=0;
  if(key==='high')x[10].high=5;
  if(key==='time')x[10].time='2026-11-02T15:00:00Z';
  assert.equal(count(x,{symbol:'CVX:NYSE'}).status,'BLOCKED');
 }
});
test('Google RPC preserves real candle fields and rejects line-only data',()=>{
 const raw=[[[['CVX','NYSE'],null,null,[[null,null,[
   [100,101,102,99,'2026-11-03T09:30:00-05:00',2345]
 ]]],null,null,null,null,60]]];
 const response=JSON.stringify([['wrb.fr','c2u4wc',JSON.stringify(raw),null,null,null,'1']]);
 const rows=flatten(unpack(")]}'\n"+response));
 assert.equal(rows[0].symbol,'CVX:NYSE');assert.equal(rows[0].seconds,60);
 assert.equal(rows[0].candles[0].volume,2345);
 assert.equal(rows[0].candles[0].high,102);
});
test('source 429/403 blocks rather than retrying around access restrictions',async()=>{
 for(const code of [403,429]){
  let calls=0;const r=await probe({fetcher:async()=>{calls++;return {status:code,ok:false}}});
  assert.equal(r.reason,'GOOGLE_ACCESS_RESTRICTED');assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(r),/token|secret|price/);
 }
});