'use strict';
/**
 * Guarded Google Sheets writer primitive for VIXALE. No implicit executions.
 * Callers supply fully validated portfolio requests after reading the live sheet.
 * Never use values.update, append, or a separate financial write outside commit().
 */
const crypto = require('node:crypto');
const {session} = require('./swing-market-calendar');
const LEASE_ID = 1030100, FENCE_ID = 1030101;
const LEASE_KEY = 'VIXALE_SWING_LEASE_V1', FENCE_KEY = 'VIXALE_SWING_FENCE_V1';
const TTL_MS = 120000;
const WINDOWS = Object.freeze({
  opening: [570,590], review: [600,620], recovery: [625,635],
  target: null,
});
function block(message){ const e=new Error(message);e.code='VIXALE_BLOCKED';throw e; }
function nyParts(now){
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:parts.year+'-'+parts.month+'-'+parts.day, minutes:Number(parts.hour)*60+Number(parts.minute)};
}
function assertWriteWindow(kind, now=new Date()){
  if(!(now instanceof Date) || Number.isNaN(now.getTime())) block('Invalid clock');
  const {date,minutes}=nyParts(now);
  if(!session(date).open) block('NYSE is closed');
  const range = kind==='target'
    ? (minutes>=640 && minutes<=1430 && minutes%60>=40 && minutes%60<50
       ? [minutes-minutes%60+40,minutes-minutes%60+50] : null)
    : WINDOWS[kind];
  if(!range || minutes<range[0] || minutes>=range[1]-2) block('Outside safe '+kind+' writer window');
  return {date, minutes};
}
function readRecords(sheet){
  const records = sheet?.developerMetadata;
  if(!Array.isArray(records)) block('developerMetadata not returned');
  const select=(id,key)=>{
    const byId=records.filter(x=>x.metadataId===id);
    const byKey=records.filter(x=>x.metadataKey===key);
    if(byId.some(x=>x.metadataKey!==key) || byKey.some(x=>x.metadataId!==id)) block('Metadata ID/key collision');
    if(byId.length>1 || byKey.length>1) block('Duplicate developerMetadata');
    const x=byId[0]||null;
    if(x && (x.visibility!=='DOCUMENT' || !x.location?.spreadsheet)) block('Metadata scope mismatch');
    return x;
  };
  const fence=select(FENCE_ID,FENCE_KEY),lease=select(LEASE_ID,LEASE_KEY);
  if(!fence || typeof fence.metadataValue!=='string' || !fence.metadataValue) block('Missing fence');
  return {fence:fence.metadataValue,lease:lease?.metadataValue??null};
}
function parsedLease(value){
  let v;try{v=JSON.parse(value);}catch{block('Invalid lease JSON');}
  if(!v || typeof v.owner!=='string' || !v.owner || typeof v.nonce!=='string' || !v.nonce ||
    typeof v.expiresAt!=='string' || !/^\d{4}-\d\d-\d\dT/.test(v.expiresAt) ||
    !Number.isFinite(Date.parse(v.expiresAt))) block('Invalid lease fields');
  return v;
}
function create(id,key,value){
  return {createDeveloperMetadata:{developerMetadata:{
    metadataId:id,metadataKey:key,metadataValue:value,location:{spreadsheet:true},visibility:'DOCUMENT'
  }}};
}
function del(key,value){
  return {deleteDeveloperMetadata:{dataFilter:{developerMetadataLookup:{
    metadataKey:key,metadataValue:value
  }}}};
}
class GuardedWriter {
  constructor({sheets,spreadsheetId,kind,owner,clock=()=>new Date()}){
    if(!sheets?.spreadsheets?.get || !sheets?.spreadsheets?.batchUpdate ||
       !spreadsheetId || !owner || !Object.hasOwn(WINDOWS,kind)) block('Invalid writer configuration');
    this.sheets=sheets;this.id=spreadsheetId;this.kind=kind;this.owner=owner;this.clock=clock;this.owned=null;
  }
  async state(){
    const r=await this.sheets.spreadsheets.get({
      spreadsheetId:this.id,fields:'developerMetadata(metadataId,metadataKey,metadataValue,visibility,location)',includeGridData:false
    });
    return readRecords(r.data);
  }
  async batch(requests){
    return this.sheets.spreadsheets.batchUpdate({
      spreadsheetId:this.id,requestBody:{requests,includeSpreadsheetInResponse:false}
    });
  }
  async acquire(){
    assertWriteWindow(this.kind,this.clock());
    const s=await this.state();
    if(s.lease && Date.parse(parsedLease(s.lease).expiresAt)>this.clock().getTime())
      block('Lease already held; defer');
    const lease=JSON.stringify({owner:this.owner,nonce:crypto.randomUUID(),
      expiresAt:new Date(this.clock().getTime()+TTL_MS).toISOString()});
    const requests=s.lease?[del(LEASE_KEY,s.lease),create(LEASE_ID,LEASE_KEY,lease)]
      :[create(LEASE_ID,LEASE_KEY,lease)];
    await this.batch(requests);
    const after=await this.state();
    if(after.lease!==lease) block('Lease acquisition readback failed');
    this.owned=lease;
    return {fence:after.fence,lease};
  }
  async commit({requests,validateFresh,validateQuotes}){
    if(!this.owned) block('Acquire lease first');
    if(!Array.isArray(requests) || requests.length===0) block('No financial requests');
    if(typeof validateFresh!=='function' || typeof validateQuotes!=='function')
      block('Live state and quote validators required');
    // The caller's validators must re-read exact lot membership, Q/R, formulas, quotes
    // and build only coherent native batchUpdate financial requests.
    await validateFresh();
    await validateQuotes();
    assertWriteWindow(this.kind,this.clock());
    const before=await this.state();
    if(before.lease!==this.owned) block('Lease ownership changed');
    const expiry=Date.parse(parsedLease(this.owned).expiresAt);
    if(expiry<=this.clock().getTime()+5000) block('Lease expires too soon: reacquire and reread');
    const nextLease=JSON.stringify({...parsedLease(this.owned),
      expiresAt:new Date(this.clock().getTime()+TTL_MS).toISOString()});
    const nextFence=crypto.randomUUID();
    const batch=[
      del(FENCE_KEY,before.fence),create(FENCE_ID,FENCE_KEY,nextFence),
      del(LEASE_KEY,this.owned),create(LEASE_ID,LEASE_KEY,nextLease),
      ...requests
    ];
    // Single atomic Sheets batch. On unknown outcome do not blindly retry.
    await this.batch(batch);
    const after=await this.state();
    if(after.fence!==nextFence || after.lease!==nextLease) block('Commit readback uncertain: reconcile');
    this.owned=nextLease;
    return {fence:nextFence,lease:nextLease};
  }
  async release(){
    if(!this.owned) return false;
    const current=await this.state();
    if(current.lease!==this.owned){this.owned=null;return false;}
    await this.batch([del(LEASE_KEY,this.owned)]);
    const after=await this.state();
    if(after.lease===this.owned) block('Release uncertain');
    this.owned=null;return true;
  }
}
module.exports={GuardedWriter,assertWriteWindow,readRecords,parsedLease,LEASE_ID,FENCE_ID,
  LEASE_KEY,FENCE_KEY,create,del};
