'use strict';
const {createHash}=require('node:crypto');
const {parseV2Universe}=require('./research-universe.cjs');
const {analyze}=require('../scripts/swing-daily-research-inputs');
const {collectNewsCoverage}=require('./news-evidence-collector.cjs');
const {createAutonomousResearchProvider}=require('./autonomous-research-provider.cjs');
const {createYahooMinuteProvider}=require('./yahoo-minute-fallback.cjs');
const {createTargetWindowProvider}=require('./target-window-provider.cjs');
const {createGoogleChartSource}=require('./google-finance-chart-source.cjs');
function createResearchRuntime({universeCsv,sectorByTicker,fetchFn=fetch,clock=()=>new Date(),completedSessionOnly=false,sourcePolicy='YAHOO'}={}){
 if(!['YAHOO','GOOGLE'].includes(sourcePolicy))throw Error('RESEARCH_PROVIDER_POLICY_INVALID');
 const {candidates,symbols}=parseV2Universe(universeCsv);
 if(candidates.some(t=>!['SMH','XLK','XLE'].includes(sectorByTicker?.[t])))throw Error('RESEARCH_SECTOR_MAPPING_INCOMPLETE');
 return async function prepareProviders({date}){
  const data=[],companies=[];
  if(sourcePolicy==='GOOGLE'){
   const sourced=await createGoogleChartSource({fetchFn}).getDailyMany({tickers:symbols,date});
   for(const item of sourced){
    const scored=analyze(item.chart,date,{completedSessionOnly});
    data.push({source:item.source,exchange:item.exchange,companyName:item.companyName,
     rawHash:item.rawHash,...scored});
   }
  }else for(let i=0;i<symbols.length;i+=4){
   const batch=await Promise.all(symbols.slice(i,i+4).map(async ticker=>{
    const source='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?range=1y&interval=1d';
    const r=await fetchFn(source,{headers:{'Cache-Control':'no-cache','User-Agent':'VixaleResearch/2.0'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('RESEARCH_OHLCV_HTTP_'+r.status);
    const raw=await r.json(),chart=raw.chart?.result?.[0];
    if(chart?.meta?.symbol!==ticker)throw Error('RESEARCH_SYMBOL_MISMATCH');
    const exchange=({NMS:'NASDAQ',NGM:'NASDAQ',NCM:'NASDAQ',NAS:'NASDAQ',NYQ:'NYSE',ASE:'AMEX',PCX:'AMEX'})[chart.meta.exchangeName];
    if(candidates.includes(ticker)&&(!exchange||!(chart.meta.longName||chart.meta.shortName)))throw Error('COMPANY_IDENTITY_UNVERIFIED');
    return {source,exchange,companyName:chart.meta.longName||chart.meta.shortName,rawHash:createHash('sha256').update(JSON.stringify(raw)).digest('hex'),...analyze(chart,date,{completedSessionOnly})};
   }));data.push(...batch);
  }
  for(const ticker of candidates)companies.push({ticker,name:data.find(x=>x.metrics.symbol===ticker).companyName});
  const artifact={gate:'RESEARCH_INPUTS',result:'PASS',mode:'CLEAN_EPOCH',date,candidates,data,collectedAt:clock().toISOString()};
  const at=clock().toISOString();
  const news=await collectNewsCoverage({companies,date,runAt:at,at,fetchFn});
  if(!news.complete)throw Error('NEWS_COVERAGE_FAILED');
  const researchProvider=createAutonomousResearchProvider({universeCsv,sectorByTicker,artifactProvider:{getArtifact:async()=>artifact},newsProvider:{collect:async()=>news}});
  const quotes=sourcePolicy==='GOOGLE'?null:createYahooMinuteProvider({fetchFn});
  return {researchProvider,quoteProvider:quotes,openProvider:quotes,
   targetProvider:sourcePolicy==='GOOGLE'?null:createTargetWindowProvider({fetchFn})};
 };
}
module.exports={createResearchRuntime};
