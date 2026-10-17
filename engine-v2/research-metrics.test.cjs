'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {metrics}=require('./research-metrics.cjs');
const make=(price)=>Array.from({length:220},(_,i)=>{const day=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);return {day,open:price+i*.1,high:price+i*.1+2,low:price+i*.1-2,close:price+i*.1+1,volume:100000+i*10}});
const stock=make(100),market=make(200),sector=make(300);
test('independent market and sector evidence uses aligned completed data',()=>{const r=metrics({ticker:'PLTR',bars:stock,benchmarkBars:market,sectorBars:sector,reviewDate:'2026-10-17'});assert.equal(r.completedBars,220);assert.equal(r.asOf,stock.at(-1).day);assert.equal(r.scoring,'REQUIRES_DOCUMENTED_ANALYST_FACTORS');assert.ok(r.technical.sma200>0);assert.ok(r.market.excessReturn>0)});
test('fails closed on incomplete benchmark',()=>assert.throws(()=>metrics({ticker:'PLTR',bars:stock,benchmarkBars:market.slice(50),sectorBars:sector,reviewDate:'2026-10-17'}),/200 completed/));
test('fails closed on incomplete/missing exchange volume',()=>assert.throws(()=>metrics({ticker:'PLTR',bars:stock.map((b,i)=>i===2?{...b,volume:null}:b),benchmarkBars:market,sectorBars:sector,reviewDate:'2026-10-17'}),/invalid completed/));
test('rejects current day incomplete daily bar',()=>assert.throws(()=>metrics({ticker:'PLTR',bars:[...stock,{...stock.at(-1),day:'2026-10-17'}],benchmarkBars:market,sectorBars:sector,reviewDate:'2026-10-17'}),/invalid completed/));
