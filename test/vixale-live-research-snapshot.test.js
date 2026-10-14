'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBlocks}=require('../scripts/vixale-live-research-snapshot');
test('Public Feed dollar string and numeric ledger entry match exactly',()=>{
 const pub=Array.from({length:45},()=>[]);
 pub[1]=['snapshot_date','2026-10-13'];
 pub[13]=['PLTR','NASDAQ',84,'2026-10-08','$200.74','$202.00','0.63%','2026-10-13','note'];
 const equity=[['snapshot_date','time','realized','unrealized','total','equity','actives'],
 ['2026-10-13','16:00 ET',0,10,10,100010,1]];
 const blocks=[
  [[1,'NASDAQ','PLTR',84,0.1,200.74,49,0,201,0,0,0,'Active Portfolio']],
  [['2026-10-08','NASDAQ','PLTR',85,'Active Portfolio',200.74,49,0,201,0,0,0,0.1,'2026-10-13']],
  pub,[],equity];
 const f=[[['=C1']],[['=FILTER(A:B)']],[['=SUM(A2:A2)',10,'=C2+D2','=100000+E2']]];
 const output=parseBlocks(blocks,f);
 assert.equal(output.portfolio[0].entryPrice,200.74);
 assert.equal(output.publicActive[0].entryPrice,200.74);
 assert.equal(output.formulas.equityHistoryProtected,true);
});
