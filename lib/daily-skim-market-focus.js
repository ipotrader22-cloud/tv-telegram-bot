'use strict';
// No single-company release can pass as a broad US market overview.
function validMetric(m){return m&&typeof m.sourceUrl==='string'&&m.sourceUrl.startsWith('https://fred.stlouisfed.org/series/')&&typeof m.asOfET==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-(04|05):00$/.test(m.asOfET)&&Number.isFinite(m.level)&&m.level>0&&Number.isFinite(m.changePct)&&Math.abs(m.changePct)<100;}
function isBroadMarket(skim){
 const m=skim?.marketIndicators;
 if(skim?.scope!=='broad-us-equities'||!m||!validMetric(m.indices?.sp500)||!validMetric(m.indices?.nasdaq)||!validMetric(m.volatility?.vix)||!validMetric(m.rates?.treasury10y))return false;
 if(!Array.isArray(skim.sources)||!skim.sources.some(x=>/Federal Reserve Bank of St\. Louis/i.test(x.issuer||'')))return false;
 const d=m.indices.sp500.asOfET.slice(0,10);
 return m.indices.nasdaq.asOfET.slice(0,10)===d&&m.volatility.vix.asOfET.slice(0,10)===d;
}
module.exports={validMetric,isBroadMarket};
