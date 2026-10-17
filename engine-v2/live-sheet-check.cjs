'use strict';
// Live comparison is read-only and separate from persisted historical snapshots.
const {sheetsReader}=require('./google-sheets-reader.cjs');
const spreadsheetId='14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
const RANGES=["'Closed Trades'!A4:R1000","'Equity History'!A2:G1000","'Open Positions'!A4:R100"];
const val=(row,i)=>row?.[i]??null;
function fromRanges(ranges){
 if(!Array.isArray(ranges)||ranges.length!==3)throw Error('Expected three canonical Sheet ranges');
 const rows=ranges.map(x=>x.values||[]);
 const closed=rows[0].filter(r=>val(r,2)).map(r=>({ticker:val(r,2),entryDate:val(r,4),exitDate:val(r,0),entryPrice:val(r,5),exitPrice:val(r,8),returnPct:val(r,11),includePublic:val(r,16),effectiveDate:val(r,17)}));
 const equity=rows[1].filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(val(r,0)||'')).map(r=>({date:val(r,0),realized:val(r,2),unrealized:val(r,3),total:val(r,4),equity:val(r,5),activeCount:val(r,6)}));
 const active=rows[2].filter(r=>val(r,4)==='Active Portfolio').map(r=>({ticker:val(r,2),entryDate:val(r,0),entryPrice:val(r,5),entryScore:val(r,3),lastReview:val(r,13),price:val(r,8)}));
 if(!equity.length||!closed.length)throw Error('Incomplete canonical workbook');
 return {asOf:equity.at(-1).date,closed,equity,active};
}
async function getLiveSnapshot({credentials,fetchImpl}){
 const reader=sheetsReader({credentials,fetchImpl});
 const source=fromRanges(await reader.read(RANGES));
 return {...source,source:'GOOGLE_SHEETS_READONLY',spreadsheetId,checkedAt:new Date().toISOString()};
}
function compareImported(live,stored){
 const old=new Map(stored.closed.map(x=>[x.ticker+'|'+x.entryDate,x]));
 const changed=live.closed.filter(x=>{const prev=old.get(x.ticker+'|'+x.entryDate);return !prev||x.includePublic!==prev.includePublic||x.effectiveDate!==prev.effectiveDate||x.returnPct!==prev.returnPct});
 const removed=stored.closed.filter(x=>!live.closed.some(y=>y.ticker===x.ticker&&y.entryDate===x.entryDate));
 const activeKey=x=>[x.ticker,x.entryDate,x.entryPrice,x.entryScore].join('|');
 const activeChanged=live.active.map(activeKey).sort().join('\n')!==stored.active.map(activeKey).sort().join('\n');
 const frozenChanged=stored.equity.filter(x=>x.date<stored.asOf).some(x=>{const y=live.equity.find(z=>z.date===x.date);return !y||JSON.stringify(y)!==JSON.stringify(x)})||live.equity.some(x=>x.date<stored.asOf&&!stored.equity.some(y=>y.date===x.date));
 const last=live.equity.at(-1);
 const realized=live.closed.filter(x=>x.includePublic!=='NO'&&x.effectiveDate<=last.date).reduce((sum,x)=>sum+10000*x.returnPct,0);
 if(!Number.isFinite(last.realized)||Math.abs(realized-last.realized)>1e-5)throw Error('Live realized P&L fails full-precision reconciliation');
 return {source:'GOOGLE_SHEETS_READONLY',sourceDate:live.asOf,previousDate:stored.asOf,updated:live.asOf>stored.asOf,closedChanged:changed.length,closedRemoved:removed.length,activeChanged,frozenChanged,parityStatus:removed.length||changed.length||activeChanged||frozenChanged?'DRIFT':'UNCHANGED',activeTickers:live.active.map(x=>x.ticker),realizedMatches:true,checkedAt:live.checkedAt};
}
module.exports={fromRanges,getLiveSnapshot,compareImported,RANGES};
