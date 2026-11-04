'use strict';
// One-time research of 23-day historical Google Finance 1m retention.
// Never persists OHLCV or passes data to the financial engine.
const {unpack,flatten}=require('./google-finance-minute-audit.cjs');
async function probe({fetcher=fetch}={}){
 const requested='2026-10-12';
 const entities=[[null,['CVX','NYSE']],[null,['XOM','NYSE']]];
 const args=[entities,null,[[2026,10,12],[2026,10,12],1],null,null,null,null,1];
 const form=new URLSearchParams({'f.req':JSON.stringify([[['c2u4wc',JSON.stringify(args),null,'1']]])});
 const url='https://www.google.com/finance/beta/_/FinHubUi/data/batchexecute?rpcids=c2u4wc&hl=en&gl=US';
 try{
  const resp=await fetcher(url,{method:'POST',
   headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8',
    origin:'https://www.google.com',referer:'https://www.google.com/finance/beta','x-same-domain':'1'},
   body:form,signal:AbortSignal.timeout(18000)});
  if(!resp.ok)return {status:'BLOCKED',reason:resp.status===403||resp.status===429?
   'GOOGLE_ACCESS_RESTRICTED':'SOURCE_HTTP_UNAVAILABLE',date:requested,writesPerformed:false};
  const series=flatten(unpack(await resp.text()));
  const checks=['CVX:NYSE','XOM:NYSE'].map(symbol=>{
   const s=series.find(x=>x.symbol===symbol);
   const num=(s?.candles||[]).filter(c=>typeof c?.time==='string'&&c.time.slice(0,10)===requested).length;
   return {symbol,requestedDate:requested,intervalSeconds:s?.seconds??null,barCount:num,
    expected:390,status:s?.seconds===60&&num===390?'PASS':'BLOCKED'};
  });
  return {status:checks.every(x=>x.status==='PASS')?'PASS':'BLOCKED',
   date:requested,checks,writesPerformed:false,rawPricesLogged:false,rawPricesStored:false};
 }catch{return {status:'BLOCKED',reason:'SOURCE_TRANSPORT_OR_PARSER_FAILED',date:requested,writesPerformed:false}}
}
if(require.main===module)probe().then(r=>{console.log('GOOGLE_MINUTE_RETENTION',JSON.stringify(r))})
 .catch(()=>{console.log('GOOGLE_MINUTE_RETENTION',JSON.stringify({status:'BLOCKED',reason:'INTERNAL_ERROR'}))});
module.exports={probe};