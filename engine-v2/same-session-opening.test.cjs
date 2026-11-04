'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {etTime}=require('./delayed-model-policy.cjs');
const {verifyCurrentOpenings,createCurrentOpeningProvider}=require('./same-session-opening.cjs');
const {completedBars}=require('./yahoo-minute-fallback.cjs');
const date='2026-11-03',runAt=etTime(date,600),openingTime=etTime(date,570);
const previous={ticker:'CVX',entryDate:'2026-11-02',entryTime:'2026-11-02T15:00:02.000Z',entryPrice:231.77};
const event=(price,ticker='CVX')=>({ticker,date,open:price,time:openingTime,
 minuteET:'09:30',sourceId:'YAHOO_1M:'+ticker+':'+Date.parse(openingTime),
 confirmed:true,session:'REGULAR',priceKind:'MINUTE_BAR_OPEN',indicative:true});
const verify=(positions=[previous],openings=[event(220)])=>verifyCurrentOpenings({date,runAt,positions,openings});
test('verified 09:30 opening is tied to the held prior-session lot and original entry',()=>{
 const x=verify();assert.equal(x.get('CVX').open,220);
 assert.equal(x.get('CVX').open<=previous.entryPrice*.95,true);
 assert.equal(verify([],[]).size,0);
});
test('equality qualifies for opening STOP, but later lows or pre-market do not substitute',()=>{
 const initial=100,lot={...previous,entryPrice:initial};
 assert.equal(verify([lot],[event(95)]).get('CVX').open<=95,true);
 assert.equal(verify([lot],[event(95.01)]).get('CVX').open<=95,false);
 for(const v of [{...event(95),time:etTime(date,571)},{...event(95),minuteET:'09:29'},
  {...event(95),session:'PREMARKET'},{...event(95),priceKind:'MINUTE_BAR_LOW'},
  {...event(95),sourceId:'YAHOO_1M:CVX:WRONG'},{...event(95),confirmed:false},
  {...event(95),indicative:false}])
  assert.throws(()=>verify([lot],[v]),/CURRENT_OPENING_EVIDENCE_INVALID/);
});
test('missing, duplicate, stale, same-day and post-opening-entry evidence blocks',()=>{
 assert.throws(()=>verify([previous],[]),/CURRENT_OPENING_COVERAGE_INCOMPLETE/);
 assert.throws(()=>verify([previous,previous],[event(220),event(220)]),/CURRENT_OPENING_LOT_IDENTITY_INVALID/);
 assert.throws(()=>verify([previous],[event(220,'XOM')]),/CURRENT_OPENING_EVIDENCE_INVALID/);
 assert.throws(()=>verify([{...previous,entryDate:date}],[event(220)]),/CURRENT_OPENING_LOT_IDENTITY_INVALID/);
 assert.throws(()=>verify([{...previous,entryTime:openingTime}],[event(220)]),/CURRENT_OPENING_LOT_IDENTITY_INVALID/);
 assert.throws(()=>verifyCurrentOpenings({date,runAt:etTime(date,570),positions:[previous],openings:[event(220)]}),/CURRENT_OPENING_BAR_NOT_COMPLETE/);
});
test('provider retrieves completed exact 09:30 Yahoo bar, never intraday LOW or live metadata',async()=>{
 const seconds=[570,571,572].map(m=>Date.parse(etTime(date,m))/1000);
 const raw={chart:{result:[{meta:{symbol:'CVX',dataGranularity:'1m'},timestamp:seconds,
  indicators:{quote:[{open:[225,224,223],high:[226,225,224],
   low:[220,210,200],close:[225,224,223],volume:[1000,1300,900]}]}}]}};
 const provider=createCurrentOpeningProvider({fetchFn:async url=>{
  assert.match(url,/\/v8\/finance\/chart\/CVX/);
  return {ok:true,json:async()=>raw};
 }});
 const openings=await provider.getOpenings({date,runAt,positions:[previous]});
 assert.equal(openings[0].open,225);
 assert.equal(verify([previous],openings).get('CVX').open,225);
 assert.equal(completedBars(raw,{ticker:'CVX',date,asOf:runAt}).length,3);
});

test('delayed 09:30 opening is not fetched before 09:50 ET, but is accepted afterwards',async()=>{
 let calls=0;
 const seconds=[570,571].map(m=>Date.parse(etTime(date,m))/1000);
 const delayed={chart:{result:[{meta:{symbol:'CVX'},timestamp:seconds,
  indicators:{quote:[{open:[225,224],high:[226,225],low:[220,210],
   close:[225,224],volume:[1000,1300]}]}}]}};
 const provider=createCurrentOpeningProvider({fetchFn:async()=>{calls++;return {ok:true,json:async()=>delayed}}});
 await assert.rejects(()=>provider.getOpenings({date,runAt:etTime(date,589),positions:[previous]}),/YAHOO_0930_RELEASE_PENDING/);
 assert.equal(calls,0);
 const out=await provider.getOpenings({date,runAt:etTime(date,590),positions:[previous]});
 assert.equal(out[0].time,openingTime);assert.equal(out[0].open,225);
 assert.equal(calls,1);
});
test('missing delayed 09:30 evidence after 09:50 checks backup once and fails closed',async()=>{
 let calls=0;
 const delayed={chart:{result:[{meta:{symbol:'CVX'},timestamp:[Date.parse(etTime(date,571))/1000],
  indicators:{quote:[{open:[224],high:[225],low:[220],close:[224],volume:[1000]}]}}]}};
 const provider=createCurrentOpeningProvider({fetchFn:async()=>{calls++;return {ok:true,json:async()=>delayed}}});
 const out=await provider.getOpenings({date,runAt:etTime(date,600),positions:[previous]});
 assert.equal(out[0].status,'BLOCKED');assert.equal(out[0].reason,'FALLBACK_0930_OPEN_UNAVAILABLE');
 assert.equal(calls,2);
});

test('Google priceopen opening passes same strict held-lot identity and fails closed when tampered',()=>{
 const {normalizeGoogleOpening}=require('./google-quote-provider.cjs');
 const open=normalizeGoogleOpening({symbol:'NYSE:CVX',open:95,
  tradeTimeET:date+' 09:45:00',delayMinutes:15},{date,observedAt:runAt});
 assert.equal(verifyCurrentOpenings({date,runAt,positions:[previous],openings:[open]}).get('CVX').open,95);
 for(const change of [
  o=>o.open=1,o=>o.time=etTime(date,571),o=>o.sourceId='unverified',
  o=>o.sourceValues.open=90,o=>o.observedAt=etTime(date,601),
  o=>o.sourceTradeTime=etTime(date,600)
 ]){
  const invalid=structuredClone(open);change(invalid);
  assert.throws(()=>verifyCurrentOpenings({date,runAt,positions:[previous],openings:[invalid]}),
   /CURRENT_OPENING_EVIDENCE_INVALID/);
 }
});
