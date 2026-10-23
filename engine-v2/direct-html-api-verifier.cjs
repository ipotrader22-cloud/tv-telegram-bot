'use strict';
const {verifyPublication}=require('./publication-contract.cjs');
async function verifyDirect({manifest,sheet,apiUrl,htmlUrl,fetcher}={}){
 if(!fetcher||!apiUrl||!htmlUrl)return {status:'BLOCKED',reason:'ENDPOINTS_MISSING'};
 try{
  const a=await fetcher(apiUrl),h=await fetcher(htmlUrl);
  if(!a.ok||!h.ok)return {status:'BLOCKED',reason:'HTTP_ERROR'};
  if(!String(a.headers.get('cache-control')).includes('no-store')||!String(h.headers.get('cache-control')).includes('no-store'))return {status:'BLOCKED',reason:'CACHE_NOT_VERIFIED'};
  const api=await a.json(),page=await h.text();
  const token=page.match(/data-engine2-json="([^"]+)"/);
  if(!token)return {status:'BLOCKED',reason:'HTML_EVIDENCE_MISSING'};
  const html=JSON.parse(decodeURIComponent(token[1]));
  return verifyPublication({manifest,sheet,api,html});
 }catch{return {status:'BLOCKED',reason:'DIRECT_FETCH_FAILED'}}
}
module.exports={verifyDirect};
