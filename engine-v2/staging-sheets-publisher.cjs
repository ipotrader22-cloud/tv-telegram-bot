'use strict';
// Private staging only. The same immutable fingerprint recovers ambiguous writes.
const {STAGING_ID,classifyMetadata,newLease,acquireRequests,guardedBatch,releaseRequests}=require('./native-sheets-lease.cjs');
const {buildStagingWrites}=require('./staging-write-plan.cjs');
const {randomUUID}=require('node:crypto');
const FORMULAS=["'Open Positions'!I4:L4","'Equity History'!C2:F2","'Public Feed'!B7","'Public Feed'!A33"];
const TITLES={968436309:'Open Positions',650700609:'Closed Trades',1474454824:'Portfolio',1441454616:'Public Feed',177001100:'Equity History'};
const CASH='=TEXT((100000+INDEX(FILTER(\'Equity History\'!C2:C,\'Equity History\'!A2:A<>""),ROWS(FILTER(\'Equity History\'!A2:A,\'Equity History\'!A2:A<>"")))-10000*B5)/INDEX(FILTER(\'Equity History\'!F2:F,\'Equity History\'!A2:A<>""),ROWS(FILTER(\'Equity History\'!A2:A,\'Equity History\'!A2:A<>""))),"0.0%")';
const CLOSED='=IFERROR(FILTER({\'Closed Trades\'!C4:C,\'Closed Trades\'!E4:E,TEXT(\'Closed Trades\'!F4:F,"$0.00"),\'Closed Trades\'!A4:A,TEXT(\'Closed Trades\'!I4:I,"$0.00"),TEXT(\'Closed Trades\'!L4:L,"0.00%"),\'Closed Trades\'!M4:M,\'Closed Trades\'!N4:N},\'Closed Trades\'!C4:C<>"",\'Closed Trades\'!Q4:Q<>"NO"),"")';
function createSheetsClient(credentials){
 if(!credentials)throw Error('STAGING_GOOGLE_CREDENTIALS_MISSING');
 const {google}=require('googleapis');
 const auth=new google.auth.GoogleAuth({credentials:typeof credentials==='string'?JSON.parse(credentials):credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});
 return google.sheets({version:'v4',auth});
}
async function readMeta(api){
 const r=await api.spreadsheets.get({spreadsheetId:STAGING_ID,fields:'spreadsheetId,developerMetadata',includeGridData:false});
 return classifyMetadata({spreadsheetId:r.data.spreadsheetId,developerMetadata:r.data.developerMetadata||[]});
}
async function ranges(api,ranges,valueRenderOption='FORMULA'){
 const r=await api.spreadsheets.values.batchGet({spreadsheetId:STAGING_ID,ranges,valueRenderOption});
 if(r.data.valueRanges?.length!==ranges.length)throw Error('STAGING_READ_INCOMPLETE');
 return r.data.valueRanges;
}
async function readFormulas(api){return (await ranges(api,FORMULAS)).map(x=>x.values||[])}
function protectedFormulas(v){
 if(v[2]?.[0]?.[0]!==CASH||v[3]?.[0]?.[0]!==CLOSED||
    !v[0]?.[0]?.every(x=>typeof x==='string'&&x.startsWith('='))||v[0]?.[0]?.length!==4||
    !v[1]?.[0]?.[0]?.includes("'Closed Trades'!$Q$4:$Q<>\"NO\"" )||v[1]?.[0]?.[2]!=='=C2+D2'||v[1]?.[0]?.[3]!=='=100000+E2')throw Error('PROTECTED_FORMULAS_UNVERIFIED');
}
function nextEquityRow(valueRanges,date){
 const values=valueRanges?.[0]?.values;
 if(!Array.isArray(values)||values[0]?.[0]!=='2026-10-19')throw Error('CLEAN_SLATE_INCEPTION_UNVERIFIED');
 const entries=values.map(x=>x?.[0]||'');let last=0;
 for(let i=0;i<entries.length;i++){
  const v=entries[i];
  if(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||(i>0&&v<=entries[last]))throw Error('EQUITY_HISTORY_OUT_OF_ORDER');last=i}
  else if(entries.slice(i+1).some(Boolean))throw Error('GAPPED_EQUITY_HISTORY');
 }
 if(entries[last]===date)return {status:'ALREADY_DATED',rowIndex:last+1};
 if(entries[last]>date)throw Error('EQUITY_DATE_BACKDATED');
 if(last>=497)throw Error('EQUITY_HISTORY_AT_CAPACITY');
 return {status:'READY',rowIndex:last+2};
}
async function resolveEquity(api,date){return nextEquityRow(await ranges(api,["'Equity History'!A2:A499"],'FORMATTED_VALUE'),date)}
function col(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function planRange(req){const r=req.updateCells.range;return "'"+TITLES[r.sheetId]+"'!"+col(r.startColumnIndex)+(r.startRowIndex+1)+':'+col(r.endColumnIndex-1)+r.endRowIndex}
const cellValue=x=>x?.userEnteredValue?.formulaValue??x?.userEnteredValue?.stringValue??x?.userEnteredValue?.numberValue??'';
async function verifySheetPlan({api,plan,manifest,positions,closed,slot}){
 protectedFormulas(await readFormulas(api));
 const read=await ranges(api,plan.requests.map(planRange));
 for(let i=0;i<plan.requests.length;i++){
  const expected=plan.requests[i].updateCells.rows;
  for(let r=0;r<expected.length;r++)for(let c=0;c<expected[r].values.length;c++){
   if((read[i].values?.[r]?.[c]??'')!==cellValue(expected[r].values[c]))throw Error('STAGING_CELL_MISMATCH:'+planRange(plan.requests[i]));
  }
 }
 const tail=await ranges(api,["'Open Positions'!C14:C194","'Closed Trades'!C"+(4+closed.length)+':C994'], 'UNFORMATTED_VALUE');
 if(tail.some(x=>(x.values||[]).some(r=>r.some(Boolean))))throw Error('UNEXPECTED_STAGING_LOTS');
 const n=slot.rowIndex+1;
 const values=await ranges(api,["'Equity History'!C"+n+':G'+n,"'Public Feed'!B7"],'UNFORMATTED_VALUE');
 const row=values[0].values?.[0],m=manifest.payload.model;
 if(!row||[m.realized,m.unrealized,m.total,m.equity,m.activeCount].some((x,i)=>typeof row[i]!=='number'||Math.abs(row[i]-x)>.01))throw Error('STAGING_MODEL_ACCOUNTING_MISMATCH');
 const cash=Number(String(values[1].values?.[0]?.[0]).replace('%',''));
 const expectedCash=(100000+m.realized-10000*m.activeCount)/m.equity*100;
 if(!Number.isFinite(cash)||Math.abs(cash-expectedCash)>.051)throw Error('STAGING_CASH_MISMATCH');
 return {snapshotDate:manifest.payload.date,activeCount:positions.length,snapshotId:manifest.fingerprint,
  tickers:positions.map(x=>x.ticker),reviewDates:positions.map(x=>x.fullReviewDate),protectedFormulasVerified:true,model:m};
}
async function writePrivateStaging({api,manifest,positions,closed,timeEt,enabled,owner='engine2-shadow'}={}){
 const bad=reason=>({status:'BLOCKED',reason,published:false});
 if(enabled!=='YES')return bad('STAGING_WRITE_NOT_ENABLED');
 if(!api?.spreadsheets?.batchUpdate||!api?.spreadsheets?.values?.batchGet)return bad('STAGING_API_NOT_CONFIGURED');
 const date=manifest?.payload?.date,revision='engine2-staging:'+manifest?.fingerprint;
 let mine=null;
 try{
  const baseline=await readMeta(api);if(baseline.status!=='PASS')return bad(baseline.reason);
  const formulas=await readFormulas(api);protectedFormulas(formulas);
  let slot=await resolveEquity(api,date);
  const plan=buildStagingWrites({spreadsheetId:STAGING_ID,manifest,positions,closed,timeEt,equityRowIndex:slot.rowIndex});
  const result=async()=>({status:'STAGING_COMMITTED_READBACK_PASS',stagingId:STAGING_ID,runId:manifest.payload.runId,date,snapshotId:manifest.fingerprint,
   sheet:await verifySheetPlan({api,plan,manifest,positions,closed,slot}),published:false,emailDelivered:false,websiteParityVerified:false});
  // A timeout after the atomic batch must recover without overwriting the session.
  if(slot.status==='ALREADY_DATED'){
   if(baseline.fence!==revision)throw Error('SESSION_DATE_ALREADY_IN_STAGING_CONFLICT');
   return await result();
  }
  mine=newLease({owner:owner+'|'+date,nonce:randomUUID()});
  const acquire=acquireRequests({state:baseline,newLeaseValue:mine});
  if(acquire.status!=='READY_FOR_ACQUIRE')return bad(acquire.reason);
  await api.spreadsheets.batchUpdate({spreadsheetId:STAGING_ID,requestBody:{requests:acquire.requests}});
  const fresh=await readMeta(api);
  if(fresh.status!=='PASS'||fresh.lease!==mine||fresh.fence!==baseline.fence)throw Error('LEASE_OR_FENCE_MOVED');
  if(JSON.stringify(await readFormulas(api))!==JSON.stringify(formulas))throw Error('PROTECTED_FORMULA_CHANGED');
  if((await resolveEquity(api,date)).rowIndex!==slot.rowIndex)throw Error('EQUITY_SLOT_MOVED');
  const prior=await ranges(api,["'Closed Trades'!A4:R153"], 'FORMULA');
  const existing=(prior[0].values||[]).filter(row=>row[2]);
  const target=plan.requests.find(x=>x.updateCells.range.sheetId===650700609)?.updateCells.rows||[];
  if(existing.length>closed.length)throw Error('IMMUTABLE_CLOSED_LOT_REMOVED');
  for(let i=0;i<existing.length;i++)for(let c=0;c<18;c++)if((existing[i][c]??'')!==cellValue(target[i]?.values[c]))throw Error('IMMUTABLE_CLOSED_LOT_CHANGED');
  const renewed=newLease({owner:owner+'|'+date,nonce:randomUUID()});
  const batch=guardedBatch({state:fresh,ownedLease:mine,newLeaseValue:renewed,newRevision:revision,financialRequests:plan.requests});
  // Retain renewed ownership even when the response is lost.
  mine=renewed;
  await api.spreadsheets.batchUpdate({spreadsheetId:STAGING_ID,requestBody:{requests:batch}});
  const committed=await readMeta(api);
  if(committed.status!=='PASS'||committed.fence!==revision||committed.lease!==mine)throw Error('FENCE_READBACK_MISMATCH');
  return await result();
 }catch(e){return bad(e.message)}
 finally{
  // Release only our exact lease; never delete another writer's lock.
  if(mine)try{const state=await readMeta(api);if(state.lease===mine)await api.spreadsheets.batchUpdate({spreadsheetId:STAGING_ID,requestBody:{requests:releaseRequests({state,ownedLease:mine})}})}catch{}
 }
}
module.exports={STAGING_ID,FORMULAS,CASH,CLOSED,createSheetsClient,readMeta,readFormulas,nextEquityRow,resolveEquity,verifySheetPlan,writePrivateStaging,planRange,cellValue};
