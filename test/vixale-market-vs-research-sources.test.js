'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseOfficialRss,FEEDS}=require('../scripts/vixale-public-macro-feeds');
const {TICKERS,mapRegistry,parseRecent}=require('../scripts/vixale-sec-research-evidence');
test('macro is primary/government only, rejects any publisher redirect',()=>{
 assert.equal(FEEDS.length,3);
 const xml='<rss><channel><item><title>Federal Reserve policy statement announced</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261014a.htm</link><pubDate>Wed, 14 Oct 2026 14:00:00 GMT</pubDate><description>Official Federal Reserve statement.</description></item><item><title>Unrelated company announcement</title><link>https://nvidianews.nvidia.com/news/test</link><pubDate>Wed, 14 Oct 2026 14:00:00 GMT</pubDate></item></channel></rss>';
 const rows=parseOfficialRss(xml,{source:FEEDS[0],reviewDate:'2026-10-14',earliest:'2026-10-01'});
 assert.equal(rows.length,1);assert.equal(rows[0].kind,'us-macro');
 assert.equal(rows[0].publishedDate,'2026-10-14');
});
test('SEC ticker identity must be live registry exact issuer, not headline match',()=>{
 const a=mapRegistry({0:{ticker:'PLTR',cik_str:1321655,title:'Palantir Technologies Inc.'},1:{ticker:'NVDA',cik_str:1045810,title:'NVIDIA CORP'}});
 assert.equal(a.get('NVDA').cik,'0001045810');
 assert.equal(a.get('PLTR').issuer,'Palantir Technologies Inc.');
 assert.equal(TICKERS.length,8);
});
test('SEC date and exact accession filtering; never mark filing as full review',()=>{
 const filings=parseRecent({filings:{recent:{
  form:['8-K','10-Q','8-K'],filingDate:['2026-10-14','2026-10-13','2026-10-14'],
  accessionNumber:['0001000000-26-000001','0001000000-26-000002','invalid'],
  primaryDocument:['form8k.htm','form10q.htm','x.htm']
 }}},{ticker:'PLTR',cik:'0001321655',reviewDate:'2026-10-14',earliest:'2026-10-01'});
 assert.equal(filings.length,2);
 assert.equal(filings[0].reviewed,false);
 assert.equal(filings[0].verifiedIdentity,true);
 assert.match(filings[0].officialUrl,/sec\.gov\/Archives\/edgar/);
});
test('SEC refuses ambiguous ticker registry',()=>{
 assert.throws(()=>mapRegistry({0:{ticker:'XOM',cik_str:34088,title:'Exxon Mobil'},1:{ticker:'XOM',cik_str:999,title:'Different'}}),/duplicated/);
});

test('legacy NVIDIA issuer recap is not a US market skim',()=>{
 const {isBroadMarket}=require('../lib/daily-skim-market-focus');
 const legacy={scope:undefined,summaryEn:'NVIDIA announced a new product',sources:[{issuer:'NVIDIA Newsroom'}]};
 assert.equal(isBroadMarket(legacy),false);
});
test('broad-market focus requires independent indices volatility yield, excludes single company',()=>{
 const {isBroadMarket}=require('../lib/daily-skim-market-focus');
 const m=(id)=>({asOfET:'2026-10-13T16:00:00-04:00',sourceUrl:'https://fred.stlouisfed.org/series/'+id,level:100,changePct:0.2});
 const x={scope:'broad-us-equities',
  marketIndicators:{indices:{sp500:m('SP500'),nasdaq:m('NASDAQCOM')},
   volatility:{vix:m('VIXCLS')},rates:{treasury10y:m('DGS10')}},
  sources:[{issuer:'Federal Reserve Bank of St. Louis (FRED)'}]};
 assert.equal(isBroadMarket(x),true);
 assert.equal(isBroadMarket({...x,marketIndicators:{...x.marketIndicators,volatility:{}}}),false);
 assert.equal(isBroadMarket({...x,sources:[{issuer:'NVIDIA Newsroom'}]}),false);
});
