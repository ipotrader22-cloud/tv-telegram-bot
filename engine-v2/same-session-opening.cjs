'use strict';
// Read-only current-session 09:30 opening evidence for previously held model lots.
// Google priceopen or Yahoo 1-minute OPEN is indicative, never a broker fill.
const {etTime}=require('./delayed-model-policy.cjs');
const {createYahooMinuteProvider}=require('./yahoo-minute-fallback.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');

function verifyCurrentOpenings({date,runAt,positions=[],openings=[]}={}){
 if(!/^20\d\d-\d\d-\d\d$/.test(date||'')||!Number.isFinite(Date.parse(runAt||''))||
    !Array.isArray(positions)||!Array.isArray(openings))throw Error('CURRENT_OPENING_INPUT_INVALID');
 const openingTime=etTime(date,570),observedAt=Date.parse(runAt);
 if(observedAt<Date.parse(openingTime)+60000)throw Error('CURRENT_OPENING_BAR_NOT_COMPLETE');
 if(openings.length!==positions.length)throw Error('CURRENT_OPENING_COVERAGE_INCOMPLETE');
 const eligible=new Map();
 for(const old of positions){
  if(!old||!old.ticker||old.entryDate<EPOCH||old.entryDate>=date||
     !Number.isFinite(old.entryPrice)||old.entryPrice<=0||
     !Number.isFinite(Date.parse(old.entryTime||''))||Date.parse(old.entryTime)>=Date.parse(openingTime)||
     eligible.has(old.ticker))throw Error('CURRENT_OPENING_LOT_IDENTITY_INVALID');
  eligible.set(old.ticker,old);
 }
 const byTicker=new Map();
 for(const o of openings){
  const yahoo=o?.priceKind==='MINUTE_BAR_OPEN'&&
    o.sourceId==='YAHOO_1M:'+o.ticker+':'+Date.parse(openingTime);
  const google=o?.priceKind===require('./google-quote-provider.cjs').GOOGLE_OPEN_KIND&&
    require('./google-quote-provider.cjs').validGoogleOpening(o,{date,runAt});
  if(!o||!eligible.has(o.ticker)||byTicker.has(o.ticker)||o.date!==date||
     o.time!==openingTime||o.minuteET!=='09:30'||
     o.confirmed!==true||o.session!=='REGULAR'||
     ![yahoo,google].some(Boolean)||o.indicative!==true||
     !Number.isFinite(o.open)||o.open<=0)
    throw Error('CURRENT_OPENING_EVIDENCE_INVALID');
  byTicker.set(o.ticker,o);
 }
 return byTicker;
}

function createCurrentOpeningProvider({fetchFn=fetch}={}){
 const yahoo=createYahooMinuteProvider({fetchFn});
 return {getOpenings:({date,runAt,positions})=>yahoo.getOpenings({date,runAt,positions})};
}

module.exports={verifyCurrentOpenings,createCurrentOpeningProvider};
