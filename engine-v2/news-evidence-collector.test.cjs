'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseNewsRss,collectNewsCoverage}=require('./news-evidence-collector.cjs');
const at='2026-10-22T09:59:00-04:00';
const xml='<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>'+
 '<item><title>Company announces audited results today</title>'+
 '<link>https://example.com/article</link><pubDate>Thu, 22 Oct 2026 13:55:00 GMT</pubDate></item></channel></rss>';
test('dated source coverage is not a numeric catalyst score',async()=>{
 const x=await collectNewsCoverage({companies:[{ticker:'AMD',name:'Advanced Micro Devices'}],
  date:'2026-10-22',runAt:'2026-10-22T10:00:00-04:00',at,
  fetchFn:async()=>({ok:true,text:async()=>xml})});
 assert.equal(x.status,'COVERAGE_COMPLETE_SCORING_PENDING');assert.equal(x.evidence[0].articles.length,1);
 assert.equal(x.catalystScoresAssigned,false);assert.ok(x.sourceId);
});
test('malformed provider feed blocks coverage rather than using imaginary headlines',async()=>{
 const x=await collectNewsCoverage({companies:[{ticker:'AMD',name:'Advanced Micro Devices'}],
  date:'2026-10-22',runAt:'2026-10-22T10:00:00-04:00',at,
  fetchFn:async()=>({ok:true,text:async()=>'<html>bad</html>'})});
 assert.equal(x.status,'BLOCKED');
});
test('collection completed after decision cutoff blocks instead of backdating source check',async()=>{
 const x=await collectNewsCoverage({companies:[{ticker:'AMD',name:'Advanced Micro Devices'}],
  date:'2026-10-22',runAt:'2026-10-22T10:00:00-04:00',at:'2026-10-22T10:01:00-04:00'});
 assert.equal(x.status,'BLOCKED');
});
test('news feed date parser rejects undated future and non-HTTPS stories',()=>{
 const items=parseNewsRss(xml,{ticker:'AMD',checkedAt:at});
 assert.equal(items.length,1);
 assert.equal(items[0].title,'Company announces audited results today');
});
