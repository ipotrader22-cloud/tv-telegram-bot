'use strict';
// Storage-only envelope: PostgreSQL parses a small string, not millions of
// OHLCV/news JSONB nodes. All model hashes are computed on decoded evidence.
const {gzipSync,gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const KEY='__vixaleEvidenceEncoding',VERSION='gzip-json-v1';
const LIMIT=64*1024*1024,THRESHOLD=256*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function encodeEvidence(value){
 if(value&&Object.hasOwn(value,KEY))throw Error('EVIDENCE_STORAGE_RESERVED_KEY');
 const raw=Buffer.from(JSON.stringify(value));
 if(raw.length>LIMIT)throw Error('EVIDENCE_STORAGE_LIMIT');
 if(raw.length<THRESHOLD)return value;
 return {[KEY]:VERSION,bytes:raw.length,sha256:digest(raw),data:gzipSync(raw,{level:1}).toString('base64')};
}
function decodeEvidence(value){
 if(!value||!Object.hasOwn(value,KEY))return value;
 try{
  if(value[KEY]!==VERSION||!Number.isInteger(value.bytes)||value.bytes<1||value.bytes>LIMIT||
     !/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.data!=='string'||value.data.length>LIMIT*2||
     Object.keys(value).sort().join(',')!==[KEY,'bytes','data','sha256'].sort().join(','))throw Error();
  const compressed=Buffer.from(value.data,'base64');
  if(compressed.toString('base64')!==value.data)throw Error();
  const raw=gunzipSync(compressed,{maxOutputLength:value.bytes});
  if(raw.length!==value.bytes||digest(raw)!==value.sha256)throw Error();
  const decoded=JSON.parse(raw.toString('utf8'));
  if(!decoded||typeof decoded!=='object'||Object.hasOwn(decoded,KEY))throw Error();
  return decoded;
 }catch{throw Error('EVIDENCE_STORAGE_INVALID')}
}
module.exports={encodeEvidence,decodeEvidence};
