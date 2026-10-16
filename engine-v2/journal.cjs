'use strict';
// Pure shadow state reducer. Storage adapter will wrap this in a DB transaction.
const assert=(ok,message)=>{if(!ok)throw Error(message)};
const immutable=(value)=>JSON.parse(JSON.stringify(value));
const identity=(event)=>[event.ticker,event.entryDate].join('|');
function reduce(state,event){
 assert(event&&typeof event==='object'&&typeof event.eventId==='string'&&event.eventId.length>0,'eventId required');
 const next=immutable(state||{positions:[],closed:[],applied:[]});
 assert(Array.isArray(next.positions)&&Array.isArray(next.closed)&&Array.isArray(next.applied),'invalid state');
 if(next.applied.includes(event.eventId))return {state:next,applied:false,reason:'already-applied'};
 const id=identity(event); assert(/^[A-Z.-]+\|\d{4}-\d{2}-\d{2}$/.test(id),'invalid lot identity');
 if(event.type==='OPEN'){
   assert(Number.isFinite(event.entryPrice)&&event.entryPrice>0,'invalid entry');
   assert(!next.positions.some(p=>identity(p)===id),'duplicate open');
   assert(!next.closed.some(p=>identity(p)===id),'previously closed lot');
   assert(next.positions.length<10,'active limit');
   next.positions.push({ticker:event.ticker,entryDate:event.entryDate,entryPrice:event.entryPrice,entryTime:event.entryTime});
 }else if(event.type==='CLOSE'){
   const idx=next.positions.findIndex(p=>identity(p)===id);
   assert(idx>=0,'lot not open');assert(!next.closed.some(p=>identity(p)===id),'duplicate close');
   assert(['TARGET','STOP LOSS','DROPPED FROM ACTIVE PORTFOLIO'].includes(event.reason),'invalid exit reason');
   assert(Number.isFinite(event.exitPrice)&&event.exitPrice>0,'invalid exit');
   assert(event.exitTime&&typeof event.exitTime==='string','exit time required');
   const [p]=next.positions.splice(idx,1);
   next.closed.push({...p,exitPrice:event.exitPrice,exitTime:event.exitTime,reason:event.reason,includePublic:event.includePublic??'YES',effectiveDate:event.effectiveDate});
 }else throw Error('unsupported event');
 next.applied.push(event.eventId);
 return {state:next,applied:true};
}
module.exports={reduce};
