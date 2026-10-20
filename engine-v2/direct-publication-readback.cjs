'use strict';
const {verifyPublication}=require('./publication-contract.cjs');
async function directReadback({manifest,sheet,apiUrl,htmlUrl,fetcher}={}){
 if(!fetcher||!apiUrl||!htmlUrl)return {status:'BLOCKED',reason:'ENDPOINT_MISSING'};
 try{
  const apiRes=await fetcher(apiUrl),htmlRes=await fetcher(htmlUrl);
  if(!apiRes.ok||!htmlRes.ok)return {status:'BLOCKED',reason:'HTTP_ERROR'};
  if(!String(apiRes.headers.get('cache-control')).includes('no-store')||!String(htmlRes.headers.get('cache-control')).includes('no-store'))return {status:'BLOCKED',reason:'CACHE_UNVERIFIED'};
  const api=await apiRes.json(),html=await htmlRes.json();
  return verifyPublication({manifest,sheet,api,html});
 }catch{return {status:'BLOCKED',reason:'DIRECT_READBACK_FAILED'}}
}
module.exports={directReadback};
