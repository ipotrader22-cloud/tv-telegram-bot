'use strict';
// READ-ONLY consumer of the existing production Render quote-status endpoint.
// Never talks to local TWS, updates trading subscriptions, or places orders.
// The current status endpoint exposes display price/source/age, NOT verified
// exchange LAST timestamps; hence it can certify bridge observability ONLY.
const {createHash}=require('node:crypto');
const APPROVED_HOST='tv-telegram-bot-a7t0.onrender.com';
function validateUrl(value){
 if(typeof value!=='string')throw Error('QUOTE_STATUS_URL_NOT_CONFIGURED');
 const u=new URL(value);
 if(u.protocol!=='https:'||u.hostname!==APPROVED_HOST||u.pathname!=='/bridge/quotes/status'||u.username||u.password||u.hash)
  throw Error('QUOTE_STATUS_URL_NOT_APPROVED');
 return u;
}
function assessStatus(data,{symbols=[],maxAgeSeconds=90}={}){
 const errors=[];
 if(!data||data.ok!==true||!Array.isArray(data.symbols))return {status:'BLOCKED',reason:'INVALID_RENDER_QUOTE_STATUS',symbols:[],tradeEvidenceVerified:false};
 const names=new Set(),items=[];
 for(const q of data.symbols){
  const ticker=String(q?.symbol||'').toUpperCase();
  if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)||names.has(ticker)){errors.push('INVALID_OR_DUPLICATE_TICKER');continue}
  names.add(ticker);
  const price=Number(q.price),age=Number(q.age_seconds);
  const valid=Number.isFinite(price)&&price>0&&Number.isFinite(age)&&age>=0&&age<=maxAgeSeconds;
  if(!valid)errors.push('MISSING_OR_STALE_RENDER_PRICE:'+ticker);
  items.push({ticker,price,ageSeconds:age,source:String(q.source||'UNKNOWN'),freshForDisplay:valid});
 }
 for(const ticker of symbols)if(!names.has(ticker))errors.push('MISSING_RENDER_TICKER:'+ticker);
 const healthy=!errors.length;
 return {status:healthy?'DISPLAY_QUOTES_OBSERVED':'BLOCKED',reason:healthy?null:'RENDER_QUOTE_COVERAGE_INCOMPLETE',
  errors,symbols:items,tradeEvidenceVerified:false,modelEntryEligible:false};
}
async function pollRenderQuoteStatus({url,authorization,fetchFn=fetch,symbols=[]}={}){
 let target;try{target=validateUrl(url)}catch(e){return {status:'BLOCKED',reason:e.message,tradeEvidenceVerified:false}}
 if(!authorization||typeof authorization!=='string')return {status:'BLOCKED',reason:'QUOTE_STATUS_AUTH_NOT_CONFIGURED',tradeEvidenceVerified:false};
 try{
  const response=await fetchFn(target.toString(),{
   method:'GET',redirect:'error',cache:'no-store',
   headers:{'Authorization':authorization,'Accept':'application/json','Cache-Control':'no-cache'},
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)return {status:'BLOCKED',reason:response.status===401||response.status===403?'QUOTE_STATUS_UNAUTHORIZED':'QUOTE_STATUS_HTTP_UNAVAILABLE',httpStatus:response.status,tradeEvidenceVerified:false};
  const body=await response.text();
  if(body.length>512*1024)return {status:'BLOCKED',reason:'QUOTE_STATUS_TOO_LARGE',tradeEvidenceVerified:false};
  const evidence=assessStatus(JSON.parse(body),{symbols});
  return {...evidence,observationHash:createHash('sha256').update(body).digest('hex')};
 }catch{return {status:'BLOCKED',reason:'QUOTE_STATUS_REQUEST_FAILED',tradeEvidenceVerified:false}}
}
module.exports={assessStatus,pollRenderQuoteStatus,validateUrl};
