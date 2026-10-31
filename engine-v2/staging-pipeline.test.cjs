'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http');
const {runStagingPipeline}=require('./staging-pipeline.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const {assertArtifact}=require('./staging-artifact.cjs');
const {date,runAt,providers,memoryLedger,memoryStore,fakeSheets}=require('./test-support/staging-fixture.cjs');
const {harness}=require('./test-support/staging-harness.cjs');
test('research → ledger → atomic sheet → actual HTTP HTML/API → accepted then delivered; restart sends once',async t=>{
 const h=await harness(t);const first=await h.run();assert.equal(first.status,'ACCEPTED_NOT_DELIVERED',JSON.stringify(first));assert.equal(h.sends,1);assert.equal(h.sheets.writes,1);
 const artifact=h.store.rows.get(date).artifact;assertArtifact(artifact);assert.equal(artifact.positions[0].exchange,'NASDAQ');assert.equal(artifact.feed.active_portfolio[0].score,90);
 h.deliver();assert.equal((await h.run()).status,'DELIVERED');assert.equal(h.sends,1);assert.equal(h.sheets.writes,1);
 assert.equal((await h.run()).status,'DELIVERED');assert.equal(h.sends,1);
});
test('lost atomic sheet response recovers exact fence and cells without rewriting or premature email',async t=>{
 const h=await harness(t);h.sheets.loseNextReply();assert.equal((await h.run()).status,'BLOCKED');assert.equal(h.sends,0);assert.equal(h.sheets.writes,1);
 assert.equal((await h.run()).status,'ACCEPTED_NOT_DELIVERED');assert.equal(h.sheets.writes,1);assert.equal(h.sends,1);
});
test('stale visible HTML with valid snapshot hash blocks email',async t=>{const h=await harness(t);h.alterHtml();const x=await h.run();assert.equal(x.reason,'WEBSITE:EXACT_VISIBLE_HTML_MISMATCH');assert.equal(h.sends,0)});
test('API amount drift with valid snapshot hash blocks email',async t=>{const h=await harness(t);h.alterApi();assert.equal((await h.run()).reason,'WEBSITE:EXACT_API_SNAPSHOT_MISMATCH');assert.equal(h.sends,0)});
test('accepted email response loss retries the identical idempotency key',async t=>{const h=await harness(t);h.loseSend();assert.equal((await h.run()).status,'BLOCKED');assert.equal(h.sends,1);assert.equal((await h.run()).status,'ACCEPTED_NOT_DELIVERED');assert.equal(h.sends,1)});
test('expired idempotency window blocks an ambiguous send',async t=>{const h=await harness(t);h.loseSend();await h.run();h.args.clock=()=>new Date('2026-10-23T14:00:00Z');assert.equal((await h.run()).reason,'SEND_OUTCOME_UNKNOWN_IDEMPOTENCY_WINDOW_EXPIRED');assert.equal(h.sends,1)});
test('review after 10:05 ET cannot fabricate a morning timestamp',async t=>{const h=await harness(t);h.args.clock=()=>new Date('2026-10-22T14:06:00Z');assert.equal((await h.run()).reason,'OUTSIDE_MORNING_DECISION_WINDOW');assert.equal(h.sheets.writes,0)});
test('recipient mismatch and disabled email never invoke Resend',async t=>{const h=await harness(t);h.args.allowedRecipient='different@example.test';assert.equal((await h.run()).reason,'STAGING_RECIPIENT_NOT_ALLOWLISTED');h.args.emailEnabled=false;assert.equal((await h.run()).status,'STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED');assert.equal(h.sends,0)});
test('formula corruption aborts publication and email',async t=>{const h=await harness(t);h.sheets.set('Public Feed',6,1,'100.0%');assert.equal((await h.run()).status,'BLOCKED');assert.equal(h.sheets.writes,0);assert.equal(h.sends,0)});

test('persisted position corruption cannot reuse an otherwise valid public fingerprint',async t=>{
 const h=await harness(t);h.alterApi();await h.run();h.store.rows.get(date).artifact.positions[0].currentPrice=999;
 const writes=h.sheets.writes,result=await h.run();
 assert.equal(result.status,'BLOCKED');assert.equal(result.reason,'STAGING_LEDGER_EXCEPTION');
 assert.equal(h.sheets.writes,writes);assert.equal(h.sends,0);
});
test('ledger exceptions expose only the stage and cannot write or send',async t=>{
 const h=await harness(t);h.args.readRun=async()=>{throw Error('private-provider-secret')};
 const result=await h.run();
 assert.equal(result.status,'BLOCKED');assert.equal(result.reason,'STAGING_LEDGER_EXCEPTION');
 assert.ok(!JSON.stringify(result).includes('private-provider-secret'));
 assert.equal(h.sheets.writes,0);assert.equal(h.sends,0);
});
test('only one competing pipeline can write or send',async t=>{
 const h=await harness(t),out=await Promise.all([h.run(),h.run()]);
 assert.deepEqual(out.map(x=>x.status).sort(),['ACCEPTED_NOT_DELIVERED','BUSY']);assert.equal(h.sends,1);assert.equal(h.sheets.writes,1);
});


const {directReadback}=require('./direct-publication-readback.cjs');
test('cold-start 503 on shadow observer retries only uncached readback, never model or financial writes',async t=>{
 const h=await harness(t),original=h.args.fetcher;let failedRequests=0,requests=0;
 h.args.readback=options=>directReadback({...options,pause:async()=>{}});
 h.args.fetcher=async(url,options)=>{
  if(String(url).includes('/v2/')){
   requests++;
   if(failedRequests<4){failedRequests++;return new Response('Observer starting',{status:503});}
  }
  return original(url,options);
 };
 const result=await h.run();
 assert.equal(result.status,'ACCEPTED_NOT_DELIVERED',JSON.stringify(result));
 assert.equal(failedRequests,4);
 assert.equal(requests,6);
 assert.equal(h.sheets.writes,1);
 assert.equal(h.sends,1);
});
test('repeated observer 503 blocks safely; a later retry replays the exact journal without another financial write',async t=>{
 const h=await harness(t),original=h.args.fetcher;let requests=0;
 h.args.readback=options=>directReadback({...options,pause:async()=>{}});
 h.args.fetcher=async(url,options)=>{
  if(String(url).includes('/v2/')){requests++;return new Response('Observer starting',{status:503})}
  return original(url,options);
 };
 const blocked=await h.run();
 assert.equal(blocked.reason,'WEBSITE:TRANSIENT_READBACK_UNAVAILABLE');
 assert.equal(requests,6);
 assert.equal(h.sheets.writes,1);
 assert.equal(h.sends,0);
 h.args.fetcher=original;
 assert.equal((await h.run()).status,'ACCEPTED_NOT_DELIVERED');
 assert.equal(h.sheets.writes,1);
 assert.equal(h.sends,1);
});
test('client auth errors and semantic API drift are never retried or authorized to email',async t=>{
 const h=await harness(t),original=h.args.fetcher;let requests=0;
 h.args.readback=options=>directReadback({...options,pause:async()=>{}});
 h.args.fetcher=async(url,options)=>{
  if(String(url).includes('/v2/')){
   requests++;
   if(String(url).includes('/v2/model/snapshot'))return new Response('',{status:403});
  }
  return original(url,options);
 };
 const auth=await h.run();
 assert.equal(auth.reason,'WEBSITE:HTTP_ERROR');assert.equal(requests,2);
 assert.equal(h.sends,0);
 h.args.fetcher=async(url,options)=>{if(String(url).includes('/v2/'))requests++;return original(url,options)};
 h.alterApi();
 const stale=await h.run();
 assert.equal(stale.reason,'WEBSITE:EXACT_API_SNAPSHOT_MISMATCH');
 assert.equal(requests,4);
 assert.equal(h.sheets.writes,1);
 assert.equal(h.sends,0);
});
