'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSkim}=require('../lib/daily-market-skim-contract');
const sample={dateET:'2026-10-14',reviewedAtET:'2026-10-14T10:37:00-04:00',universeDate:'2026-10-14',
 provenance:'independent-public-sources',stance:'mixed',
 summaryEn:'The broad market showed mixed leadership this morning. Company-specific updates shaped sentiment in technology, while investors weighed the latest primary-source announcements.',
 summaryRu:'Утром на рынке наблюдалась неоднородная динамика. На настроения в технологическом секторе повлияли корпоративные события, опубликованные в первичных источниках.',
 sources:[{url:'https://www.sec.gov/Archives/edgar/data/0000000000/example',issuedDate:'2026-10-14',issuer:'U.S. Securities and Exchange Commission'}]};
test('accepts independently sourced, bilingual current-day content',()=>assert.match(validateSkim(sample,{todayET:'2026-10-14'}).digest,/^[0-9a-f]{64}$/));
test('rejects stale review',()=>assert.throws(()=>validateSkim(sample,{todayET:'2026-10-15'}),/mismatch/));
test('rejects unlicensed provenance marker',()=>assert.throws(()=>validateSkim({...sample,provenance:'TWS_DJ_N'},{todayET:'2026-10-14'}),/provenance/));
test('rejects unallowlisted or non-https source',()=>assert.throws(()=>validateSkim({...sample,sources:[{...sample.sources[0],url:'https://evil.example.com/article'}]},{todayET:'2026-10-14'}),/allowlisted/));
test('rejects old timestamp falsely dated as current',()=>assert.throws(()=>validateSkim({...sample,reviewedAtET:'2026-10-13T10:37:00-04:00'},{todayET:'2026-10-14'}),/Timestamp/));
test('rejects html injection and too-long skim',()=>{
 assert.throws(()=>validateSkim({...sample,summaryEn:sample.summaryEn+'<script>alert(1)</script>'},{todayET:'2026-10-14'}),/Malformed/);
 assert.throws(()=>validateSkim({...sample,summaryEn:('Market context ' ).repeat(48)},{todayET:'2026-10-14'}),/>90/);
});
