'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const brief=JSON.parse(fs.readFileSync('data/daily-market-skim.json','utf8'));
const {validateSkim}=require('../lib/daily-market-skim-contract');
validateSkim(brief,{todayET:brief.dateET});
const base=(process.env.VIXALE_SKIM_SITE_ORIGIN||'https://www.vixale.com').replace(/\/$/,'');
async function get(path){
 const response=await fetch(base+path+(path.includes('?')?'&':'?')+'skim_qa='+Date.now(),
 {headers:{Accept:'text/html','Cache-Control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,'Site must respond HTTP 200');
 return {html:await response.text(),cache:response.headers.get('cache-control')||''};
}
async function check(){
 const [en,ru]=await Promise.all([
  get('/trading-systems/swing-trading'),
  get('/trading-systems/swing-trading?lang=ru')
 ]);
 for(const x of [en,ru]){
  assert.match(x.html,/id="vx-daily-market-skim"/,'Skim section missing in deployed HTML');
  assert.ok(x.html.includes('data-date="'+brief.dateET+'"'),'Stale skim date on deployed site');
  assert.ok(x.html.includes(brief.sources[0].url.replace(/&/g,'&amp;')),'Source URL absent from site');
  assert.match(x.cache,/no-store/i,'Public live brief must not be cached stale');
 }
 assert.match(en.html,/Daily Market Skim/);
 assert.match(en.html,/NVIDIA’s latest verified company announcement is dated/);
 assert.match(ru.html,/Коротко о рынке/);
 assert.match(ru.html,/Последнее подтверждённое корпоративное сообщение NVIDIA датировано/);
 console.log(JSON.stringify({status:'PASS',gate:'DAILY_SKIM_DEPLOY',date:brief.dateET,localeParity:true,sourceLink:true}));
}
(async()=>{
 for(let i=0;i<24;i++){
  try{await check();return;}catch(e){
   if(i===23)throw e;
   console.log('Deploy not yet visible, attempt '+(i+1)+' of 24');
   await new Promise(resolve=>setTimeout(resolve,15000));
  }
 }
})().catch(e=>{console.error('DAILY SKIM PUBLICATION NOT VERIFIED: '+e.message);process.exitCode=1;});
