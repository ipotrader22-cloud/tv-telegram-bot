'use strict';
const {createHash}=require('node:crypto');
const {parseV2Universe}=require('./research-universe.cjs');
const {analyze}=require('../scripts/swing-daily-research-inputs');
const {collectNewsCoverage}=require('./news-evidence-collector.cjs');
const {createAutonomousResearchProvider}=require('./autonomous-research-provider.cjs');
const {createYahooMinuteProvider}=require('./yahoo-minute-fallback.cjs');
const {createTargetWindowProvider}=require('./target-window-provider.cjs');
const {createGoogleChartSource}=require('./google-finance-chart-source.cjs');
const {SECTOR_BENCHMARKS}=require('./index-universe.cjs');
function createResearchRuntime({universeCsv,sectorByTicker,fetchFn=fetch,clock=()=>new Date(),completedSessionOnly=false,sourcePolicy='YAHOO'}={}){
 if(!['YAHOO','GOOGLE'].includes(sourcePolicy))throw Error('RESEARCH_PROVIDER_POLICY_INVALID');
 const configured=parseV2Universe(universeCsv),allCandidates=configured.candidates;
 sectorByTicker=configured.sectorByTicker||sectorByTicker;
 if(allCandidates.some(t=>!SECTOR_BENCHMARKS.includes(sectorByTicker?.[t])))throw Error('RESEARCH_SECTOR_MAPPING_INCOMPLETE');
 const benchmarks=[...new Set([...configured.benchmarks,...allCandidates.map(t=>sectorByTicker[t])])];
 const symbols=[...allCandidates,...benchmarks];
 return async function prepareProviders({date}){
  const data=[],companies=[],exclusions=[];
  let candidates=[...allCandidates];
  if(sourcePolicy==='GOOGLE'){
   // Each 4-symbol response is certified then discarded before the next is
   // admitted. Preserve manifest order even when bounded requests complete
   // out of order. The raw per-candle source hashes still attest full history.
   const chunks=[];
   await createGoogleChartSource({fetchFn,concurrency:configured.membership?4:1,
    allowShortHistory:!!configured.membership,allowUnavailable:!!configured.membership})
    .getDailyMany({tickers:symbols,date,onBatch:(sourced,index)=>{
     const groupData=[],groupExclusions=[];
     for(const item of sourced){
      if(item.unavailable){
       if(!allCandidates.includes(item.ticker))throw Error('RESEARCH_BENCHMARK_UNAVAILABLE');
       groupExclusions.push({ticker:item.ticker,reason:'PROVIDER_SYMBOL_UNAVAILABLE',
        source:item.source,rawHash:item.rawHash,exchange:item.exchange,checkedAt:clock().toISOString()});
       continue;
      }
      if(configured.membership&&allCandidates.includes(item.ticker)&&item.chart.timestamp.length<200){
       groupExclusions.push({ticker:item.ticker,reason:'INSUFFICIENT_200_COMPLETED_BARS',
        completedDailyBars:item.chart.timestamp.length,source:item.source,rawHash:item.rawHash,
        exchange:item.exchange,companyName:item.companyName,
        lastCompleteDate:require('../scripts/swing-market-calendar').previousSession(date)});
       continue;
      }
      const scored=analyze(item.chart,date,{completedSessionOnly});
      groupData.push({source:item.source,exchange:item.exchange,companyName:item.companyName,
       rawHash:item.rawHash,...scored,
       // The nine-factor model and opening/target checks need at most 200
       // completed daily bars. Earlier bars remain attested by rawHash.
       ...(configured.membership?{bars:scored.bars.slice(-200)}:{})});
     }
     chunks[index]={data:groupData,exclusions:groupExclusions};
    }});
   for(const group of chunks){data.push(...group.data);exclusions.push(...group.exclusions);}
   candidates=candidates.filter(t=>!exclusions.some(e=>e.ticker===t));
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
  const artifact={gate:'RESEARCH_INPUTS',result:'PASS',mode:'CLEAN_EPOCH',date,candidates,data,collectedAt:clock().toISOString(),
   ...(configured.membership?{benchmarks,universeCoverage:{membership:configured.membership,
    requested:allCandidates,reviewed:candidates,exclusions}}:{})};
  const at=clock().toISOString();
  const news=await collectNewsCoverage({companies,date,runAt:at,at,fetchFn,concurrency:configured.membership?6:1});
  if(!news.complete)throw Error('NEWS_COVERAGE_FAILED');
  const researchProvider=createAutonomousResearchProvider({universeCsv:candidates.join(','),sectorByTicker,artifactProvider:{getArtifact:async()=>artifact},newsProvider:{collect:async()=>news}});
  const quotes=sourcePolicy==='GOOGLE'?null:createYahooMinuteProvider({fetchFn});
  return {researchProvider,collection:{artifact,news},quoteProvider:quotes,openProvider:quotes,
   targetProvider:sourcePolicy==='GOOGLE'?null:createTargetWindowProvider({fetchFn})};
 };
}
module.exports={createResearchRuntime};
