'use strict';
// Research dossiers for canonical historical universe: nonmutating, evidence-first.
const {reference}=require('./historical-oct12-reference.cjs');
const {collectEvidence}=require('./research-collector.cjs');
const {reviewFactors}=require('./catalyst-evidence.cjs');
const {reconcile}=require('./historical-score-reconcile.cjs');
const allowed=new Map(reference.map(x=>[x.ticker,x]));
function buildDossier({recorded,marketEvidence=null,events=[],review=null,errors=[]}){
 const validation=review ? reviewFactors({...review,ticker:recorded.ticker,reviewDate:recorded.reviewDate}) : null;
 const independentlyComplete=validation?.status==='COMPLETE_ANALYST_REVIEW' && marketEvidence?.status==='FACTS_ONLY_REQUIRES_NINE_FACTOR_REVIEW';
 return {ticker:recorded.ticker,reviewDate:recorded.reviewDate,recordedScore:recorded.score,recordedStatus:recorded.status,
  marketEvidence:marketEvidence?{asOf:marketEvidence.asOf,marketTicker:marketEvidence.marketTicker,sectorTicker:marketEvidence.sectorTicker,sources:marketEvidence.sources,facts:marketEvidence.facts}:null,
  companyEvents:events.map(e=>({date:e.publishedDate,url:e.url,sourceType:e.sourceType,verified:e.verified===true,contentSha256:e.contentSha256||null})),
  reviewStatus:independentlyComplete?'COMPLETE_ANALYST_REVIEW':'INDEPENDENT_RESEARCH_INCOMPLETE',
  independentScore:independentlyComplete?validation.score:null,missing:validation?.missing||[],errors};
}
async function batchDossiers({reviewDate='2026-10-12',marketTicker,sectorMap,provider,reviews={},events={},limit=13}){
 if(reviewDate!=='2026-10-12'||!/^[A-Z.-]+$/.test(marketTicker)||!sectorMap||typeof sectorMap!=='object'||!Number.isInteger(limit)||limit<1||limit>13)throw Error('Invalid canonical historical replay configuration');
 const dossiers=[];
 for(const recorded of reference.slice(0,limit)){
  let evidence=null;const errors=[];
  const sector=sectorMap[recorded.ticker];
  if(!sector||!/^[A-Z.-]+$/.test(sector)){errors.push('SECTOR_BENCHMARK_NOT_CONFIGURED')}
  else{try{evidence=await collectEvidence({ticker:recorded.ticker,marketTicker,sectorTicker:sector,reviewDate,provider})}catch(e){errors.push('MARKET_EVIDENCE_UNAVAILABLE: '+e.message)}}
  dossiers.push(buildDossier({recorded,marketEvidence:evidence,events:events[recorded.ticker]||[],review:reviews[recorded.ticker]||null,errors}));
 }
 const compared=reconcile({independentReviews:dossiers.map(d=>({ticker:d.ticker,reviewDate:d.reviewDate,status:d.reviewStatus,score:d.independentScore})),archivedReviews:reference});
 return {mode:'HISTORICAL_SHADOW_ONLY',reviewDate,dossiers,comparison:compared,totals:{tickers:dossiers.length,marketEvidenceComplete:dossiers.filter(d=>d.marketEvidence).length,independentScoresComplete:dossiers.filter(d=>d.independentScore!==null).length,scoreMatches:compared.filter(x=>x.status==='SCORE_MATCH').length,scoreDifferences:compared.filter(x=>x.status==='SCORE_DIFFERENCE').length}};
}
module.exports={batchDossiers,buildDossier};
