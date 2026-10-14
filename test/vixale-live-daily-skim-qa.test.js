'use strict';
// Network-only live QA, no mutating actions or portfolio credentials.
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateSkim}=require('../lib/daily-market-skim-contract');
const dateNY=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const origin='https://www.vixale.com';
async function read(url,accept){
 const response=await fetch(url,{cache:'no-store',redirect:'follow',headers:{Accept:accept,'Cache-Control':'no-cache'},signal:AbortSignal.timeout(18000)});
 assert.equal(response.status,200,'HTTP '+response.status+' '+url);
 return {text:await response.text(),headers:response.headers};
}
function section(html){
 const m=html.match(/<section\b[^>]*id="vx-daily-market-skim"[^>]*>[\s\S]*?<\/section>/i);
 assert.ok(m,'Daily Market Skim DOM section absent');
 return m[0];
}
test('LIVE EN/RU HTML matches independently verified current-day public JSON',async()=>{
 const today=dateNY();
 const [json,en,ru]=await Promise.all([
  read('https://raw.githubusercontent.com/ipotrader22-cloud/tv-telegram-bot/refs/heads/main/data/daily-market-skim.json?qa='+Date.now(),'application/json'),
  read(origin+'/trading-systems/swing-trading?vx_live_skim_qa='+Date.now(),'text/html'),
  read(origin+'/trading-systems/swing-trading?lang=ru&vx_live_skim_qa='+Date.now(),'text/html')
 ]);
 const brief=validateSkim(JSON.parse(json.text),{todayET:today}).data;
 const a=section(en.text),b=section(ru.text);
 for(const s of [a,b]){
  assert.ok(s.includes('data-date="'+brief.dateET+'"'),'Live skim date mismatch');
  assert.ok(s.includes(brief.sources[0].url.replace(/&/g,'&amp;')),'Live source URL mismatch');
 }
 assert.match(a,/Daily Market Skim/);assert.match(b,/Коротко о рынке/);
 assert.match(a,/NVIDIA/);assert.match(b,/NVIDIA/);
 assert.ok(a.includes(brief.summaryEn.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')),'English text mismatch');
 assert.ok(b.includes(brief.summaryRu.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')),'Russian text mismatch');
 console.log(JSON.stringify({gate:'DAILY_SKIM_LIVE_EN_RU',result:'PASS',date:brief.dateET,publicSite:origin,noWrites:true}));
});
