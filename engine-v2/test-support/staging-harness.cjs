'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const {runStagingPipeline}=require('../staging-pipeline.cjs');
const {renderShadowSwing}=require('../shadow-swing-page.cjs');
const {date,runAt,providers,memoryLedger,memoryStore,fakeSheets}=require('./staging-fixture.cjs');
async function harness(t,{store=memoryStore(),ledger=memoryLedger()}={}){
 const sheets=fakeSheets();let sends=0,delivered=false,alterHtml=false,alterApi=false,loseSend=false;const messages=new Map();
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');const feed=await store.publishedFeed();
  if(req.url.startsWith('/v2/model/snapshot')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(alterApi?{...feed,current_model_equity:42}:feed))}
  else if(req.url.startsWith('/v2/swing-trading')){res.setHeader('Content-Type','text/html');const html=renderShadowSwing(feed);res.end(alterHtml?html.replace('$112.00','$999.00'):html)}
  else{res.writeHead(404);res.end()}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const fetcher=async(url,opts)=>{
  if(String(url).startsWith('https://api.resend.com/')){
   if(opts.method==='POST'){
    const key=opts.headers['Idempotency-Key'];if(!messages.has(key)){sends++;messages.set(key,{id:'test-message',...JSON.parse(opts.body)})}
    if(loseSend){loseSend=false;throw Error('SIMULATED_ACCEPTED_REPLY_LOSS')}
    return new Response(JSON.stringify({id:'test-message'}));
   }
   return new Response(JSON.stringify({...messages.values().next().value,cc:[],bcc:[],last_event:delivered?'delivered':'sent'}));
  }
  const u=new URL(url);assert.ok(u.searchParams.has('engine2_readback'));return fetch('http://127.0.0.1:'+server.address().port+u.pathname+u.search,opts);
 };
 const args={store,url:'postgres://localhost/vixale_engine_v2_shadow_20261016',api:sheets.api,date,clock:()=>new Date(runAt),prepareProviders:async()=>providers(),...ledger,fetcher,enabled:true,emailEnabled:true,recipient:'owner@example.test',allowedRecipient:'owner@example.test',apiKey:'re_test_only'};
 return {args,sheets,store,get sends(){return sends},deliver(){delivered=true},alterHtml(){alterHtml=true},alterApi(){alterApi=true},loseSend(){loseSend=true},run:()=>runStagingPipeline(args)};
}
module.exports={harness};
