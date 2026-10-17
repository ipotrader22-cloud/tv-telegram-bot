'use strict';
// Private research provenance gate; scores remain analyst judgments, not inferred from headlines.
// No network calls, portfolio mutation, or public note generation.
const {CAPS,score}=require('./core.cjs');
const keys=Object.keys(CAPS);
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const domain=x=>{try{const u=new URL(x);return u.protocol==='https:'&&u.hostname.includes('.')&&!u.username&&!u.password}catch{return false}};
function verifyCompanyEvents({ticker,reviewDate,events}){
 if(!/^[A-Z.-]+$/.test(ticker)||!iso(reviewDate)||!Array.isArray(events))throw Error('Invalid company event request');
 return events.map((e,i)=>{
  const issues=[];
  if(e.ticker!==ticker)issues.push('TICKER_MISMATCH');
  if(!iso(e.publishedDate)||e.publishedDate>reviewDate)issues.push('PUBLICATION_AFTER_REVIEW');
  if(!domain(e.url))issues.push('SOURCE_URL_REQUIRED');
  if(e.sourceType==='SEC_FILING'&&domain(e.url)&&!/(^|\.)sec\.gov$/i.test(new URL(e.url).hostname))issues.push('SEC_DOMAIN_MISMATCH');
  if(!['COMPANY_IR','SEC_FILING','EXCHANGE_NOTICE','REPUTABLE_NEWS'].includes(e.sourceType))issues.push('UNSUPPORTED_SOURCE');
  if(typeof e.title!=='string'||e.title.trim().length<8)issues.push('EVENT_DESCRIPTION_MISSING');
  if(e.confirmed!==true)issues.push('FACT_NOT_VERIFIED');
  if(typeof e.checkedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(e.checkedAt)||!Number.isFinite(Date.parse(e.checkedAt)))issues.push('VERIFICATION_TIMESTAMP_REQUIRED');
  if(typeof e.checkedBy!=='string'||!e.checkedBy.trim())issues.push('VERIFIER_REQUIRED');
  return {index:i,ticker,verified:issues.length===0,issues,sourceType:e.sourceType||null,publishedDate:e.publishedDate||null,url:domain(e.url)?e.url:null};
 });
}
function reviewFactors({ticker,reviewDate,factors,evidence,companyEvents=[]}){
 if(!/^[A-Z.-]+$/.test(ticker)||!iso(reviewDate)||!factors||!evidence)throw Error('Invalid nine-factor review');
 const catalysts=verifyCompanyEvents({ticker,reviewDate,events:companyEvents});
 const verifiedCatalysts=catalysts.filter(e=>e.verified);
 const missing=[];
 for(const k of keys){
  const e=evidence[k];
  if(!e||!iso(e.date)||e.date>reviewDate||typeof e.description!=='string'||!e.description.trim()||!domain(e.url))missing.push(k);
 }
 if(factors.catalyst>0&&!verifiedCatalysts.length)missing.push('catalyst:VERIFIED_COMPANY_EVENT_REQUIRED');
 if(missing.length)return {ticker,reviewDate,status:'INCOMPLETE',missing,verifiedCatalysts:verifiedCatalysts.length};
 const total=score(factors);
 return {ticker,reviewDate,status:'COMPLETE_ANALYST_REVIEW',score:total,eligible:total>=70,preferred:total>=80,verifiedCatalysts:verifiedCatalysts.length,factors:{...factors}};
}
module.exports={verifyCompanyEvents,reviewFactors};
