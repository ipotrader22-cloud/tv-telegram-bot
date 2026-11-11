'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {probe}=require('./staging-external-parity.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const feed=()=>({version:2,epoch:'2026-10-19',snapshot_date:'2026-10-30',snapshot_id:'a'.repeat(64),active_portfolio:[],active_count:0,closed_trades:[],candidates:[],status:'SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED',realized_model_pnl:0,unrealized_model_pnl:0,current_model_equity:100000});
const health=()=>({mode:'READ_ONLY',databaseConnected:true,schemaInitialized:true,stagingPipeline:{emailEnabled:false},cleanSlate:{epoch:'2026-10-19',readyForProduction:false}});
function mock({healthValue=health(),feedValue=feed(),htmlValue,cache='no-store',failures={}}={}){
 const html=htmlValue===undefined?renderShadowSwing(feedValue):htmlValue;
 const requests=[],counts={},sleeps=[];
 const fetcher=async url=>{
  const path=new URL(url).pathname;
  requests.push(path);counts[path]=(counts[path]||0)+1;
  const failure=failures[path]?.[counts[path]-1];
  if(failure==='THROW')throw Error('simulated transport error');
  if(failure)return new Response('unavailable',{status:failure,headers:{'cache-control':cache}});
  const body=path==='/health'?JSON.stringify(healthValue):path==='/v2/model/snapshot'?JSON.stringify(feedValue):html;
  return new Response(body,{status:200,headers:{'cache-control':cache}});
 };
 return {fetcher,requests,counts,sleeps,pause:async ms=>sleeps.push(ms)};
}
test('exact external shadow parity with read-only gates succeeds',async()=>{
 const m=mock(),r=await probe(m);
 assert.equal(r.status,'EXTERNAL_STAGING_API_HTML_PASS');
 assert.equal(r.emailEnabled,false);assert.equal(r.productionCutover,false);
 assert.deepEqual(m.requests,['/health','/v2/model/snapshot','/v2/swing-trading']);
});
test('transient 503 and 429 retry without new financial operations',async()=>{
 const m=mock({failures:{'/health':[503],'/v2/model/snapshot':[429]}});
 assert.equal((await probe(m)).status,'EXTERNAL_STAGING_API_HTML_PASS');
 assert.deepEqual(m.sleeps,[3000,3000]);
 assert.equal(m.counts['/health'],2);assert.equal(m.counts['/v2/model/snapshot'],2);
});
test('transport exceptions retry boundedly',async()=>{
 const m=mock({failures:{'/health':['THROW','THROW']}});
 assert.equal((await probe(m)).status,'EXTERNAL_STAGING_API_HTML_PASS');
 assert.deepEqual(m.sleeps,[3000,8000]);
});
test('403 is a permanent failure and never retried',async()=>{
 const m=mock({failures:{'/health':[403]}});
 await assert.rejects(probe(m),/STAGING_HTTP_NOT_200:\/health:403/);
 assert.equal(m.requests.length,1);assert.equal(m.sleeps.length,0);
});
test('exhausted transient 503 is blocked after exactly three attempts',async()=>{
 const m=mock({failures:{'/health':[503,503,503]}});
 await assert.rejects(probe(m),/STAGING_TRANSIENT_HTTP_EXHAUSTED/);
 assert.equal(m.requests.length,3);assert.deepEqual(m.sleeps,[3000,8000]);
});
test('API and visible HTML mismatch is a permanent failure',async()=>{
 const m=mock({htmlValue:'<!doctype html><html>stale</html>'});
 await assert.rejects(probe(m),/EXACT_VISIBLE_HTML_MISMATCH/);
 assert.equal(m.requests.length,3);assert.equal(m.sleeps.length,0);
});
test('staging email enabled is blocked',async()=>{
 const h=health();h.stagingPipeline.emailEnabled=true;
 await assert.rejects(probe(mock({healthValue:h})),/STAGING_EMAIL_NOT_DISABLED/);
});
test('cacheable HTTP responses are blocked',async()=>{
 await assert.rejects(probe(mock({cache:'public, max-age=60'})),/STAGING_CACHE_POLICY/);
});
test('invalid and missing snapshot dates are blocked',async()=>{
 for(const date of ['',null,'2026-10-1x','2026-10-18']){
  const f=feed();f.snapshot_date=date;
  await assert.rejects(probe(mock({feedValue:f})),/SNAPSHOT_SCHEMA_UNVERIFIED/);
 }
});
test('wrong host is rejected before network access',async()=>{
 const m=mock();
 await assert.rejects(probe({...m,origin:'https://tv-telegram-bot-a7t0.onrender.com'}),/UNAPPROVED_STAGING_ORIGIN/);
 assert.equal(m.requests.length,0);
});

test('separate intraday quote observations can change while exact HTML evidence still passes',async()=>{
 const a=feed(),b=feed();
 const same={ticker:'AIZ',entry_date:'2026-10-30',entry_price:322.02,current_model_reference_price:322.02};
 a.active_portfolio=[{...same,current_valuation_price:330,quote_source:'GOOGLEFINANCE',quote_delay_minutes:15,quote_timestamp_utc:'2026-11-11T17:15:00Z',quote_timestamp_et:'2026-11-11 12:15:00 ET',valuation_status:'FRESH_DELAYED',unrealized_model_pnl:10000*(330/322.02-1)}];
 b.active_portfolio=[{...same,current_valuation_price:330.2,quote_source:'GOOGLEFINANCE',quote_delay_minutes:15,quote_timestamp_utc:'2026-11-11T17:16:00Z',quote_timestamp_et:'2026-11-11 12:16:00 ET',valuation_status:'FRESH_DELAYED',unrealized_model_pnl:10000*(330.2/322.02-1)}];
 for(const v of [a,b]){v.active_count=1;v.valuation_coverage=1;v.valuation_read_only=true;v.unrealized_model_pnl=v.active_portfolio[0].unrealized_model_pnl;v.total_valuation_model_pnl=v.unrealized_model_pnl;v.current_valuation_model_equity=100000+v.unrealized_model_pnl;}
 a.valuation_as_of='2026-11-11T17:25:00Z';b.valuation_as_of='2026-11-11T17:25:10Z';
 assert.equal((await probe(mock({feedValue:a,htmlValue:renderShadowSwing(b)}))).status,'EXTERNAL_STAGING_API_HTML_PASS');
 const altered=structuredClone(b);altered.active_portfolio[0].entry_price=300;
 await assert.rejects(()=>probe(mock({feedValue:a,htmlValue:renderShadowSwing(altered)})),/EXACT_VISIBLE_HTML_MISMATCH/);
 const forged=renderShadowSwing(b).replace('FRESH_DELAYED · GOOGLEFINANCE', 'STALE · GOOGLEFINANCE');
 await assert.rejects(()=>probe(mock({feedValue:a,htmlValue:forged})),/STAGING_STALE_PNL_PRESENT/);
});
test('tampered rendered model fingerprint is rejected by exact HTML comparison',async()=>{
 const f=feed(),html=renderShadowSwing(f);
 await assert.rejects(()=>probe(mock({htmlValue:html.replace('id="model-snapshot-id"', 'id="model-snapshot-falsified"')})),/EXACT_VISIBLE_HTML_MISMATCH/);
});
