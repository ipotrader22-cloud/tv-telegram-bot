'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {GuardedWriter,readRecords,assertWriteWindow,FENCE_KEY,LEASE_KEY}=require('../scripts/vixale-guarded-sheets-writer');
const fence=(v='f0')=>({metadataId:1030101,metadataKey:FENCE_KEY,metadataValue:v,visibility:'DOCUMENT',location:{spreadsheet:true}});
const lease=(v)=>({metadataId:1030100,metadataKey:LEASE_KEY,metadataValue:v,visibility:'DOCUMENT',location:{spreadsheet:true}});
const at=(s)=>new Date(s);
function fake(){
  const metadata=[fence()];
  const batches=[];
  const sheets={spreadsheets:{
    get:async()=>({data:{developerMetadata:structuredClone(metadata)}}),
    batchUpdate:async({requestBody})=>{
      // emulate atomic ordered Sheets semantics incl. duplicate explicit metadata ID.
      const next=structuredClone(metadata);
      for(const request of requestBody.requests){
        if(request.deleteDeveloperMetadata){
          const l=request.deleteDeveloperMetadata.dataFilter.developerMetadataLookup;
          const idx=next.findIndex(x=>x.metadataKey===l.metadataKey && x.metadataValue===l.metadataValue);
          if(idx>=0) next.splice(idx,1);
        } else if(request.createDeveloperMetadata){
          const m=request.createDeveloperMetadata.developerMetadata;
          if(next.some(x=>x.metadataId===m.metadataId)) throw Error('HTTP 400 duplicate metadata ID; atomic rollback');
          next.push(m);
        }
      }
      metadata.splice(0,metadata.length,...next);
      batches.push(requestBody.requests);
    }
  }};
  return {sheets,metadata,batches};
}
const t=()=>at('2026-10-14T14:05:00.000Z'); // 10:05 EDT
test('calendar guard blocks late minutes and NYSE holidays',()=>{
  assert.doesNotThrow(()=>assertWriteWindow('review',t()));
  assert.throws(()=>assertWriteWindow('review',at('2026-10-14T14:18:00Z')),/Outside safe/);
  assert.throws(()=>assertWriteWindow('review',at('2026-12-25T15:05:00Z')),/NYSE is closed/);
});
test('metadata fence is mandatory and duplicates block',()=>{
  assert.throws(()=>readRecords({developerMetadata:[]}),/Missing fence/);
  assert.throws(()=>readRecords({developerMetadata:[fence(),fence()]}),/Duplicate/);
});
test('one guarded commit contains guard operations before financial requests',async()=>{
  const db=fake(),w=new GuardedWriter({sheets:db.sheets,spreadsheetId:'s',owner:'test',kind:'review',clock:t});
  await w.acquire();
  await w.commit({requests:[{updateCells:{start:{sheetId:42,rowIndex:1,columnIndex:1},rows:[],fields:'userEnteredValue'}}],
    validateFresh:async()=>{},validateQuotes:async()=>{}});
  const batch=db.batches[1];
  assert.deepEqual(batch.slice(0,4).map(x=>Object.keys(x)[0]),
    ['deleteDeveloperMetadata','createDeveloperMetadata','deleteDeveloperMetadata','createDeveloperMetadata']);
  assert.equal(batch.length,5);
  assert.equal(await w.release(),true);
});
test('stale expected fence causes atomic rollback of financial cells',async()=>{
  const db=fake(),w=new GuardedWriter({sheets:db.sheets,spreadsheetId:'s',owner:'test',kind:'review',clock:t});
  await w.acquire();
  const originalBatch=db.sheets.spreadsheets.batchUpdate;
  db.sheets.spreadsheets.batchUpdate=async(arg)=>{
    if(arg.requestBody.requests.length===5){
      db.metadata.find(x=>x.metadataId===1030101).metadataValue='concurrent-revision';
    }
    return originalBatch(arg);
  };
  await assert.rejects(()=>w.commit({requests:[{updateCells:{}}],validateFresh:async()=>{},validateQuotes:async()=>{}}),/duplicate metadata ID/);
  assert.equal(db.batches.length,1);
  assert.equal(db.metadata.find(x=>x.metadataId===1030101).metadataValue,'concurrent-revision');
});
test('active lease prevents new writer takeover',async()=>{
  const db=fake(),w=new GuardedWriter({sheets:db.sheets,spreadsheetId:'s',owner:'first',kind:'review',clock:t});
  await w.acquire();
  const other=new GuardedWriter({sheets:db.sheets,spreadsheetId:'s',owner:'other',kind:'review',clock:t});
  await assert.rejects(()=>other.acquire(),/Lease already held/);
});
test('commit fails closed if live validators missing',async()=>{
  const db=fake(),w=new GuardedWriter({sheets:db.sheets,spreadsheetId:'s',owner:'test',kind:'review',clock:t});
  await w.acquire();
  await assert.rejects(()=>w.commit({requests:[{updateCells:{}}]}),/validators required/);
  assert.equal(db.batches.length,1);
});
