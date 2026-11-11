'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {composeValuation,createValuationReader}=require('./intraday-valuation.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const date='2026-11-11',now=new Date('2026-11-11T16:55:00Z'); // 11:55 EST
function feed(){return {version:2,epoch:'2026-10-19',status:'SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED',
 snapshot_date:date,realized_model_pnl:125,unrealized_model_pnl:0,current_model_equity:100125,
 active_count:2,active_portfolio:[
 {ticker:'AIZ',entry_price:322.02,current_model_reference_price:322.02,score:82},
 {ticker:'AMD',entry_price:100,current_model_reference_price:100,score:81}],closed_trades:[]};}
function quote(ticker,price,timestamp='2026-11-11T16:50:00.000Z'){
 return {ticker,price,timestamp,provider:'GOOGLEFINANCE',verified:true,
 priceKind:'DELAYED_LAST_QUOTE',session:'REGULAR',delayMinutes:5};}
test('AIZ 31 displayed shares but $10K model normalization; prices rise/fall',()=>{
 const valued=composeValuation(feed(),[quote('AIZ',330),quote('AMD',98)],{now});
 const aiz=valued.active_portfolio[0];
 assert.equal(aiz.model_quantity_shares,31);
 assert.ok(Math.abs(aiz.unrealized_model_pnl-10000*(330/322.02-1))<1e-8);
 assert.ok(Math.abs(aiz.unrealized_share_pnl-31*(330-322.02))<1e-8);
 assert.ok(Math.abs(valued.unrealized_model_pnl-(aiz.unrealized_model_pnl-200))<1e-8);
 assert.equal(valued.current_valuation_model_equity,100000+125+valued.unrealized_model_pnl);
 assert.equal(valued.active_portfolio[0].current_model_reference_price,322.02);
 assert.equal(valued.active_portfolio[0].entry_price,322.02);
 assert.equal(valued.active_portfolio[0].valuation_status,'FRESH_DELAYED');
 const html=renderShadowSwing(valued);
 assert.match(html,/330\.00/);assert.match(html,/GOOGLEFINANCE|Delayed/);
 assert.match(html,/data-valuation-ticker="AIZ"/);
 assert.match(html,/v2\/model\/snapshot/);
});
test('entry equals quote only at opening: zero is valid with certified fresh quote',()=>{
 const x=composeValuation(feed(),[quote('AIZ',322.02),quote('AMD',100)],{now});
 assert.equal(x.active_portfolio[0].unrealized_model_pnl,0);
 assert.equal(x.valuation_status,'FRESH_DELAYED');
});
test('missing quote and partial coverage never masquerade as zero P&L',()=>{
 const x=composeValuation(feed(),[quote('AIZ',330)],{now});
 assert.equal(x.valuation_status,'PARTIAL');
 assert.equal(x.unrealized_model_pnl,null);
 assert.equal(x.current_valuation_model_equity,null);
 assert.equal(x.active_portfolio[1].current_valuation_price,null);
 assert.equal(x.active_portfolio[1].unrealized_model_pnl,null);
 assert.match(renderShadowSwing(x),/UNAVAILABLE/);
});
test('stale, wrong source, future timestamp and closed NYSE session are not fresh',()=>{
 const q=quote('AIZ',330);
 const stale=composeValuation(feed(),[{...q,timestamp:'2026-11-11T15:00:00Z'}],{now});
 assert.equal(stale.active_portfolio[0].valuation_status,'STALE');
 assert.equal(stale.active_portfolio[0].unrealized_model_pnl,null);
 assert.equal(composeValuation(feed(),[{...q,provider:'YAHOO'}],{now}).active_portfolio[0].valuation_status,'UNAVAILABLE');
 assert.equal(composeValuation(feed(),[{...q,timestamp:'2026-11-11T17:05:00Z'}],{now}).active_portfolio[0].valuation_status,'UNAVAILABLE');
 assert.notEqual(composeValuation(feed(),[q],{now:new Date('2026-11-11T22:00:00Z')}).active_portfolio[0].valuation_status,'FRESH_DELAYED');
 assert.notEqual(composeValuation(feed(),[q],{now:new Date('2026-11-14T16:55:00Z')}).active_portfolio[0].valuation_status,'FRESH_DELAYED');
});
test('provider outage retains timestamp, does not rerun trading or ledger writes',async()=>{
 let calls=0,stored=feed();
 const provider={async getQuotes(){calls++;if(calls===1)return [quote('AIZ',330),quote('AMD',98)];throw Error('429')}};
 let time=new Date(now);
 const read=createValuationReader({readFeed:async()=>stored,provider,clock:()=>time});
 const first=await read();
 time=new Date('2026-11-11T17:16:00Z');
 const second=await read();
 assert.equal(calls,2);
 assert.equal(second.active_portfolio[0].current_valuation_price,330);
 assert.equal(second.active_portfolio[0].valuation_status,'STALE');
 assert.equal(second.active_portfolio[0].unrealized_model_pnl,null);
 assert.deepEqual(stored,feed());
 assert.equal(first.active_portfolio[0].valuation_status,'FRESH_DELAYED');
});
test('read-only API-style response preserves quote metadata and immutable model snapshot',()=>{
 const base=feed(),v=composeValuation(base,[quote('AIZ',330),quote('AMD',98)],{now});
 const payload=JSON.parse(JSON.stringify(v));
 assert.equal(payload.active_portfolio[0].quote_source,'GOOGLEFINANCE');
 assert.equal(payload.active_portfolio[0].quote_delay_minutes,5);
 assert.equal(payload.active_portfolio[0].quote_timestamp_et,'2026-11-11 11:50:00 ET');
 assert.equal(payload.active_portfolio[0].quote_timestamp_utc,'2026-11-11T16:50:00.000Z');
 assert.equal(payload.valuation_coverage,2);
 assert.deepEqual(base,feed());
});

