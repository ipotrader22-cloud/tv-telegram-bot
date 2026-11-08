'use strict';
const {indexUniverse}=require('./index-universe.cjs');
const {previousSession}=require('../scripts/swing-market-calendar');
function validateUniverseCoverage(artifact,{required=false}={}){
 const c=artifact?.universeCoverage;
 if(!c){if(required)throw Error('INDEX_UNIVERSE_COVERAGE_MISSING');return;}
 const expected=indexUniverse(),bad=()=>{throw Error('INDEX_UNIVERSE_COVERAGE_INVALID')};
 if(c.membership?.hash!==expected.membership.hash||
    JSON.stringify(c.requested)!==JSON.stringify(expected.candidates)||
    JSON.stringify(c.reviewed)!==JSON.stringify(artifact.candidates)||!Array.isArray(c.exclusions))bad();
 const seen=new Set(c.reviewed);
 if(seen.size!==c.reviewed.length||c.reviewed.some(t=>!expected.candidates.includes(t)))bad();
 for(const e of c.exclusions){
  if(seen.has(e.ticker)||!expected.candidates.includes(e.ticker)||
     !['INSUFFICIENT_200_COMPLETED_BARS','PROVIDER_SYMBOL_UNAVAILABLE'].includes(e.reason)||
     e.source!=='GOOGLE_FINANCE_CHART_1DAY'||e.exchange!==expected.exchanges[e.ticker]||
     !/^[a-f0-9]{64}$/.test(e.rawHash||''))bad();
  if(e.reason==='INSUFFICIENT_200_COMPLETED_BARS'&&(!Number.isInteger(e.completedDailyBars)||
     e.completedDailyBars<1||e.completedDailyBars>=200||e.lastCompleteDate!==previousSession(artifact.date)))bad();
  if(e.reason==='PROVIDER_SYMBOL_UNAVAILABLE'&&(!Number.isFinite(Date.parse(e.checkedAt||''))||
     e.checkedAt.slice(0,10)!==artifact.date||Date.parse(e.checkedAt)>Date.parse(artifact.collectedAt)))bad();
  seen.add(e.ticker);
 }
 if(seen.size!==expected.candidates.length)bad();
}
module.exports={validateUniverseCoverage};
