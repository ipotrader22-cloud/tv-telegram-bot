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
 assert.equal(payload.active_portfolio[0].quote_timestamp_et,'2026-11-11T16:50:00.000Z');
 assert.equal(payload.valuation_coverage,2);
 assert.deepEqual(base,feed());
});
