'use strict';
// Read-only bounded research probe. No portfolio, trading, Google or email writes.
// Yahoo 1-minute retention is limited; on missing data emit explicit unverified status.
const fs=require('node:fs');
const start=Math.floor(Date.parse('2026-10-12T13:30:00-04:00')/1000);
const end=Math.floor(Date.parse('2026-10-12T14:00:00-04:00')/1000);
const cutoff=Date.parse('2026-10-12T13:48:00-04:00');
async function probe(fetchImpl=fetch){
 const u=new URL('https://query1.finance.yahoo.com/v8/finance/chart/PLTR');
 Object.entries({period1:String(start),period2:String(end),interval:'1m',includePrePost:'false'}).forEach(([k,v])=>u.searchParams.set(k,v));
 const report={ticker:'PLTR',session:'2026-10-12',cutoffET:'13:48',status:'UNVERIFIED',source:'Yahoo chart v8 1m',checkedAt:new Date().toISOString()};
 try{
 const r=await fetchImpl(u,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('HTTP '+r.status);
 const j=await r.json(),x=j.chart?.result?.[0],q=x?.indicators?.quote?.[0];
 if(!x||!Array.isArray(x.timestamp)||!q)throw Error('No intraday bars');
 const bars=x.timestamp.map((s,i)=>({time:new Date(s*1000).toISOString(),open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:q.volume?.[i]})).filter(b=>Number.isFinite(b.close)&&b.close>0&&Date.parse(b.time)>=start*1000&&Date.parse(b.time)<end*1000);
 if(!bars.length)throw Error('No valid intraday bars');
 const eligible=bars.filter(b=>Date.parse(b.time)<cutoff);
 if(!eligible.length)throw Error('No bar timestamped before cutoff (fully completed 1m bar)');
 const last=eligible.at(-1);report.status='PRE_CUTOFF_ONE_MINUTE_BAR_AVAILABLE';report.lastBar=last;report.minuteBarCount=bars.length;
 report.warning='One-minute bar timestamp denotes bar start; 13:48 bar is excluded as incomplete at 13:48 cutoff. Historical vendor evidence is not original broker execution proof.';
 }catch(e){report.reason=String(e.message).slice(0,240)}
 return report;
}
if(require.main===module)probe().then(x=>{fs.mkdirSync('engine-v2/out',{recursive:true});fs.writeFileSync('engine-v2/out/pltr-oct12-minute-probe.json',JSON.stringify(x,null,2));console.log(JSON.stringify({status:x.status,reason:x.reason||null,lastBar:x.lastBar||null}));}).catch(e=>{console.error(e);process.exitCode=1});
module.exports={probe};
