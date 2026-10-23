'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {datedResearchProvider}=require('./dated-research-provider.cjs');
const {CAPS}=require('./core.cjs');
const date='2026-10-19',runAt='2026-10-19T10:00:00-04:00';
const session={date,isTradingDay:true,providerVerified:true};
const stamp='2026-10-19T09:59:00-04:00';
function item(){
 const factors={...CAPS};
 const factorsEvidence=Object.fromEntries(Object.keys(CAPS).map(k=>[k,{sourceId:'fixture-'+k,explanation:'test evidence',date}]));
 return {ticker:'AMD',date,timestamp:stamp,complete:true,score:100,factors,factorsEvidence,completedDailyBars:220,lastCompletedSessionDate:'2026-10-16',ohlcvSourceId:'fixture-bars',newsEvidenceId:'fixture-news',marketEvidenceId:'fixture-market',sectorEvidenceId:'fixture-sector',volumeRvol:1.2,exchangeVolumeVerified:true,ma20:100,ma50:90,ma200:80};
}
test('complete dated fixture satisfies research contract',async()=>{
 const p=datedResearchProvider({universe:['AMD'],benchmarksProvider:async()=>[{sourceId:'fixture-spy',timestamp:stamp}],reviewProvider:async()=>item()});
 assert.equal((await p.getBatch({date,runAt,session})).items.length,1);
});
test('undated factor evidence blocks batch',async()=>{
 const p=datedResearchProvider({universe:['AMD'],benchmarksProvider:async()=>[{sourceId:'fixture-spy',timestamp:stamp}],reviewProvider:async()=>{const i=item();delete i.factorsEvidence.market.date;return i}});
 await assert.rejects(p.getBatch({date,runAt,session}),/Undated factor/);
});
