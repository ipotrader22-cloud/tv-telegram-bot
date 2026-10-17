'use strict';
// No network or credentials. Validates standardized quotes returned by an injected provider.
const assert=(ok,m)=>{if(!ok)throw Error(m)};
const validTime=s=>typeof s==='string'&&/T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
const dayET=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
const hmET=s=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(s));
function normalize(raw,{ticker,kind,maxAgeSeconds=90,now=new Date().toISOString(),tradingDate}={}){
 assert(raw&&raw.ticker===ticker&&/^[A-Z.-]+$/.test(ticker),'symbol mismatch');
 assert(['REGULAR_QUOTE','REGULAR_OPEN','REGULAR_BAR','DAILY_BAR'].includes(kind),'unsupported observation');
 assert(validTime(raw.observedAt)&&validTime(now),'timestamp required');
 const age=(Date.parse(now)-Date.parse(raw.observedAt))/1000;
 assert(age>=-5,'future timestamp');
 if(kind==='REGULAR_QUOTE')assert(age<=maxAgeSeconds,'stale quote');
 assert(raw.session==='REGULAR'||kind==='DAILY_BAR','invalid market session');
 assert(typeof raw.price==='number'&&Number.isFinite(raw.price)&&raw.price>0,'invalid price');
 assert(typeof raw.source==='string'&&raw.source.length>0,'source required');
 assert(!tradingDate||dayET(raw.observedAt)===tradingDate,'wrong trading date');
 if(kind==='REGULAR_OPEN')assert(hmET(raw.observedAt)==='09:30','opening minute mismatch');
 if(kind==='REGULAR_BAR')assert(Number.isFinite(raw.volume)&&raw.volume>0,'bar volume required');
 return Object.freeze({ticker,kind,price:raw.price,source:raw.source,observedAt:raw.observedAt,session:raw.session,verified:true,volume:raw.volume??null});
}
function marketData({primary,secondary=null}={}){
 assert(primary&&typeof primary.getObservation==='function','primary provider required');
 return {async observe(request){
   let first;
   try{return normalize(await primary.getObservation(request),request)}
   catch(e){first=e}
   if(!secondary)throw first;
   try{return normalize(await secondary.getObservation(request),request)}
   catch(second){throw new AggregateError([first,second],'No verified market observation')}
 }};
}
module.exports={normalize,marketData,dayET};
