'use strict';
// Native Google Sheets STAGING-only publisher. No production spreadsheet access.
// Publication != delivery. Does not send email or cut over the website.
const {STAGING_ID,classifyMetadata,newLease,acquireRequests,guardedBatch,releaseRequests}=require('./native-sheets-lease.cjs');
const {buildStagingWrites}=require('./staging-write-plan.cjs');
const {randomUUID}=require('node:crypto');
const FORMULAS=["'Open Positions'!I4:L4","'Equity History'!C2:F2","'Public Feed'!B7","'Public Feed'!A33"];
function createSheetsClient(credentials){
 if(!credentials)throw Error('STAGING_GOOGLE_CREDENTIALS_MISSING');
 const {google}=require('googleapis');
 const auth=new google.auth.GoogleAuth({credentials:typeof credentials==='string'?JSON.parse(credentials):credentials,
  scopes:['https://www.googleapis.com/auth/spreadsheets']});
 return google.sheets({version:'v4',auth});
}
async function readMeta(api){
 const r=await api.spreadsheets.get({spreadsheetId:STAGING_ID,fields:'spreadsheetId,developerMetadata',includeGridData:false});
 return classifyMetadata({spreadsheetId:r.data.spreadsheetId,developerMetadata:r.data.developerMetadata||[]});
}
async function readFormulas(api){
 const r=await api.spreadsheets.values.batchGet({spreadsheetId:STAGING_ID,ranges:FORMULAS,valueRenderOption:'FORMULA'});
 const v=r.data.valueRanges||[];
 if(v.length!==FORMULAS.length)throw Error('STAGING_FORMULA_SNAPSHOT_INCOMPLETE');
 return v.map(x=>x.values||[]);
}
function nextEquityRow(valueRanges,date){
 const values=valueRanges?.[0]?.values;
 if(!Array.isArray(values)||values[0]?.[0]!=='2026-10-19')throw Error('CLEAN_SLATE_INCEPTION_UNVERIFIED');
 const entries=values.map(x=>x?.[0]||'');
 let last=0;
 for(let i=0;i<entries.length;i++){
  const v=entries[i];
  if(v){if(i>0&&v<entries[last])throw Error('EQUITY_HISTORY_OUT_OF_ORDER');last=i}
  else if(entries.slice(i+1).some(Boolean))throw Error('GAPPED_EQUITY_HISTORY');
 }
 if(entries[last]===date)return {status:'ALREADY_DATED',rowIndex:last+1};
 if(entries[last]>date)throw Error('EQUITY_DATE_BACKDATED');
 if(last>=497)throw Error('EQUITY_HISTORY_AT_CAPACITY');
 // A2 has zero-based rowIndex1, the next empty is +1.
 return {status:'READY',rowIndex:last+2};
}
async function resolveEquity(api,date){
 const r=await api.spreadsheets.values.batchGet({spreadsheetId:STAGING_ID,
  ranges:["'Equity History'!A2:A499"],valueRenderOption:'FORMATTED_VALUE'});
 return nextEquityRow(r.data.valueRanges,date);
}
async function writePrivateStaging({api,manifest,positions,closed,timeEt,enabled,owner='engine2-shadow'}={}){
 if(enabled!=='YES')return {status:'BLOCKED',reason:'STAGING_WRITE_NOT_ENABLED',published:false};
 if(!api?.spreadsheets?.batchUpdate||!api?.spreadsheets?.values?.batchGet)
  return {status:'BLOCKED',reason:'STAGING_API_NOT_CONFIGURED',published:false};
 const bad=(reason)=>({status:'BLOCKED',reason,published:false});
 const date=manifest?.payload?.date;
 let baseline,formulas,slot,plan;
 try{
  baseline=await readMeta(api);
  if(baseline.status!=='PASS')return bad(baseline.reason);
  formulas=await readFormulas(api);
  slot=await resolveEquity(api,date);
  if(slot.status==='ALREADY_DATED')return bad('SESSION_DATE_ALREADY_IN_STAGING');
  plan=buildStagingWrites({spreadsheetId:STAGING_ID,manifest,positions,closed,timeEt,equityRowIndex:slot.rowIndex});
 }catch(e){return bad('PREFLIGHT_FAILED:'+e.message)}
 const mine=newLease({owner:owner+'|'+date,nonce:randomUUID()});
 const acquisition=acquireRequests({state:baseline,newLeaseValue:mine});
 if(acquisition.status!=='READY_FOR_ACQUIRE')return bad(acquisition.reason);
 try{await api.spreadsheets.batchUpdate({spreadsheetId:STAGING_ID,requestBody:{requests:acquisition.requests}})}
 catch{return bad('NATIVE_LEASE_ACQUIRE_FAILED')}
 let fresh;
 try{
  fresh=await readMeta(api);
  if(fresh.status!=='PASS'||fresh.lease!==mine||fresh.fence!==baseline.fence)throw Error('LEASE_OR_FENCE_MOVED');
  // Formula snapshot taken before lease; contents must still be unchanged.
  if(JSON.stringify(await readFormulas(api))!==JSON.stringify(formulas))throw Error('PROTECTED_FORMULA_CHANGED');
  if((await resolveEquity(api,date)).rowIndex!==slot.rowIndex)throw Error('EQUITY_SLOT_MOVED');
 }catch{return bad('POST_LEASE_REVALIDATION_FAILED')}
 const renewed=newLease({owner:owner+'|'+date,nonce:randomUUID()});
 const revision='engine2-staging:'+date+':'+randomUUID();
 try{
  const batch=guardedBatch({state:fresh,ownedLease:mine,newLeaseValue:renewed,newRevision:revision,financialRequests:plan.requests});
  await api.spreadsheets.batchUpdate({spreadsheetId:STAGING_ID,requestBody:{requests:batch}});
 }catch{return bad('ATOMIC_STAGING_BATCH_FAILED_UNKNOWN_OUTCOME')}
 try{
  const committed=await readMeta(api);
  if(committed.status!=='PASS'||committed.fence!==revision||committed.lease!==renewed)throw Error('FENCE_READBACK_MISMATCH');
  const after=await readFormulas(api);
  if(JSON.stringify(after)!==JSON.stringify(formulas))throw Error('PROTECTED_FORMULA_CHANGED');
  const rows=await api.spreadsheets.values.batchGet({spreadsheetId:STAGING_ID,
   ranges:["'Public Feed'!B2:B5","'Public Feed'!A14:A23","'Public Feed'!B11"],valueRenderOption:'UNFORMATTED_VALUE'});
  const v=rows.data.valueRanges||[];
  if(v[0]?.values?.[0]?.[0]!==date||v[2]?.values?.[0]?.[0]!==manifest.fingerprint)throw Error('STAGING_READBACK_MISMATCH');
  const found=(v[1]?.values||[]).map(x=>x?.[0]).filter(Boolean).sort();
  const expected=positions.map(x=>x.ticker).sort();
  if(JSON.stringify(found)!==JSON.stringify(expected))throw Error('STAGING_HOLDINGS_MISMATCH');
  await api.spreadsheets.batchUpdate({spreadsheetId:STAGING_ID,
    requestBody:{requests:releaseRequests({state:committed,ownedLease:renewed})}});
  return {status:'STAGING_COMMITTED_READBACK_PASS',stagingId:STAGING_ID,
   runId:manifest.payload.runId,date,snapshotId:manifest.fingerprint,
   published:false,emailDelivered:false,websiteParityVerified:false};
 }catch{return bad('STAGING_READBACK_OR_RELEASE_UNVERIFIED')}
}
module.exports={STAGING_ID,FORMULAS,createSheetsClient,readMeta,readFormulas,nextEquityRow,resolveEquity,writePrivateStaging};
