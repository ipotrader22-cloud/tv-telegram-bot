'use strict';
// Replacement input collector for the research trial: read canonical Sheet universe,
// not the public website (which may return 502). No financial writes.
const fs=require('node:fs'),crypto=require('node:crypto');
const {readSnapshot}=require('./vixale-live-research-snapshot');
const {analyze}=require('./swing-daily-research-inputs');
const {session}=require('./swing-market-calendar');
const dateNY=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',
 month:'2-digit',day:'2-digit'}).format(new Date());
const baseHosts=['query1.finance.yahoo.com','query2.finance.yahoo.com'];
function wait(t){return new Promise(resolve=>setTimeout(resolve,t));}
async function fetchSymbol(ticker,date,request=fetch){
 const errors=[];
 for(const host of baseHosts){
  for(let n=0;n<2;n++){
   try{
    const url='https://'+host+'/v8/finance/chart/'+encodeURIComponent(ticker)+'?range=1y&interval=1d';
    const response=await request(url,{headers:{'User-Agent':'VixaleResearch/1.0','Cache-Control':'no-cache'},
      signal:AbortSignal.timeout(18000)});
    if(!response.ok){
      errors.push(host+':HTTP_'+response.status);
      if(response.status!==429 && response.status<500)break;
    }else{
      const obj=await response.json();
      const raw=obj?.chart?.result?.[0];
      const analyzed=analyze(raw,date);
      return {source:url,...analyzed};
    }
   }catch(e){errors.push(host+':'+(e.name==='TimeoutError'?'TIMEOUT':'SOURCE_UNAVAILABLE'));}
   if(n===0)await wait(1200);
  }
 }
 throw Error('OHLCV '+ticker+' unavailable: '+errors.join(','));
}
async function collect({credentials,date=dateNY(),request=fetch}){
 if(!session(date).open)throw Error('NYSE closed');
 const snapshot=await readSnapshot({credentials});
 const tickers=[...new Set([...snapshot.openPositions.map(x=>x.ticker),
  ...snapshot.candidates.map(x=>x.ticker),'SPY','QQQ','SMH','XLK','XLE'])];
 if(tickers.length>50||tickers.some(x=>!/^[-A-Z0-9.]{1,15}$/.test(x)))throw Error('Invalid live Sheet research universe');
 const data=[],errors=[];
 for(let i=0;i<tickers.length;i+=4){
  const chunk=await Promise.allSettled(tickers.slice(i,i+4).map(t=>fetchSymbol(t,date,request)));
  chunk.forEach((x,j)=>{if(x.status==='fulfilled')data.push(x.value);
    else errors.push({ticker:tickers[i+j],reason:x.reason.message});});
 }
 if(errors.length)throw Error('Missing verified OHLCV: '+JSON.stringify(errors));
 const result={gate:'RESEARCH_INPUTS',result:'PASS',date,
  collectedAt:new Date().toISOString(),membershipSnapshotDate:snapshot.publicSnapshotDate,
  membershipSource:'Google Sheets read-only',data};
 return {result,snapshot};
}
async function main(){
 const credentials=JSON.parse(process.env.VIXALE_GOOGLE_SERVICE_ACCOUNT_JSON||'null');
 if(!credentials)throw Error('Google service account missing');
 const {result}=await collect({credentials});
 fs.writeFileSync('swing-research-inputs.json',JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({gate:'RESEARCH_INPUTS',result:'PASS',date:result.date,
  symbols:result.data.map(x=>x.metrics.symbol),
  sha256:crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')}));
}
module.exports={fetchSymbol,collect};
if(require.main===module)main().catch(e=>{console.error('OHLCV BLOCKED: '+e.message);process.exitCode=1});
