'use strict';
// OAuth2 service account restricted to the Google Sheets read-only scope.
// Secret lives in Render environment, NEVER in GitHub or HTTP output.
const {createSign}=require('node:crypto');
const SCOPES='https://www.googleapis.com/auth/spreadsheets.readonly';
const id='14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const check=(v,m)=>{if(!v)throw Error(m)};
function serviceAccount(raw){
 const j=typeof raw==='string'?JSON.parse(raw):raw;
 check(j?.type==='service_account'&&j.client_email&&j.private_key&&j.token_uri==='https://oauth2.googleapis.com/token','Invalid read-only service account credentials');
 return j;
}
function assertion(j,now=Math.floor(Date.now()/1000)){
 const head=enc({alg:'RS256',typ:'JWT'});
 const data=enc({iss:j.client_email,scope:SCOPES,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const sign=createSign('RSA-SHA256');sign.update(head+'.'+data);sign.end();
 return head+'.'+data+'.'+sign.sign(j.private_key,'base64url');
}
function sheetsReader({credentials,fetchImpl=globalThis.fetch}={}){
 const j=serviceAccount(credentials);let token,expires=0;
 async function bearer(){
  if(token&&Date.now()<expires-60000)return token;
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion(j)});
  const r=await fetchImpl(j.token_uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('Google OAuth access denied HTTP '+r.status);
  const x=await r.json();check(typeof x.access_token==='string'&&x.expires_in>0,'No Google OAuth token');
  token=x.access_token;expires=Date.now()+x.expires_in*1000;return token;
 }
 async function read(ranges){
  check(Array.isArray(ranges)&&ranges.length&&ranges.every(x=>/^(?:'Closed Trades'|'Equity History'|'Open Positions'|'Public Feed')!/.test(x)===false),'Unauthorized Google Sheet range');
  const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'FORMATTED_STRING'});
  for(const range of ranges)params.append('ranges',range);
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values:batchGet?'+params;
  const res=await fetchImpl(url,{headers:{Authorization:'Bearer '+await bearer()},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('Read-only Sheet fetch failed HTTP '+res.status);
  const obj=await res.json();check(Array.isArray(obj.valueRanges),'Google Sheets response incomplete');
  return obj.valueRanges;
 }
 return {read};
}
module.exports={SCOPES,serviceAccount,assertion,sheetsReader};
