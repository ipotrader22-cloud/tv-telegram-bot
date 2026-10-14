'use strict';
// Broad US equity MARKET recap, NOT company press-release reporting.
// Dated primary-source observations, original bilingual commentary, no broker APIs or portfolio writes.
const {collectMarket}=require('./vixale-broad-market-fred');
const {validateSkim}=require('../lib/daily-market-skim-contract');
const {isBroadMarket}=require('../lib/daily-skim-market-focus');
function dayNY(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function timestampNY(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZoneName:'shortOffset'}).formatToParts(now).map(p=>[p.type,p.value]));
 const hh=parts.hour==='24'?'00':parts.hour,offset=parts.timeZoneName==='GMT-4'?'-04:00':parts.timeZoneName==='GMT-5'?'-05:00':null;
 if(!offset)throw Error('Invalid NY offset');return dayNY(now)+'T'+hh+':'+parts.minute+':'+parts.second+offset;
}
function offsetAt(date){
 const dt=new Date(date+'T16:00:00Z');
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(dt).find(p=>p.type==='timeZoneName')?.value==='GMT-4'?'-04:00':'-05:00';
}
function createBrief(data,{dateET,reviewedAtET}){
 const {sp500,nasdaq,vix,treasury10y}=data;
 if(![sp500,nasdaq,vix,treasury10y].every(Boolean)||sp500.date!==nasdaq.date||sp500.date!==vix.date)
   throw Error('MARKET PENDING: index observation dates must match');
 const sign=x=>x>0?'rose':x<0?'fell':'was flat';
 const ru=x=>x>0?'вырос':x<0?'снизился':'не изменился';
 const pct=x=>Math.abs(x).toFixed(2)+'%';
 const environment=sp500.changePct>=0&&nasdaq.changePct>=0?'constructive':sp500.changePct<0&&nasdaq.changePct<0?'defensive':'mixed';
 const vixChange=vix.changePct>0?'increased':vix.changePct<0?'declined':'was little changed';
 const vixRu=vix.changePct>0?'вырос':vix.changePct<0?'снизился':'почти не изменился';
 const result={
  dateET,reviewedAtET,universeDate:dateET,provenance:'independent-public-sources',scope:'broad-us-equities',stance:environment,
  summaryEn:'At the '+sp500.date+' US market close, the S&P 500 '+sign(sp500.changePct)+' '+pct(sp500.changePct)+
    ' and the Nasdaq Composite '+sign(nasdaq.changePct)+' '+pct(nasdaq.changePct)+'. The VIX '+vixChange+
    ' versus its preceding close. The latest available 10-year US Treasury yield observation is dated '+treasury10y.date+
    '. These are dated closing observations, not live intraday prices or a completed portfolio review.',
  summaryRu:'По итогам торгов '+sp500.date+' индекс S&P 500 '+ru(sp500.changePct)+' на '+pct(sp500.changePct)+
    ', а Nasdaq Composite '+ru(nasdaq.changePct)+' на '+pct(nasdaq.changePct)+'. Индекс волатильности VIX '+vixRu+
    ' относительно предыдущего закрытия. Последнее доступное наблюдение доходности 10-летних казначейских облигаций США датировано '+treasury10y.date+
    '. Это данные закрытия, а не текущие внутридневные котировки или завершённый обзор портфеля.',
  sources:[{url:sp500.sourceUrl,issuedDate:sp500.date,issuer:'Federal Reserve Bank of St. Louis (FRED)'},
    {url:nasdaq.sourceUrl,issuedDate:nasdaq.date,issuer:'Federal Reserve Bank of St. Louis (FRED)'}],
  marketIndicators:{indices:{
    sp500:{...metric(sp500)},nasdaq:{...metric(nasdaq)}},
    volatility:{vix:{...metric(vix)}},rates:{treasury10y:{...metric(treasury10y)}}}
 };
 if(!isBroadMarket(result))throw Error('MARKET PENDING: Broad-market editorial gate');
 return validateSkim(result,{todayET:dateET}).data;
}
function metric(m){return {level:m.level,changePct:m.changePct,asOfET:m.date+'T16:00:00'+offsetAt(m.date),sourceUrl:m.sourceUrl};}
async function collect({now=new Date(),fetcher=collectMarket}={}){
 const dateET=dayNY(now),snapshot=await fetcher({reviewDate:dateET});
 return createBrief(snapshot.data,{dateET,reviewedAtET:timestampNY(now)});
}
if(require.main===module)collect().then(v=>process.stdout.write(JSON.stringify(v)+'\n'))
 .catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={dayNY,timestampNY,createBrief,collect};
