'use strict';
const {createHash}=require('node:crypto');
const assert=(ok,message)=>{if(!ok)throw Error(message)};
const clone=value=>JSON.parse(JSON.stringify(value));
const id=e=>`${e.ticker}|${e.entryDate}`;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const timestamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x);
const hash=e=>createHash('sha256').update(JSON.stringify(e)).digest('hex');
function reduce(state,event){
 assert(event&&typeof event==='object'&&typeof event.eventId==='string'&&event.eventId.length>0,'eventId required');
 const next=clone(state||{positions:[],closed:[],applied:[],eventHashes:{}});
 assert(Array.isArray(next.positions)&&Array.isArray(next.closed)&&Array.isArray(next.applied)&&next.eventHashes&&typeof next.eventHashes==='object','invalid state');
 assert(/^[A-Z.-]+$/.test(event.ticker)&&date(event.entryDate),'invalid lot identity');
 const fingerprint=hash(event);
 if(next.applied.includes(event.eventId)){
   assert(next.eventHashes[event.eventId]===fingerprint,'eventId reused with different payload');
   return {state:next,applied:false,reason:'already-applied'};
 }
 const lot=id(event);
 if(event.type==='OPEN'){
  assert(Number.isFinite(event.entryPrice)&&event.entryPrice>0&&timestamp(event.entryTime),'invalid entry evidence');
  assert(event.entryTime.slice(0,10)===event.entryDate,'entry date/time mismatch');
  assert(!next.positions.some(p=>id(p)===lot),'duplicate open');
  assert(!next.closed.some(p=>id(p)===lot),'previously closed lot');
  assert(next.positions.length<10,'active limit');
  next.positions.push({ticker:event.ticker,entryDate:event.entryDate,entryPrice:event.entryPrice,entryTime:event.entryTime});
 }else if(event.type==='CLOSE'){
  const idx=next.positions.findIndex(p=>id(p)===lot);
  assert(idx>=0,'lot not open'); assert(!next.closed.some(p=>id(p)===lot),'duplicate close');
  assert(['TARGET','STOP LOSS','DROPPED FROM ACTIVE PORTFOLIO'].includes(event.reason),'invalid exit reason');
  assert(Number.isFinite(event.exitPrice)&&event.exitPrice>0&&timestamp(event.exitTime),'invalid exit evidence');
  assert(date(event.effectiveDate)&&date(event.exitTime.slice(0,10)),'invalid effective date');
  assert(event.effectiveDate>=event.entryDate,'effective date before entry');
  assert(event.includePublic==='YES'||event.includePublic==='NO','explicit public control required');
  const p=next.positions[idx];assert(Date.parse(event.exitTime)>=Date.parse(p.entryTime),'exit before entry');
  next.positions.splice(idx,1);
  next.closed.push({...p,exitPrice:event.exitPrice,exitTime:event.exitTime,reason:event.reason,includePublic:event.includePublic,effectiveDate:event.effectiveDate});
 }else throw Error('unsupported event');
 next.applied.push(event.eventId);next.eventHashes[event.eventId]=fingerprint;
 return {state:next,applied:true};
}
module.exports={reduce};
