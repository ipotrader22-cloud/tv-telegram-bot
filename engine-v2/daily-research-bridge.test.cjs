'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeDailyEvidence}=require('./daily-research-bridge.cjs');
const date='2026-10-19';
const metrics=ticker=>({symbol:ticker,quoteDate:date,dailyBars:251,lastCompleteDate:'2026-10-16',sma20:100,sma50:98,sma200:85,lastCompleteRelativeVolume:1.2,range20Pct:12,high20:120,high60:125,return20Pct:4,return60Pct:12,quoteTime:'2026-10-19T13:59:59.000Z',price:110});
const names=['A','SPY','QQQ','SMH','XLK','XLE'];
const artifact={gate:'RESEARCH_INPUTS',result:'PASS',date,data:names.map(ticker=>({source:'https://query1.finance.yahoo.com/v8/finance/chart/'+ticker,metrics:metrics(ticker)}))};
test('existing OHLCV collector maps measurable facts without fabricating factor points',()=>{
 const x=normalizeDailyEvidence({artifact,universe:['A'],reviewDate:date});
 assert.equal(x.status,'METRICS_READY_SCORING_PENDING');assert.equal(x.scoreVerified,false);assert.equal(x.entryQuoteVerified,false);
 assert.equal(x.items[0].completedDailyBars,251);assert.ok(!Object.hasOwn(x.items[0],'score'));
});
test('incomplete quote history or missing benchmark blocks review',()=>{
 const a=JSON.parse(JSON.stringify(artifact));a.data=a.data.filter(x=>x.metrics.symbol!=='SPY');
 assert.equal(normalizeDailyEvidence({artifact:a,universe:['A'],reviewDate:date}).status,'BLOCKED');
});
test('prior-day artifact cannot be misrepresented as current',()=>assert.equal(normalizeDailyEvidence({artifact,universe:['A'],reviewDate:'2026-10-20'}).status,'BLOCKED'));
test('universe must be specified independently of legacy holdings',()=>assert.equal(normalizeDailyEvidence({artifact,universe:[],reviewDate:date}).status,'BLOCKED'));
