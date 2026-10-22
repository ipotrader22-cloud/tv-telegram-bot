'use strict';
// Deterministic model write plan for the PRIVATE Engine2 staging workbook ONLY.
// The caller must wrap ALL requests with native-sheets-lease.guardedBatch and
// then reread formulas/membership/HTML/API before authorizing any email.
const {STAGING_ID,ensureStaging}=require('./native-sheets-lease.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const ids={open:968436309,closed:650700609,portfolio:1474454824,feed:1441454616,equity:177001100};
const str=s=>({userEnteredValue:{stringValue:String(s)}});
const num=n=>({userEnteredValue:{numberValue:n}});
const form=f=>({userEnteredValue:{formulaValue:f}});
const blank=()=>({});
function rect(sheetId,row,col,values){
 if(!values.length||values.some(r=>r.length!==values[0].length))throw Error('INVALID_RECTANGLE');
 return {updateCells:{range:{sheetId,startRowIndex:row,endRowIndex:row+values.length,
    startColumnIndex:col,endColumnIndex:col+values[0].length},
   rows:values.map(v=>({values:v})),fields:'userEnteredValue'}};
}
function validateInput({spreadsheetId,manifest,positions,closed,equityRowIndex,timeEt}={}){
 ensureStaging(spreadsheetId);
 if(manifest?.status!=='PUBLICATION_PLAN_ONLY'||manifest.payload?.epoch!==EPOCH||
    !/^\d{4}-\d{2}-\d{2}$/.test(manifest.payload?.date||'')||manifest.payload.date<EPOCH||
    !Number.isInteger(equityRowIndex)||equityRowIndex<2||equityRowIndex>=499||
    !/^\d{2}:\d{2} ET$/.test(timeEt||''))throw Error('INVALID_STAGING_SNAPSHOT');
 if(!Array.isArray(positions)||positions.length>10||!Array.isArray(closed)||closed.length>150)throw Error('INVALID_LEDGER_SIZE');
 const expected=manifest.payload.active.map(x=>x.ticker).sort(),actual=positions.map(x=>x.ticker).sort();
 if(JSON.stringify(expected)!==JSON.stringify(actual)||new Set(actual).size!==actual.length)throw Error('MANIFEST_MEMBERSHIP_MISMATCH');
 for(const p of positions)if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(p.ticker)||!['NASDAQ','NYSE','AMEX'].includes(p.exchange)||
    !p.entryDate||p.entryDate<EPOCH||p.fullReviewDate!==manifest.payload.date||
    !Number.isFinite(p.entryPrice)||p.entryPrice<=0||!Number.isFinite(p.currentPrice)||p.currentPrice<=0||
    !Number.isInteger(p.currentScore)||p.currentScore<70||p.currentScore>100)throw Error('MODEL_POSITION_NOT_CERTIFIED');
 const lotIds=new Set();
 for(const c of closed){
  const id=c.ticker+'|'+c.entryDate;
  if(!c.ticker||!c.entryDate||c.entryDate<EPOCH||c.exitDate>manifest.payload.date||lotIds.has(id)||
   !['YES','NO'].includes(c.includePublic)||!c.effectiveDate||!Number.isFinite(c.entryPrice)||c.entryPrice<=0||
   !Number.isFinite(c.exitPrice)||c.exitPrice<=0)throw Error('CLOSED_QR_OR_LOT_INVALID');
  lotIds.add(id);
 }
 for(const p of positions)if(lotIds.has(p.ticker+'|'+p.entryDate))throw Error('OVERLAPPING_OPEN_CLOSED');
}
function buildStagingWrites(input={}){
 validateInput(input);
 const {manifest,positions,closed,equityRowIndex,timeEt}=input;
 const p=manifest.payload,byTicker=new Map(positions.map(x=>[x.ticker,x]));
 const openTop=[],openSide=[],openMath=[],portTop=[],portMath=[],portStatus=[],feedActive=[];
 for(let i=0;i<10;i++){
  const opRow=4+i,portRow=8+i;
  openMath.push([
   form('=IFERROR(GOOGLEFINANCE(B'+opRow+'&":"&C'+opRow+',"price"),"")'),
   form('=IF(I'+opRow+'="","",I'+opRow+'*G'+opRow+')'),
   form('=IF(J'+opRow+'="","",J'+opRow+'-H'+opRow+')'),
   form('=IFERROR((I'+opRow+'-F'+opRow+')/F'+opRow+',"")')]);
  portMath.push([
   form('=IFERROR(J'+portRow+'/($P$6+$P$5),0)'),
   form('=IF(C'+portRow+'="","",XLOOKUP(C'+portRow+',\'Open Positions\'!$C$4:$C$194,\'Open Positions\'!$F$4:$F$194,""))'),
   form('=IF(C'+portRow+'="","",XLOOKUP(C'+portRow+',\'Open Positions\'!$C$4:$C$194,\'Open Positions\'!$G$4:$G$194,""))'),
   form('=F'+portRow+'*G'+portRow),
   form('=IFERROR(GOOGLEFINANCE(B'+portRow+'&":"&C'+portRow+',"price"),"")'),
   form('=IF(I'+portRow+'="","",G'+portRow+'*I'+portRow+')'),
   form('=IF(J'+portRow+'="","",J'+portRow+'-H'+portRow+')'),
   form('=IFERROR((I'+portRow+'-F'+portRow+')/F'+portRow+',"")')]);
  const a=p.active[i],lot=a&&byTicker.get(a.ticker);
  if(!lot){
   openTop.push(Array.from({length:8},blank));
   openSide.push(Array.from({length:6},blank));
   portTop.push(Array.from({length:4},blank));
   portStatus.push([blank()]);
   feedActive.push(Array.from({length:9},blank));
   continue;
  }
  const n=3+i; // zero-indexed Open Positions row4...
  const shares=Number.isInteger(lot.shares)&&lot.shares>=0?lot.shares:Math.floor(10000/lot.entryPrice);
  openTop.push([str(lot.entryDate),str(lot.exchange),str(lot.ticker),num(lot.entryScore||lot.currentScore),
    str('Active Portfolio'),num(lot.entryPrice),num(shares),num(shares*lot.entryPrice)]);
  openSide.push([num(0.1),str(lot.fullReviewDate),str('KEEP — validated model review'),str(a.note),
    str(lot.quoteSourceId||'INDICATIVE_MODEL_REFERENCE'),blank()]);
  portTop.push([num(i+1),str(lot.exchange),str(lot.ticker),num(lot.currentScore)]);
  portStatus.push([str('Active Portfolio')]);
  feedActive.push([str(lot.ticker),str(lot.exchange),num(lot.currentScore),str(lot.entryDate),
    form("=TEXT('Open Positions'!F"+(n+1)+',"$0.00")'),
    form("=TEXT('Open Positions'!I"+(n+1)+',"$0.00")'),
    form("=TEXT('Open Positions'!L"+(n+1)+',"0.00%")'),
    str(lot.fullReviewDate),str(a.note)]);
 }
 const requests=[
  rect(ids.open,3,0,openTop),
  rect(ids.open,3,8,openMath),
  rect(ids.open,3,12,openSide),
  rect(ids.portfolio,7,0,portTop),
  rect(ids.portfolio,7,4,portMath),
  rect(ids.portfolio,7,12,portStatus),
  rect(ids.feed,13,0,feedActive)
 ];
 if(closed.length){
  const rows=closed.map((c,i)=>{
   const sheetRow=4+i,shares=Number.isInteger(c.shares)&&c.shares>=0?c.shares:Math.floor(10000/c.entryPrice);
   return [str(c.exitDate),str(c.exitTime||''),str(c.ticker),str(c.exchange||''),
    str(c.entryDate),num(c.entryPrice),num(shares),
    form('=F'+sheetRow+'*G'+sheetRow),num(c.exitPrice),
    form('=I'+sheetRow+'*G'+sheetRow),form('=J'+sheetRow+'-H'+sheetRow),
    form('=IFERROR((I'+sheetRow+'-F'+sheetRow+')/F'+sheetRow+',0)'),
    num(c.lastScore||0),str(c.reason||'MODEL EXIT'),str(p.runId),str(c.note||'Model close, not broker execution.'),
    str(c.includePublic),str(c.effectiveDate)];
  });
  requests.push(rect(ids.closed,3,0,rows));
 }
 const updates=[
  [ids.feed,1,1,str(p.date)],[ids.feed,2,1,str(timeEt)],[ids.feed,3,1,str('Verified Engine 2 model review; research/model portfolio only')],
  [ids.feed,4,1,num(positions.length)],[ids.feed,5,1,num(0)],
  [ids.feed,7,1,str('TWS verified LAST where available; Yahoo indicative 1m fallback')],
  [ids.feed,10,0,str('engine2_snapshot_id')],[ids.feed,10,1,str(manifest.fingerprint)],
  [ids.portfolio,2,1,str(p.date)]
 ];
 for(const [sheetId,row,col,value] of updates)requests.push(rect(sheetId,row,col,[[value]]));
 const row=equityRowIndex,oneBased=row+1;
 requests.push(rect(ids.equity,row,0,[[
  str(p.date),str(timeEt),
  form("=10000*IFERROR(SUM(FILTER('Closed Trades'!$L$4:$L,'Closed Trades'!$R$4:$R<=A"+oneBased+
    ",'Closed Trades'!$C$4:$C<>\"\",'Closed Trades'!$Q$4:$Q<>\"NO\")),0)"),
  num(p.model.unrealized),form('=C'+oneBased+'+D'+oneBased),
  form('=100000+E'+oneBased),num(positions.length)
 ]]));
 return {status:'STAGING_WRITE_PLAN',writeApproved:false,targetSpreadsheetId:STAGING_ID,
  runId:p.runId,manifestFingerprint:manifest.fingerprint,
  requests,protectedFormulaColumns:['Open Positions!I:L','Equity History!C,E,F','Public Feed!B7,A33']};
}
module.exports={buildStagingWrites,validateInput,rect};
