'use strict';
// Explicit Engine2 deterministic factor policy, not discretionary predictions.
// Every point has a measurable source rule. News coverage without verified
// substantive catalyst content yields ZERO catalyst points rather than a guess.
// Sector mapping is required; missing/partial benchmark or volume data BLOCKS.
const {normalizeDailyEvidence}=require('./daily-research-bridge.cjs');
const {CAPS,score}=require('./core.cjs');
const {createHash}=require('node:crypto');
const BENCHMARKS=['SPY','QQQ','SMH','XLK','XLE'];
const good=x=>typeof x==='number'&&Number.isFinite(x);
function autoAssess({artifact,date,runAt,universe,sectorByTicker,newsReview}={}){
 const bad=(reason,errors=[])=>({status:'BLOCKED',reason,errors,complete:false});
 const evidence=normalizeDailyEvidence({artifact,universe,reviewDate:date});
 if(evidence.status!=='METRICS_READY_SCORING_PENDING')return bad('OHLCV_NOT_READY',evidence.errors);
 if(!newsReview||newsReview.status!=='COVERAGE_COMPLETE_SCORING_PENDING'||
    !newsReview.complete||newsReview.date!==date||!newsReview.sourceId||
    newsReview.tickers?.length!==universe.length||universe.some(t=>!newsReview.tickers.includes(t)))
   return bad('INCOMPLETE_NEWS_COVERAGE');
 const bench=Object.fromEntries(artifact.data.filter(x=>BENCHMARKS.includes(x.metrics?.symbol))
  .map(x=>[x.metrics.symbol,{...x.metrics,sourceId:x.source}]));
 if(!bench.SPY||!bench.QQQ)return bad('MARKET_BENCHMARKS_MISSING');
 const errors=[],assessments=[];
 const a=bench.SPY,b=bench.QQQ;
 const add=(list,points,condition,explanation,sourceId)=>{
  if(condition)list.push({points,explanation,sourceId});
 };
 for(const raw of evidence.items){
  const ticker=raw.ticker,sectorTicker=sectorByTicker?.[ticker],sec=bench[sectorTicker];
  if(!sec||!['XLK','SMH','XLE'].includes(sectorTicker)){errors.push('SECTOR_BENCHMARK_UNMAPPED:'+ticker);continue}
  if([raw.lastCompletedClose,raw.range5Pct,raw.upDownVolume20,raw.volumeRvol,
    a.lastCompleteClose,a.sma50,a.return20Pct,a.return60Pct,b.lastCompleteClose,b.sma50,b.return20Pct,
    sec.lastCompleteClose,sec.sma50,sec.return20Pct,sec.return60Pct].some(x=>!good(x))||
    raw.lastCompletedClose<=0||raw.ma20<=0||raw.ma50<=0||raw.ma200<=0||raw.range20Pct<=0||
    raw.range5Pct<0||raw.volumeRvol<=0||raw.upDownVolume20<=0){
    errors.push('MEASURABLE_FACTOR_INPUT_MISSING:'+ticker);continue
  }
  const mark=raw.lastCompletedClose,factors={},factorProof={};
  const rules={
   market:[
    [4,a.lastCompleteClose>a.sma50,'SPY prior close above its 50-day average',a.sourceId],
    [3,b.lastCompleteClose>b.sma50,'QQQ prior close above its 50-day average',b.sourceId],
    [2,a.return20Pct>=0,'SPY trailing 20-day return nonnegative',a.sourceId],
    [1,b.return20Pct>=0,'QQQ trailing 20-day return nonnegative',b.sourceId]],
   sector:[
    [5,sec.lastCompleteClose>sec.sma50,sectorTicker+' prior close above its 50-day average',sec.sourceId],
    [5,sec.return20Pct>a.return20Pct,sectorTicker+' 20-day return outperforms SPY',sec.sourceId],
    [5,sec.return60Pct>a.return60Pct,sectorTicker+' 60-day return outperforms SPY',sec.sourceId]],
   leadership:[
    [5,raw.return20Pct>a.return20Pct,'Stock 20-day return outperforms SPY',raw.sourceHash],
    [4,raw.return20Pct>sec.return20Pct,'Stock 20-day return outperforms sector',raw.sourceHash],
    [4,raw.return60Pct>a.return60Pct,'Stock 60-day return outperforms SPY',raw.sourceHash],
    [2,raw.return60Pct>sec.return60Pct,'Stock 60-day return outperforms sector',raw.sourceHash]],
   catalyst:[],
   base:[
    [5,mark>raw.ma20,'Completed-session close above 20-day average',raw.sourceHash],
    [5,mark>raw.ma50,'Completed-session close above 50-day average',raw.sourceHash],
    [5,mark>=raw.high60*.85,'Completed-session close within 15% of 60-day high',raw.sourceHash]],
   compression:[
    [5,raw.range5Pct<=raw.range20Pct*.65,'Five-session range at most 65% of 20-session range',raw.sourceHash],
    [5,raw.range20Pct<=25,'20-session high-low range at most 25% of completed close',raw.sourceHash]],
   volume:[
    [5,raw.volumeRvol>=1,'Completed previous-session relative volume at least 1.0',raw.sourceHash],
    [5,raw.upDownVolume20>=1.5,'20-session rising-versus-falling exchange-volume proxy at least 1.5',raw.sourceHash],
    [5,raw.volumeRvol>=1.2,'Completed previous-session relative volume at least 1.2',raw.sourceHash]],
   ma:[
    [2,mark>raw.ma200,'Completed close above 200-day average',raw.sourceHash],
    [2,mark>raw.ma50,'Completed close above 50-day average',raw.sourceHash],
    [1,mark>raw.ma20,'Completed close above 20-day average',raw.sourceHash]],
   resistance:[
    [3,mark>=raw.high20*.96,'Completed close within 4% of 20-session high',raw.sourceHash],
    [2,mark<=raw.high20*1.01,'Completed close no more than 1% above the 20-session high',raw.sourceHash]]
  };
  for(const [factor,criterion] of Object.entries(rules)){
   const fired=criterion.filter(x=>x[1]);
   const value=fired.reduce((n,x)=>n+x[0],0);
   if(value>CAPS[factor])throw Error('SCORE_CAP_BROKEN');
   factors[factor]=value;
   const specific=fired.map(x=>x[2]).join('; ');
   factorProof[factor]={points:value,sourceId:factor==='catalyst'?newsReview.sourceId:
     'ENGINE2_DETERMINISTIC_'+factor+':'+createHash('sha256').update(ticker+date+factor+JSON.stringify(criterion)).digest('hex'),
    checkedAt:runAt,
    explanation:factor==='catalyst'?
     'No independent substantive catalyst verification: conservatively zero points despite completed headline collection.':
     (specific||'Required source observations checked; no positive subcriterion passed.')};
  }
  const total=score(factors);
  const entryEligible=total>=80&&mark>=raw.high20*.97&&mark>raw.ma20&&raw.volumeRvol>=1;
  const entryEvidenceId=entryEligible?'ENGINE2_ENTRY:'+raw.sourceHash:null;
  assessments.push({ticker,reviewDate:date,reviewTime:runAt,complete:true,
   factors:factorProof,score:total,entryEligible,entryEvidenceId,
   publicNote:date+' '+ticker+' nine-factor quantitative review scored '+total+'.'});
 }
 if(errors.length)return bad('INSUFFICIENT_DETERMINISTIC_FACTOR_SOURCES',errors);
 return {status:'DETERMINISTIC_NINE_FACTOR_ASSESSMENTS',complete:true,policyVersion:'ENGINE2_RULES_2026_10_22',
  assumptions:['Catalyst points always zero until independently vetted material-event evidence exists.','Entry model technical setup requires score >=80 and near-high confirmation.'],
  assessments};
}
module.exports={autoAssess};
