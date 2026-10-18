'use strict';
// Read-only historical evidence gate: no retrospective prices, no invented event times.
// Every non-inception frozen mark needs contemporaneous quote evidence for every
// active lot AND a sufficiently precise entry/exit chronology to be certified.
const {auditValuation,auditImmutableEntries,lotKey}=require('./valuation-integrity.cjs');
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function certifyMark({mark,lots,quotes,events,sourceId,tolerance=0.02}){
 if(!mark||!Array.isArray(lots)||!Array.isArray(quotes)||!Array.isArray(events))throw Error('Mark, lots, quotes and events required');
 const failures=[],cutoff=mark.cutoffTimestamp;
 if(!iso(cutoff))failures.push('MISSING_EXACT_MARK_CUTOFF');
 const stamp=iso(cutoff)?Date.parse(cutoff):NaN;
 if(!String(sourceId||'').trim())failures.push('MISSING_SOURCE_ID');
 const eventByLot=new Map();
 for(const event of events){
  if(!event?.lotId||!iso(event.timestamp)||!['ENTRY','EXIT'].includes(event.type)||!String(event.sourceId||'').trim()){
   failures.push('INVALID_EVENT_EVIDENCE');continue;
  }
  const a=eventByLot.get(event.lotId)||[];a.push(event);eventByLot.set(event.lotId,a);
 }
 const quotesByLot=new Map();
 for(const q of quotes){
  if(!q?.lotId||!iso(q.timestamp)||!finite(q.price)||q.price<=0||!String(q.sourceId||'').trim()){
   failures.push('INVALID_QUOTE_EVIDENCE');continue;
  }
  const a=quotesByLot.get(q.lotId)||[];a.push(q);quotesByLot.set(q.lotId,a);
 }
 const eligible=[],seen=new Set();
 for(const lot of lots){
  const key=lotKey(lot);
  if(seen.has(key)){failures.push('DUPLICATE_LOT');continue}
  seen.add(key);
  const chronology=eventByLot.get(key)||[];
  const entries=chronology.filter(x=>x.type==='ENTRY');
  const exits=chronology.filter(x=>x.type==='EXIT');
  if(entries.length!==1||exits.length>1){failures.push('INCOMPLETE_LOT_CHRONOLOGY:'+key);continue}
  const entry=Date.parse(entries[0].timestamp);
  const exit=exits.length?Date.parse(exits[0].timestamp):Infinity;
  if(!(entry<exit)){failures.push('INVALID_EVENT_ORDER:'+key);continue}
  if(!(entry<=stamp&&stamp<exit))continue;
  const eligibleQuotes=(quotesByLot.get(key)||[]).filter(q=>Date.parse(q.timestamp)<=stamp);
  // Exact cutoff source evidence is required; an old quote cannot establish
  // a contemporaneous value. No interpolation across missing ticks.
  const atCutoff=eligibleQuotes.filter(q=>Date.parse(q.timestamp)===stamp);
  if(atCutoff.length!==1){failures.push('MISSING_UNAMBIGUOUS_CUTOFF_QUOTE:'+key);continue}
  eligible.push({...lot,price:atCutoff[0].price});
 }
 if(!Number.isInteger(mark.activeCount)||mark.activeCount!==eligible.length)failures.push('ACTIVE_COUNT_NOT_PROVEN');
 const value=auditValuation(eligible);
 if(value.status!=='PASS')failures.push(...value.errors.map(x=>x.gate+':'+x.key));
 if(!finite(mark.unrealized)||value.unrealized===null||Math.abs(value.unrealized-mark.unrealized)>tolerance)failures.push('UNREALIZED_NOT_RECONCILED');
 const unique=[...new Set(failures)];
 return {date:mark.date,status:unique.length?'PARTIAL':'PASS',certified:unique.length===0,failures:unique,verifiedLots:eligible.length,marketValue:unique.length?null:value.marketValue,unrealized:unique.length?null:value.unrealized,sourceId:sourceId||null};
}
function reviewEntryMutations(earlier,later){
 const changes=auditImmutableEntries(earlier,later);
 return {...changes,excluded:[],requiresExecutionAmendments:changes.changes.map(x=>x.lotId)};
}
function certifyHistory({marks=[],lots=[],quotes=[],events=[],sourceId}={}){
 if(!Array.isArray(marks))throw Error('Historical marks array required');
 const reports=marks.map(mark=>certifyMark({mark,lots,quotes,events,sourceId}));
 return {status:reports.length&&reports.every(x=>x.certified)?'PASS':'PARTIAL',certified:reports.filter(x=>x.certified).length,total:reports.length,reports};
}
module.exports={certifyMark,certifyHistory,reviewEntryMutations};
