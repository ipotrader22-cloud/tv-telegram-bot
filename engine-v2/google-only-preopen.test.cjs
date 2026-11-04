'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preparePreopen}=require('./preopen-preparation.cjs');
const {etTime,validatePrepared}=require('./delayed-model-policy.cjs');
const {previousSession}=require('../scripts/swing-market-calendar');
const date='2026-11-04',sourceSession=previousSession(date),at=etTime(date,420);
const exch={CVX:'NYSE',XOM:'NYSE',SPY:'NYSEARCA',QQQ:'NASDAQ',
 SMH:'NASDAQ',XLK:'NYSEARCA',XLE:'NYSEARCA'};
const dayDates=()=>{
 // Research input fixture intentionally spans 2025; the operational NYSE
 // session calendar covers 2026 onward. Generate historical weekdays without
 // pretending these are independent holiday-certified sessions.
 let d=new Date(sourceSession+'T12:00:00Z'),days=[];
 while(days.length<220){
  if(d.getUTCDay()!==0&&d.getUTCDay()!==6)days.unshift(d.toISOString().slice(0,10));
  d=new Date(+d-86400000);
 }
 return days;
};
function fake({badMinute=false}={}){
 const calls={googleDaily:0,googleMinute:0,news:0,yahoo:0};
 const daily=dayDates();
 const fetchFn=async (url,opt)=>{
  const u=new URL(url);
  if(u.hostname==='news.google.com'){
   calls.news++;return {ok:true,text:async()=>'<rss><channel></channel></rss>'};
  }
  if(u.hostname!=='www.google.com'){calls.yahoo++;throw Error('Yahoo must never be requested')}
  const form=new URLSearchParams(opt.body),rpc=JSON.parse(form.get('f.req'))[0][0];
  const req=JSON.parse(rpc[1]),entries=req[0].map(e=>e[1]),interval=req[2][2];
  if(interval===6)calls.googleDaily++;
  else if(interval===1)calls.googleMinute++;
  else throw Error('Unexpected resolution');
  const series=entries.map(([ticker,exchange])=>{
   assert.equal(exchange,exch[ticker]);
   let candles=[];
   if(interval===6){
    candles=daily.map((d,i)=>{const mark=100+i*.1+Math.sin(i)*2;return [mark,mark,mark+1,mark-1,etTime(d,600),1200]});
   }else{
    const start=Date.parse('2026-11-03T15:00:00Z');
    candles=Array.from({length:360},(_,i)=>{
     const t=start+i*60000;
     return [100,100,ticker==='CVX'&&i===30?111:101,99,new Date(t).toISOString(),1200];
    });
    if(badMinute&&ticker==='CVX')candles.splice(70,1);
   }
   return [[ticker,exchange],null,null,[[null,null,candles]],null,null,null,
    ticker+' Corporation',interval===1?60:86400];
  });
  const response=[['wrb.fr','c2u4wc',JSON.stringify([series]),null,null,null,'1']];
  return {status:200,ok:true,text:async()=>")]}'\n"+JSON.stringify(response)};
 };
 const previous={epoch:'2026-10-19',date:'2026-11-03',closed:[],history:[],
  active:['CVX','XOM'].map(ticker=>({ticker,entryDate:'2026-11-03',
   entryTime:'2026-11-03T15:00:00Z',lastTargetCheckedAt:'2026-11-03T15:00:00Z',
   entryPrice:100,exchange:'NYSE'}))};
 const env={VIXALE_V2_STAGING_PRICE_POLICY:'GOOGLE_LATEST_1000_MODEL_V1',
  VIXALE_V2_RESEARCH_UNIVERSE:'CVX,XOM',
  VIXALE_V2_RESEARCH_SECTORS_JSON:JSON.stringify({CVX:'XLE',XOM:'XLE'})};
 return {calls,params:{date,url:'postgresql://localhost/vixale_engine_v2_shadow_20990101',
  clock:()=>new Date(at),getPrior:async()=>previous,env,fetchFn},previous};
}
test('Google-only preopen assembles full nine-factor ranking, exact 09:31 minute TARGET and NO Yahoo',async()=>{
 const f=fake();
 const p=await preparePreopen(f.params);
 assert.equal(p.sourceSession,sourceSession);
 assert.equal(p.batch.items.length,2);
 assert.equal(Object.keys(p.batch.items[0].factors).length,9);
 assert.equal(p.batch.sourceEvidence.artifact.data.length,7);
 assert.ok(p.batch.sourceEvidence.artifact.data.every(x=>x.source==='GOOGLE_FINANCE_CHART_1DAY'));
 assert.equal(f.calls.googleDaily,2);assert.equal(f.calls.googleMinute,2);
 assert.equal(f.calls.yahoo,0);
 assert.equal(p.exits.find(x=>x.ticker==='CVX')?.reason,'TARGET');
 // A low-scoring holding can also be queued for a rating-based exit.
 assert.match(p.exits.find(x=>x.ticker==='CVX').sourceId,/^GOOGLE_CHART_1M:/);
 validatePrepared(p,{date,previous:f.previous,now:at});
});
test('Google-only preopen blocks missing required 09:31–15:59 minute instead of publishing',async()=>{
 const f=fake({badMinute:true});
 await assert.rejects(()=>preparePreopen(f.params),/GOOGLE_MINUTE_COVERAGE_GAP/);
 assert.equal(f.calls.yahoo,0);
});
