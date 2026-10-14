'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseCsv,collectMarket,SERIES}=require('../scripts/vixale-broad-market-fred');
test('accepts dated FRED CSV and computes change from completed observations',()=>{
 const a=parseCsv('observation_date,SP500\n2026-10-12,100\n2026-10-13,102\n2026-10-14,.\n','SP500',{reviewDate:'2026-10-14'});
 assert.equal(a.date,'2026-10-13');assert.equal(a.changePct,2);
});
test('rejects HTML/future observations and stale data',()=>{
 assert.throws(()=>parseCsv('<html>blocked</html>','SP500',{reviewDate:'2026-10-14'}),/unexpected/);
 assert.throws(()=>parseCsv('observation_date,SP500\n2026-10-01,100\n2026-10-02,101','SP500',{reviewDate:'2026-10-14'}),/stale/);
});
test('requires index and VIX same publication observation date',async()=>{
 const payloads={SP500:'2026-10-12,100\n2026-10-13,102',NASDAQCOM:'2026-10-12,100\n2026-10-13,103',
  VIXCLS:'2026-10-10,22\n2026-10-12,24',DGS10:'2026-10-12,4\n2026-10-13,4.1'};
 const fetcher=async u=>{const id=new URL(u).searchParams.get('id');return {ok:true,text:async()=>('observation_date,'+id+'\n'+payloads[id]),headers:{get:()=>null}};};
 await assert.rejects(()=>collectMarket({reviewDate:'2026-10-14',request:fetcher}),/Mismatched/);
});
test('only trusted FRED series allowlist is queried',()=>assert.deepEqual(Object.keys(SERIES),['sp500','nasdaq','vix','treasury10y']));
