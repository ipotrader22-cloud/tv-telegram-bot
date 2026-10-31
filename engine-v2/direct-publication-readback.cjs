'use strict';
const {randomUUID}=require('node:crypto');
const {verifyPublication}=require('./publication-contract.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const {stableStringify}=require('./stable-json.cjs');
// A free-tier shadow observer can still be starting when the first cron
// publication readback reaches it. Retry ONLY transport errors, HTTP 429,
// and HTTP 5xx (maximum three uncached attempts). Never retry a semantic
// fingerprint, HTML, workbook, cache-policy or client-auth rejection.
async function directReadback({manifest,sheet,apiUrl,htmlUrl,fetcher=fetch,
 pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const blocked=reason=>({status:'BLOCKED',reason});
 if(!manifest?.payload?.feed||!apiUrl||!htmlUrl)return blocked('ENDPOINT_OR_FEED_MISSING');
 const uncached=u=>{const x=new URL(u);x.searchParams.set('engine2_readback',randomUUID());return x.href};
 try{uncached(apiUrl);uncached(htmlUrl)}catch{return blocked('ENDPOINT_OR_FEED_MISSING')}
 for(let attempt=0;attempt<3;attempt++){
  if(attempt)await pause(attempt===1?3000:8000);
  let apiRes,htmlRes;
  try{
   // Each retry gets a new no-store request and a fresh timeout.
   const opts=()=>({redirect:'error',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
   [apiRes,htmlRes]=await Promise.all([fetcher(uncached(apiUrl),opts()),fetcher(uncached(htmlUrl),opts())]);
  }catch{
   if(attempt<2)continue;
   return blocked('TRANSIENT_READBACK_UNAVAILABLE');
  }
  if(!apiRes.ok||!htmlRes.ok){
   const responses=[apiRes,htmlRes],failures=responses.filter(r=>!r.ok);
   // 401/403/404 are security/configuration errors, never retryable.
   if(failures.some(r=>r.status!==429&&r.status<500))return blocked('HTTP_ERROR');
   if(attempt<2)continue;
   return blocked('TRANSIENT_READBACK_UNAVAILABLE');
  }
  if(![apiRes,htmlRes].every(r=>String(r.headers.get('cache-control')).includes('no-store')))
   return blocked('CACHE_UNVERIFIED');
  let actual,markup;
  try{[actual,markup]=await Promise.all([apiRes.json(),htmlRes.text()])}
  catch{return blocked('DIRECT_READBACK_FAILED')}
  const expected={...manifest.payload.feed,snapshot_id:manifest.fingerprint};
  if(stableStringify(actual)!==stableStringify(expected))return blocked('EXACT_API_SNAPSHOT_MISMATCH');
  // Compare the actual rendered document, including every amount, row and note.
  // A matching hash embedded in stale HTML is insufficient.
  if(markup!==renderShadowSwing(expected))return blocked('EXACT_VISIBLE_HTML_MISMATCH');
  const receipt={snapshotDate:actual.snapshot_date,activeCount:actual.active_count,snapshotId:actual.snapshot_id,
   tickers:actual.active_portfolio.map(x=>x.ticker),reviewDates:actual.active_portfolio.map(x=>x.last_full_review_date),noStore:true,stale:false};
  const verified=verifyPublication({manifest,sheet,api:receipt,html:receipt});
  return {...verified,api:receipt,html:receipt};
 }
 return blocked('TRANSIENT_READBACK_UNAVAILABLE');
}
module.exports={directReadback};
