'use strict';
// Isolated research probe. Never commits market data or trades.
const {unpack,flatten}=require('./google-finance-minute-audit.cjs');
const symbols=['AMD:NASDAQ','NVDA:NASDAQ','XOM:NYSE','CVX:NYSE','SPY:NYSEARCA','QQQ:NASDAQ','SMH:NASDAQ','XLK:NYSEARCA'];
function etDate(t){const d=new Date(t);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):null}
async function run(fetchFn=fetch){
 const result=[];
 for(let i=0;i<symbols.length;i+=4){
  const chunk=symbols.slice(i,i+4),entities=chunk.map(s=>{const [t,e]=s.split(':');return [null,[t,e]]});
  const args=[entities,null,[[2025,9,1],[2026,11,3],6],null,null,null,null,1];
  const body=new URLSearchParams({'f.req':JSON.stringify([[['c2u4wc',JSON.stringify(args),null,'1']]])});
  const url='https://www.google.com/finance/beta/_/FinHubUi/data/batchexecute?rpcids=c2u4wc&hl=en&gl=US';
  let chart;
  try{
   const r=await fetchFn(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8',origin:'https://www.google.com',referer:'https://www.google.com/finance/beta','x-same-domain':'1'},body,signal:AbortSignal.timeout(18000)});
   if(!r.ok){result.push(...chunk.map(symbol=>({symbol,status:'BLOCKED',reason:'HTTP_'+(r.status===429?'RATE_LIMIT':r.status)})));continue}
   chart=flatten(unpack(await r.text()));
  }catch{result.push(...chunk.map(symbol=>({symbol,status:'BLOCKED',reason:'RESEARCH_SOURCE_UNAVAILABLE'})));continue}
  for(const symbol of chunk){
   const rows=chart.find(c=>c.symbol===symbol);
   if(!rows){result.push({symbol,status:'BLOCKED',reason:'SYMBOL_MISSING'});continue}
   const dates=(rows.candles||[]).map(x=>etDate(x.time)),seen=new Set(dates);
   const invalid=(rows.candles||[]).filter(x=>![x.open,x.high,x.low,x.close,x.volume].every(v=>typeof v==='number'&&Number.isFinite(v))||x.close<=0||x.volume<0).length;
   const last=dates.at(-1),first=dates[0],enough=rows.seconds===86400&&dates.length>=200&&seen.size===dates.length&&invalid===0&&last==='2026-11-03';
   result.push({symbol,status:enough?'PASS':'BLOCKED',count:dates.length,intervalSeconds:rows.seconds,
    uniqueDates:seen.size,invalid,firstDate:first,lastDate:last,requestedThrough:'2026-11-03'});
  }
 }
 return {status:result.every(r=>r.status==='PASS')?'PASS':'BLOCKED',source:'GOOGLE_FINANCE_DAILY',checks:result,readOnly:true,writesPerformed:false};
}
if(require.main===module)run().then(x=>console.log('GOOGLE_DAILY_RESEARCH',JSON.stringify(x))).catch(()=>console.log('GOOGLE_DAILY_RESEARCH',JSON.stringify({status:'BLOCKED',reason:'PROBE_FAILED'})));
module.exports={run};
