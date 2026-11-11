'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {encodeEvidence,decodeEvidence}=require('./evidence-storage.cjs');
const {hash}=require('./delayed-model-policy.cjs');
test('legacy evidence remains readable and unchanged',()=>{
 const old={date:'2026-11-06',items:[{ticker:'AMD',score:75}]};
 assert.equal(encodeEvidence(old),old);assert.equal(decodeEvidence(old),old);
 assert.equal(decodeEvidence(null),null);
});
test('full 518-stock evidence roundtrips without losing bars, order or immutable hashes',()=>{
 const value={date:'2026-11-11',stocks:Array.from({length:518},(_,i)=>({ticker:'T'+i,
  rawHash:'a'.repeat(64),bars:Array.from({length:200},(_,j)=>({date:j,open:100,high:102,low:99,close:101,volume:1000}))}))};
 const before=hash(value),packed=encodeEvidence(value);
 assert.equal(packed.__vixaleEvidenceEncoding,'gzip-json-v1');
 assert.ok(JSON.stringify(packed).length<JSON.stringify(value).length/8);
 const restored=decodeEvidence(JSON.parse(JSON.stringify(packed)));
 assert.deepEqual(restored,value);assert.equal(hash(restored),before);
});
test('corrupt or oversized compressed evidence fails closed',()=>{
 const encoded=encodeEvidence({data:'x'.repeat(300000)});
 for(const change of [x=>x.sha256='0'.repeat(64),x=>x.bytes--,x=>x.bytes=100*1024*1024,
  x=>x.data=x.data.slice(0,-8),x=>x.__vixaleEvidenceEncoding='unknown',x=>x.extra=true]){
  const bad={...encoded};change(bad);assert.throws(()=>decodeEvidence(bad),/EVIDENCE_STORAGE_INVALID/);
 }
 assert.throws(()=>encodeEvidence(encoded),/RESERVED_KEY/);
});
