'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAutonomousResearchProvider}=require('./autonomous-research-provider.cjs');
const symbols=['AMD','SPY','QQQ','SMH','XLK','XLE'];
const date='2026-10-22',runAt='2026-10-22T10:00:00-04:00';
const m=t=>({symbol:t,quoteDate:date,dailyBars:250,lastCompleteDate:'2026-10-21',
 lastCompleteClose:110,sma20:105,sma50:100,sma200:90,lastCompleteRelativeVolume:1.4,
 upDownVolume20:1.8,range5Pct:7,range20Pct:15,high20:112,high60:120,return20Pct:12,return60Pct:30,
 quoteTime:'2026-10-22T09:59:00-04:00',price:112});
const artifact={gate:'RESEARCH_INPUTS',result:'PASS',date,mode:'CLEAN_EPOCH',candidates:['AMD'],
 collectedAt:'2026-10-22T09:59:00-04:00',
 data:symbols.map(t=>({source:'https://query1.finance.yahoo.com/v8/finance/chart/'+t,metrics:m(t)}))};
const news={status:'COVERAGE_COMPLETE_SCORING_PENDING',date,complete:true,
 checkedAt:'2026-10-22T09:59:00-04:00',sourceId:'GOOGLENEWS_RSS_SHA256:news',tickers:['AMD']};
const args={universeCsv:'AMD',sectorByTicker:{AMD:'SMH'},
 artifactProvider:{getArtifact:async()=>artifact},newsProvider:{collect:async()=>news}};
const sess={date,isTradingDay:true,providerVerified:true};
test('autonomous OHLCV+news pipeline produces all-nine-factor batch with reproducible score',async()=>{
 const r=await createAutonomousResearchProvider(args).getBatch({date,runAt,session:sess});
 assert.equal(r.items.length,1);assert.equal(Object.keys(r.items[0].factors).length,9);
 assert.equal(r.items[0].factors.catalyst,0);assert.equal(r.universe[0],'AMD');
 assert.equal(r.scoringPolicyVersion,'ENGINE2_RULES_2026_10_22');
});
test('missing news and independent universe block instead of reverting to legacy holdings',async()=>{
 const x=createAutonomousResearchProvider({...args,newsProvider:{collect:async()=>null}});
 await assert.rejects(()=>x.getBatch({date,runAt,session:sess}),/DETERMINISTIC_SCORING_BLOCKED/);
 const y=createAutonomousResearchProvider({...args,artifactProvider:{getArtifact:async()=>({...artifact,mode:'LEGACY'})}});
 await assert.rejects(()=>y.getBatch({date,runAt,session:sess}),/INDEPENDENT_UNIVERSE/);
});
test('batch artifact from after morning cutoff fails closed',async()=>{
 const x=createAutonomousResearchProvider({...args,artifactProvider:{getArtifact:async()=>({...artifact,collectedAt:'2026-10-22T10:01:00-04:00'})}});
 await assert.rejects(()=>x.getBatch({date,runAt,session:sess}),/FUTURE_OR_UNDATED/);
});