test('NYSE session gates HTTP reads and rate-limit errors back off without fake prices',async()=>{
 let clock=new Date('2026-11-11T13:00:00Z'),calls=0;
 const provider={async getQuotes(){calls++;throw Error('GOOGLE_CHART_ACCESS_RESTRICTED:429')}};
 const read=createValuationReader({readFeed:async()=>feed(),provider,clock:()=>clock});
 await read();assert.equal(calls,0);
 clock=new Date('2026-11-11T15:00:00Z'); // 10:00 EST
 let x=await read();assert.equal(calls,1);assert.equal(x.valuation_status,'UNAVAILABLE_OR_STALE');
 clock=new Date('2026-11-11T15:00:30Z');await read();assert.equal(calls,1);
 clock=new Date('2026-11-11T15:01:01Z');await read();assert.equal(calls,2);
 clock=new Date('2026-11-11T15:02:05Z');await read();assert.equal(calls,2); // exponential 2-minute retry
 clock=new Date('2026-11-11T22:00:00Z');await read();assert.equal(calls,2); // NYSE closed
});

const {normalizeCompletedMinute}=require('./intraday-valuation.cjs');
function minute(ticker,start,close,volume=2000){
 const time=Date.parse(start);
 return {ticker,date:'2026-11-11',start,end:new Date(time+60000).toISOString(),close,
  open:close,high:close,low:close,volume,provider:'GOOGLE_FINANCE_CHART',
  priceKind:'MINUTE_BAR_OHLCV',session:'REGULAR',sourceId:'GOOGLE_CHART_1M:'+ticker+':'+start+':'+'f'.repeat(64)};
}
test('completed 1-minute Google Chart bar never uses future or unfinished candles',()=>{
 const bars=[minute('AMD','2026-11-11T16:53:00Z',102),minute('AMD','2026-11-11T16:56:00Z',999)];
 const q=normalizeCompletedMinute({ticker:'AMD',bars,sourceHash:'a'.repeat(64),now});
 assert.equal(q.price,102);assert.equal(q.timestamp,'2026-11-11T16:54:00.000Z');
 assert.equal(q.provider,'GOOGLE_FINANCE_CHART_1M');
 assert.equal(q.priceKind,'COMPLETED_MINUTE_BAR_CLOSE');
 assert.equal(q.delayMinutes,null);
 assert.equal(normalizeCompletedMinute({ticker:'AMD',bars:[bars[1]],sourceHash:'a'.repeat(64),now}),null);
 assert.throws(()=>normalizeCompletedMinute({ticker:'AMD',bars,sourceHash:'fake',now}),/VALUATION_CHART_EVIDENCE_INVALID/);
});
test('stale Google Sheet quote is replaced only by explicitly labelled fresh completed Chart evidence',async()=>{
 const base=feed(),original=structuredClone(base);
 let calls=0,requests=[];
 const sheet={async getQuotes(){return [quote('AIZ',320),{...quote('AMD',100),timestamp:'2026-11-11T15:00:00Z'}]}};
 const chart={async getMinuteHistory(opts){requests.push(opts);calls++;
  return {ticker:opts.ticker,sourceHash:'a'.repeat(64),bars:[
   minute(opts.ticker,'2026-11-11T16:53:00Z',101.1),
   minute(opts.ticker,'2026-11-11T16:56:00Z',999)
  ]};}};
 const reader=createValuationReader({readFeed:async()=>base,provider:sheet,chartProvider:chart,clock:()=>now});
 const value=await reader();
 assert.equal(value.active_portfolio[0].quote_source,'GOOGLEFINANCE');
 assert.equal(value.active_portfolio[1].quote_source,'GOOGLE_FINANCE_CHART_1M');
 assert.equal(value.active_portfolio[1].valuation_status,'FRESH_MINUTE_BAR');
 assert.equal(value.active_portfolio[1].current_valuation_price,101.1);
 assert.equal(value.active_portfolio[1].quote_delay_minutes,null);
 assert.equal(value.active_portfolio[1].valuation_price_kind,'COMPLETED_MINUTE_BAR_CLOSE');
 assert.equal(value.valuation_status,'FRESH_GOOGLE_VALUATION');
 assert.equal(value.valuation_coverage,2);
 assert.ok(Math.abs(value.unrealized_model_pnl-(10000*(320/322.02-1)+110))<1e-8);
 assert.equal(calls,1);assert.deepEqual(requests,[{ticker:'AMD',fromDate:'2026-11-11',throughDate:'2026-11-11'}]);
 assert.deepEqual(base,original);
 const html=renderShadowSwing(value);
 assert.match(html,/FRESH_MINUTE_BAR/);
 assert.match(html,/completed 1-minute close/);
});
test('invalid, old, wrong-ticker or absent Chart evidence never fabricates fresh P&L',()=>{
 for(const bad of [
  [minute('BAD','2026-11-11T16:53:00Z',99)],
  [minute('AMD','2026-11-11T16:10:00Z',99)],
  [minute('AMD','2026-11-11T16:56:00Z',99)]
 ]){
  const q=normalizeCompletedMinute({ticker:'AMD',bars:bad,sourceHash:'a'.repeat(64),now});
  const x=composeValuation(feed(),q?[q]:[],{now});
  assert.notEqual(x.active_portfolio[1].valuation_status,'FRESH_MINUTE_BAR');
  assert.equal(x.active_portfolio[1].unrealized_model_pnl,null);
  assert.equal(x.unrealized_model_pnl,null);
 }
});
test('Chart outage leaves missing quote unavailable, with bounded retries',async()=>{
 let calls=0,nowValue=new Date(now);
 const reader=createValuationReader({readFeed:async()=>feed(),provider:{getQuotes:async()=>[]},
  chartProvider:{async getMinuteHistory(){calls++;throw Error('GOOGLE_CHART_ACCESS_RESTRICTED')}},
  clock:()=>nowValue});
 const a=await reader();assert.equal(a.valuation_coverage,0);assert.equal(calls,2);
 nowValue=new Date('2026-11-11T16:55:30Z');await reader();assert.equal(calls,2);
 nowValue=new Date('2026-11-11T16:56:10Z');await reader();assert.equal(calls,4);
 nowValue=new Date('2026-11-11T16:57:20Z');await reader();assert.equal(calls,4);
});
