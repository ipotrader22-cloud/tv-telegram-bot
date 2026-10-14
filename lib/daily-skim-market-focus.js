'use strict';
// Extra editorial gate: schema-valid company news MUST NOT masquerade as broad-market skim.
function validMetric(m){
 return m&&typeof m==='object'&&typeof m.sourceUrl==='string'&&/^https:\/\//.test(m.sourceUrl)&&
 typeof m.asOfET==='string'&& /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(m.asOfET)&&
 Number.isFinite(m.level)&&Number.isFinite(m.changePct);
}
function isBroadMarket(skim){
 const indices=skim?.marketIndicators?.indices;
 const required=['sp500','nasdaq','russell2000'];
 if(skim?.scope!=='broad-us-equities'||!indices||
  !required.every(k=>validMetric(indices[k])))return false;
 const sources=skim?.sources||[];
 // No issuer-only source list can satisfy this publication's macro requirement.
 if(!sources.some(x=>/Federal Reserve|Bureau of Labor Statistics|Treasury|Cboe|exchange|index/i.test(x.issuer||'')))return false;
 return true;
}
module.exports={isBroadMarket};
