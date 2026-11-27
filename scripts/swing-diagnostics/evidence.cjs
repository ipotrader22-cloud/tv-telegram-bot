'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {Readable,Transform,Writable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {createGunzip}=require('node:zlib');
const {parser}=require('stream-json');
const Assembler=require('stream-json/Assembler');
const MAX=64*1024*1024;

// The same research bundle occurs in the preparation and twice in the decision.
// Retain factor inputs and lots, hash the bulky source subtrees token by token.
// Comparing these projections also compares their source bars and company news.
async function readEvidence(stored) {
  assert.ok(stored && typeof stored==='object');
  const encoded=Object.hasOwn(stored,'__vixaleEvidenceEncoding');
  const stages=[];
  if(encoded) {
    assert.equal(stored.__vixaleEvidenceEncoding,'gzip-json-v1');
    assert.ok(Number.isSafeInteger(stored.bytes) && stored.bytes>0 && stored.bytes<=MAX);
    assert.match(stored.sha256,/^[0-9a-f]{64}$/);
    assert.ok(typeof stored.data==='string' && stored.data.length<=2*MAX);
    stages.push(Readable.from([Buffer.from(stored.data,'base64')]),createGunzip());
  } else {
    stages.push(Readable.from([Buffer.from(JSON.stringify(stored))]));
  }
  const rawHash=createHash('sha256');
  let size=0;
  stages.push(new Transform({transform(chunk,_,done){
    size+=chunk.length;
    if(size>(encoded?stored.bytes:MAX)) return done(Error('Evidence length exceeded'));
    rawHash.update(chunk);
    done(null,chunk);
  }}));
  const asm=new Assembler();
  let hash,depth=0;
  stages.push(parser({streamKeys:false,streamStrings:false,streamNumbers:false}));
  stages.push(new Writable({objectMode:true,write(token,_,done){
    try {
      const open=token.name==='startObject'||token.name==='startArray';
      const close=token.name==='endObject'||token.name==='endArray';
      if(!hash && open && ['artifact','news'].includes(asm.key) && asm.path.at(-1)==='sourceEvidence')
        hash=createHash('sha256');
      if(hash) {
        hash.update(JSON.stringify([token.name,token.value])+'\n');
        if(open)depth++;
        if(close && --depth===0) {
          asm.stringValue('source-token-sha256:'+hash.digest('hex'));
          hash=null;
        }
      } else asm.consume(token);
      done();
    } catch(error){done(error);}
  }}));
  await pipeline(...stages);
  assert.ok(asm.done && !hash);
  if(encoded) {
    assert.equal(size,stored.bytes);
    assert.equal(rawHash.digest('hex'),stored.sha256);
  }
  return asm.current;
}
module.exports={readEvidence};
