'use strict';
// Public, owner-authored JSON ONLY. Not TWS/IBKR data. Never obtains credentials.
const fs=require('node:fs');
const path=require('node:path');
const {validateSkim}=require('./daily-market-skim-contract');
const PUBLIC_URL='https://raw.githubusercontent.com/ipotrader22-cloud/tv-telegram-bot/refs/heads/main/data/daily-market-skim.json';
const LOCAL_FILE=path.join(__dirname,'..','data','daily-market-skim.json');
function todayNY(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function parse(raw,now=new Date()){return validateSkim(JSON.parse(raw),{todayET:todayNY(now)}).data;}
function createFeed({request=globalThis.fetch,localFile=LOCAL_FILE,now=()=>new Date(),logger=()=>{}}={}){
 let remote=null,inflight=null,lastError=null;
 function read(){
  const date=todayNY(now());
  if(remote?.dateET===date)return remote;
  try{return parse(fs.readFileSync(localFile,'utf8'),now());}catch{return null;}
 }
 async function refresh(){
  if(inflight)return inflight;
  inflight=(async()=>{
   try{
    // Fixed public URL; nonce avoids edge-cache lag after the automated GitHub push.
    const url=PUBLIC_URL+'?refresh='+Math.floor(now().getTime()/60000);
    const response=await request(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},
      signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const contentLength=Number(response.headers?.get?.('content-length')||0);
    if(contentLength>30000)throw Error('Oversize public JSON');
    const raw=await response.text();
    if(raw.length>30000)throw Error('Oversize public JSON');
    const item=parse(raw,now());
    remote=item;lastError=null;
    return true;
   }catch(e){
    lastError=String(e.message||'Public source unavailable').slice(0,160);
    logger('Daily skim public feed pending: '+lastError);
    return false;
   }finally{inflight=null;}
  })();
  return inflight;
 }
 function state(){return {available:!!read(),date:read()?.dateET||null,lastError};}
 function start(intervalMs=60000){
  void refresh();
  const timer=setInterval(()=>{void refresh();},intervalMs);
  timer.unref?.();
  return ()=>clearInterval(timer);
 }
 return {read,refresh,start,state};
}
module.exports={PUBLIC_URL,LOCAL_FILE,todayNY,parse,createFeed};
