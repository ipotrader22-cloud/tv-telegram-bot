'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {barsFromChart,historicalProvider}=require('./historical.cjs');
const payload={chart:{result:[{meta:{symbol:'PLTR',exchangeTimezoneName:'America/New_York'},timestamp:[1792175400,1792261800],indicators:{quote:[{open:[100,101],high:[102,103],low:[99,100],close:[101,102],volume:[200,300]}]}}],error:null}};
test('historical adapter validates daily bars and symbol',()=>{assert.equal(barsFromChart(payload,{ticker:'PLTR',minBars:2}).length,2);assert.throws(()=>barsFromChart(payload,{ticker:'NVDA'}),/symbol/)});
test('missing volume is never accepted as confirmed trading evidence',()=>{const p=structuredClone(payload);p.chart.result[0].indicators.quote[0].volume=[null,0];assert.throws(()=>barsFromChart(p,{ticker:'PLTR'}),/Insufficient/)});
test('historical provider injects HTTP and labels data research only',async()=>{const provider=historicalProvider({fetchImpl:async()=>({ok:true,json:async()=>payload})});const out=await provider.getDailyBars('PLTR',{minBars:2});assert.equal(out.purpose,'HISTORICAL_RESEARCH_ONLY');assert.equal(out.bars.length,2)});
