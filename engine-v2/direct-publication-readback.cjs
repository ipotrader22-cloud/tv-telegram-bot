'use strict';
const {randomUUID}=require('node:crypto');
const {verifyPublication}=require('./publication-contract.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const {stableStringify}=require('./stable-json.cjs');
async function directReadback({manifest,sheet,apiUrl,htmlUrl,fetcher=fetch}={}){
 const blocked=reason=>({status:'BLOCKED',reason});
 if(!manifest?.payload?.feed||!apiUrl||!htmlUrl)return blocked('ENDPOINT_OR_FEED_MISSING');
 try{
  const uncached=u=>{const x=new URL(u);x.searchParams.set('engine2_readback',randomUUID());return x.href};
  const opts={redirect:'error',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)};
  const [apiRes,htmlRes]=await Promise.all([fetcher(uncached(apiUrl),opts),fetcher(uncached(htmlUrl),opts)]);
  if(!apiRes.ok||!htmlRes.ok)return blocked('HTTP_ERROR');
  if(![apiRes,htmlRes].every(r=>String(r.headers.get('cache-control')).includes('no-store')))return blocked('CACHE_UNVERIFIED');
  const actual=await apiRes.json(),markup=await htmlRes.text();
  const expected={...manifest.payload.feed,snapshot_id:manifest.fingerprint};
  if(stableStringify(actual)!==stableStringify(expected))return blocked('EXACT_API_SNAPSHOT_MISMATCH');
  // Compare the actual rendered document, including every amount, row and note.
  // A matching hash embedded in stale HTML is insufficient.
  if(markup!==renderShadowSwing(expected))return blocked('EXACT_VISIBLE_HTML_MISMATCH');
  const receipt={snapshotDate:actual.snapshot_date,activeCount:actual.active_count,snapshotId:actual.snapshot_id,
   tickers:actual.active_portfolio.map(x=>x.ticker),reviewDates:actual.active_portfolio.map(x=>x.last_full_review_date),noStore:true,stale:false};
  const verified=verifyPublication({manifest,sheet,api:receipt,html:receipt});
  return {...verified,api:receipt,html:receipt};
 }catch{return blocked('DIRECT_READBACK_FAILED')}
}
module.exports={directReadback};
