'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBrief,dayNY,timestampNY}=require('../scripts/vixale-daily-skim');
const {renderDailySkim}=require('../website_swing_ui_refinement');
const sample={url:'https://nvidianews.nvidia.com/news/test-public',publishedDate:'2026-10-14',verified:true,
 excerpt:'NVIDIA and semiconductor leaders advance AI across chip design and manufacturing for AI-defined fabs. This publicly posted company release contains a dated and sourced description with sufficient original content.'};
test('NY time uses actual DST offset',()=>{
 assert.equal(timestampNY(new Date('2026-10-14T14:40:00Z')),'2026-10-14T10:40:00-04:00');
 assert.equal(timestampNY(new Date('2026-12-14T15:40:00Z')),'2026-12-14T10:40:00-05:00');
});
test('independent primary release produces bounded bilingual brief and source link',()=>{
 const s=createBrief([sample],{dateET:'2026-10-14',reviewedAtET:'2026-10-14T10:40:00-04:00'});
 assert.equal(s.provenance,'independent-public-sources');
 assert.match(s.summaryEn,/semiconductor/);assert.match(s.summaryRu,/микросхем/);
 assert.match(renderDailySkim(s,'ru'),/Коротко о рынке/);
 assert.match(renderDailySkim(s,'en'),/Daily Market Skim/);
});
test('strictly rejects prior-day source and unverified TWS/news',()=>{
 assert.throws(()=>createBrief([{...sample,publishedDate:'2026-10-13'}],{dateET:'2026-10-14',reviewedAtET:'2026-10-14T10:40:00-04:00'}),/PENDING/);
 assert.throws(()=>createBrief([{...sample,verified:false}],{dateET:'2026-10-14',reviewedAtET:'2026-10-14T10:40:00-04:00'}),/PENDING/);
});
test('missing brief is clearly pending, never a fabricated current review',()=>{
 const body=renderDailySkim(null,'en');
 assert.match(body,/pending public-source verification/);
 assert.match(body,/data-date="pending"/);
});
