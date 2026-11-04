'use strict';
// Disposable research probe. Do NOT use as VIXALE production market-data provider.
// Reads two fixed past sessions; logs aggregate counts only, never candle prices.
const DATE='2026-11-03',NAMES=['CVX:NYSE','XOM:NYSE'];
const ET=s=>{
 const d=new Date(s);
 if(!Number.isFinite(d.getTime()))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
  hourCycle:'h23'}).formatToParts(d).map(v=>[v.type,v.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,minute:+p.hour*60+ +p.minute,second:+p.second};
};
function count(candles,{symbol,date=DATE}={}){
 const seen=new Set();let duplicates=0,invalid=0,otherSession=0;
 if(!Array.isArray(candles))return {symbol,status:'BLOCKED',reason:'CANDLES_NOT_RETURNED',count:0};
 for(const c of candles){
  const t=ET(c?.time);
  if(!t||t.date!==date||t.minute<570||t.minute>=960){otherSession++;continue}
  if(t.second!==0||seen.has(t.minute)){duplicates++;continue}
  seen.add(t.minute);
  const {open,high,low,close,volume}=c;
  const vals=[open,high,low,close,volume];
  if(vals.some(v=>typeof v!=='number'||!Number.isFinite(v))||
    [open,high,low,close].some(v=>v<=0)||volume<=0||
    high<Math.max(open,low,close)||low>Math.min(open,high,close))invalid++;
 }
 const missing=390-seen.size;
 const ok=!missing&&!invalid&&!duplicates;
 return {symbol,date,status:ok?'PASS':'BLOCKED',
  count:seen.size,expected:390,missing,invalid,duplicates,otherSession,
  opening930:seen.has(570),last1559:seen.has(959),
  reason:ok?null:missing?'COVERAGE_GAP':invalid?'OHLCV_INVALID':duplicates?'DUPLICATE_MINUTES':'DATA_INVALID'};
}
function unpack(body){
 let raw=String(body||'').trim();
 if(raw.startsWith(")]}'"))raw=raw.slice(4).trim();
 const candidates=[];try{candidates.push(JSON.parse(raw))}catch{
  for(const l of raw.split('\n'))if(l.trim().startsWith('[['))try{candidates.push(JSON.parse(l))}catch{}
 }
 for(const rows of candidates)for(const row of Array.isArray(rows)?rows:[]){
  if(row?.[0]==='wrb.fr'&&typeof row[2]==='string'){
   try{return JSON.parse(row[2])}catch{}
  }
 }
 throw Error('GOOGLE_RPC_UNREADABLE');
}
function flatten(raw){
 if(!Array.isArray(raw?.[0]))throw Error('NO_CHART_SERIES');
 return raw[0].map(s=>{
  const pair=s?.[0],symbol=Array.isArray(pair)&&pair.length===2?pair[0]+':'+pair[1]:null;
  return {symbol,seconds:s?.[8],candles:(s?.[3]||[]).flatMap(seg=>
   (seg?.[2]||[]).filter(Array.isArray).map(c=>({
    time:c[4],open:c[0],close:c[1],high:c[2],low:c[3],volume:c[5]
   })))};
 });
}
async function fetchBars(fetcher=fetch,rpc='c2u4wc'){
 const entities=NAMES.map(s=>{const [ticker,exchange]=s.split(':');return [null,[ticker,exchange]]});
 const args=[entities,null,[[2026,11,3],[2026,11,3],1],null,null,null,null,1];
 const req=[[[rpc,JSON.stringify(args),null,'1']]];
 const url='https://www.google.com/finance/beta/_/FinHubUi/data/batchexecute?rpcids='+rpc+'&hl=en&gl=US';
 const result=await fetcher(url,{method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8',
   origin:'https://www.google.com',referer:'https://www.google.com/finance/beta','x-same-domain':'1'},
  body:new URLSearchParams({'f.req':JSON.stringify(req)}),signal:AbortSignal.timeout(18000)});
 if(result.status===403||result.status===429)return {status:'BLOCKED',reason:'GOOGLE_ACCESS_RESTRICTED'};
 if(result.status===400)return {status:'BLOCKED',reason:'GOOGLE_RPC_ARGUMENT_REJECTED'};
 if(!result.ok)return {status:'BLOCKED',reason:'GOOGLE_TRANSPORT_HTTP_ERROR'};
 const chart=flatten(unpack(await result.text()));
 return {status:'RECEIVED',chart};
}
async function probe({fetcher=fetch,environment='GITHUB'}={}){
 let r;
 for(const rpc of ['c2u4wc','AiCwsd']){
  try{r=await fetchBars(fetcher,rpc)}
  catch(e){r={status:'BLOCKED',reason:['NO_CHART_SERIES','GOOGLE_RPC_UNREADABLE'].includes(e?.message)?
   e.message:'GOOGLE_NETWORK_OR_PARSER_ERROR'}}
  if(r.status==='RECEIVED'||r.reason!=='GOOGLE_RPC_ARGUMENT_REJECTED')break;
 }
 if(r.status!=='RECEIVED')return {...r,environment,date:DATE,writesPerformed:false};
 const checks=NAMES.map(symbol=>{
  const data=r.chart.find(s=>s.symbol===symbol);
  if(!data)return {symbol,status:'BLOCKED',reason:'SYMBOL_NOT_FOUND'};
  const check=count(data.candles,{symbol});
  return data.seconds===60?check:{...check,status:'BLOCKED',reason:'NOT_ONE_MINUTE'};
 });
 return {status:checks.every(c=>c.status==='PASS')?'PASS':'BLOCKED',
  date:DATE,environment,checks,writesPerformed:false,pricesLogged:false,storedBars:false};
}
if(require.main===module)probe({environment:process.env.VIXALE_PROBE_ORIGIN||'GITHUB'}).then(r=>{
 console.log('VIXALE_GOOGLE_MINUTE_PROBE',JSON.stringify(r));
 if(r.status!=='PASS')process.exitCode=1;
}).catch(()=>{
 console.log('VIXALE_GOOGLE_MINUTE_PROBE',JSON.stringify({status:'BLOCKED',reason:'INTERNAL_PROBE_ERROR'}));process.exitCode=1;
});
module.exports={count,unpack,flatten,probe};