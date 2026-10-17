'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {gatherSources}=require('./historical-source-gather.cjs');
test('all thirteen reference tickers appear, including those with zero source links',async()=>{
 const r=await gatherSources({manifest:{}});
 assert.equal(r.coverage.tickers,13);assert.equal(r.coverage.withRetrievedSources,0);
 assert.equal(Object.keys(r.sources).length,13);
});
test('one failed provider request cannot prevent another ticker dossier',async()=>{
 const r=await gatherSources({manifest:{PLTR:[{url:'https://www.sec.gov/Archives/test',sourceType:'SEC_FILING',publishedDate:'2026-10-01'}]},fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(r.sources.PLTR[0].status,'SOURCE_UNAVAILABLE');
 assert.ok(Array.isArray(r.sources.NVDA));
});
test('future-dated sources are excluded from historical evidence',async()=>{
 const r=await gatherSources({manifest:{DELL:[{url:'https://investors.dell.com/news',sourceType:'COMPANY_IR',publishedDate:'2026-10-13'}]}});
 assert.equal(r.sources.DELL[0].status,'SOURCE_UNAVAILABLE');
});
