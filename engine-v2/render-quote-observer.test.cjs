'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assessStatus,pollRenderQuoteStatus,validateUrl}=require('./render-quote-observer.cjs');
const url='https://tv-telegram-bot-a7t0.onrender.com/bridge/quotes/status';
const body={ok:true,symbols:[{symbol:'AMD',price:200,source:'TWS',age_seconds:3}]};
test('Render dashboard quote is monitored but NEVER allowed as trade print',()=>{
 const x=assessStatus(body,{symbols:['AMD']});
 assert.equal(x.status,'DISPLAY_QUOTES_OBSERVED');assert.equal(x.tradeEvidenceVerified,false);assert.equal(x.modelEntryEligible,false)
});
test('missing symbol blocks quote coverage',()=>assert.equal(assessStatus(body,{symbols:['AMD','MU']}).status,'BLOCKED'));
test('stale even if source says TWS',()=>assert.equal(assessStatus({...body,symbols:[{symbol:'AMD',price:200,source:'TWS',age_seconds:900}]},{symbols:['AMD']}).status,'BLOCKED'));
test('refuses arbitrary host and embedded credentials',()=>{assert.throws(()=>validateUrl('https://evil.example/bridge/quotes/status'));assert.throws(()=>validateUrl('https://a:b@tv-telegram-bot-a7t0.onrender.com/bridge/quotes/status'))});
test('read-only HTTP uses GET, auth, no-cache, and never reports verified trades',async()=>{
 let called=false;const x=await pollRenderQuoteStatus({url,authorization:'Bearer secret-in-test',symbols:['AMD'],fetchFn:async(target,opts)=>{
  called=true;assert.equal(opts.method,'GET');assert.equal(opts.cache,'no-store');assert.equal(opts.headers.Authorization,'Bearer secret-in-test');
  return {ok:true,text:async()=>JSON.stringify(body)}
 }});
 assert.equal(called,true);assert.equal(x.status,'DISPLAY_QUOTES_OBSERVED');assert.equal(x.tradeEvidenceVerified,false);
});
test('unauthorized private status reports configuration problem without leaking credentials',async()=>{
 const x=await pollRenderQuoteStatus({url,authorization:'Bearer test',fetchFn:async()=>({ok:false,status:401})});
 assert.equal(x.reason,'QUOTE_STATUS_UNAUTHORIZED');assert.equal(JSON.stringify(x).includes('Bearer test'),false)
});
