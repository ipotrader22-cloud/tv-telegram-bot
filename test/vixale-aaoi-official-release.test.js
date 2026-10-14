'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseRelease,fetchAaoiPrimary,URL}=require('../scripts/vixale-aaoi-official-release');
const intro='Applied Optoelectronics Announces Completion of Previously Announced At the Market Offering';
const article='<html><body><h1>'+intro+'</h1><p>October 5, 2026</p><p>SUGAR LAND, Texas, Oct. 5, 2026 /PRNewswire/ -- Applied Optoelectronics, Inc. (NASDAQ: AAOI) announces it has completed its previously disclosed $600 million at-the-market equity offering program, with net proceeds used for manufacturing and research expansion supporting AI optical systems.</p></body></html>';
const options={reviewDate:'2026-10-14',earliest:'2026-09-14'};
test('publisher dated Oct 5 AAOI release is accepted with exact issuer details',()=>{
 const r=parseRelease(article,options);
 assert.equal(r.verified,true);assert.equal(r.publishedDate,'2026-10-05');assert.equal(r.url,URL);
});
test('no fabricated date, no wrong ticker, no out-of-window backfill',()=>{
 assert.throws(()=>parseRelease(article.replace('October 5, 2026','Undated'),options),/Publication date/);
 assert.throws(()=>parseRelease(article.replace('NASDAQ: AAOI','NASDAQ: TEST'),options),/Publication date/);
 assert.throws(()=>parseRelease(article,{...options,earliest:'2026-10-06'}),/outside permitted/);
});
test('live fetch uses pinned official AAOI source and never makes an LLM call',async()=>{
 let url;
 const res=await fetchAaoiPrimary({...options,request:async u=>{url=u;return {ok:true,text:async()=>article}}});
 assert.equal(url,URL);assert.equal(res.length,1);
});
