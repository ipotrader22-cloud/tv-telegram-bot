'use strict';
// Source manifest must be explicitly approved per historical ticker, not inferred from company name.
const {retrieveDocument}=require('./company-document-reader.cjs');
const {reference}=require('./historical-oct12-reference.cjs');
async function gatherSources({reviewDate='2026-10-12',manifest={},fetchImpl}){
 if(reviewDate!=='2026-10-12')throw Error('Unsupported historical cutoff');
 const results={};
 for(const item of reference){
  const urls=manifest[item.ticker]||[];
  if(!Array.isArray(urls)||urls.length>8)throw Error('Invalid bounded source manifest '+item.ticker);
  const collected=[];
  for(const source of urls){
   try{const doc=await retrieveDocument({ticker:item.ticker,reviewDate,source,fetchImpl});collected.push({url:doc.url,publishedDate:doc.publishedDate,sourceType:doc.sourceType,contentSha256:doc.contentSha256,status:doc.status,extractedText:doc.extractedText})}
   catch(e){collected.push({url:source.url||null,status:'SOURCE_UNAVAILABLE',error:e.message})}
  }
  results[item.ticker]=collected;
 }
 return {reviewDate,status:'SOURCE_INTAKE_ONLY_NO_FACT_SCORE',sources:results,coverage:{tickers:reference.length,withRetrievedSources:Object.values(results).filter(a=>a.some(x=>x.status==='RETRIEVED_NOT_FACT_VERIFIED')).length}};
}
module.exports={gatherSources};
