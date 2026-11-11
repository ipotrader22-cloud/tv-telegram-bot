'use strict';
// Issue #388: independent read-only valuation; never edits decisions, positions, Sheets or history.
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {createGoogleQuoteProvider}=require('./google-quote-provider.cjs');
const {createSheetsClient}=require('./staging-sheets-publisher.cjs');
const TTL_MS=60000;
const MAX_AGE_MS=20*60000;
function etStamp(iso){const d=new Date(iso);if(!Number.isFinite(d.getTime()))return null;const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);const get=k=>parts.find(x=>x.type===k)?.value;return get('year')+'-'+get('month')+'-'+get('day')+' '+get('hour')+':'+get('minute')+':'+get('second')+' ET';}
function composeValuation(feed,quotes,{now=new Date()}={}){
 if(!feed||feed.version!==2||!Array.isArray(feed.active_portfolio))throw Error('VALUATION_FEED_INVALID');
 const instant=now instanceof Date?now:new Date(now),at=instant.getTime();
 if(!Number.isFinite(at))throw Error('VALUATION_CLOCK_INVALID');
 const et=localET(instant.toISOString()),session=sessionEvidence(et.date);
 const [closeHour,closeMinute]=String(session.closeEt||'16:00').split(':').map(Number);
 const close=closeHour*60+closeMinute;
 const open=!!session.isTradingDay&&et.minute>=570&&et.minute<close;
 const by=new Map();
 for(const q of quotes||[]){
  if(!q||typeof q.ticker!=='string'||by.has(q.ticker))continue;
  by.set(q.ticker,q);
 }
 let aggregate=0,allFresh=true;
 const active=feed.active_portfolio.map(p=>{
  const entry=p.entry_price,qty=Number.isFinite(entry)&&entry>0?Math.floor(10000/entry):null;
  const q=by.get(p.ticker);
  const ts=Date.parse(q?.timestamp||''),age=at-ts;
  const sourceOk=q?.provider==='GOOGLEFINANCE'&&q?.verified===true&&q?.ticker===p.ticker&&
   q?.priceKind==='DELAYED_LAST_QUOTE'&&q?.session==='REGULAR';
  const fresh=open&&sourceOk&&Number.isFinite(q.price)&&q.price>0&&
   Number.isFinite(ts)&&age>=0&&age<=MAX_AGE_MS&&
   localET(q.timestamp).date===et.date&&localET(q.timestamp).minute>=570&&localET(q.timestamp).minute<close&&
   Number.isFinite(q.delayMinutes)&&q.delayMinutes>=0&&q.delayMinutes<=20;
  const known=sourceOk&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(ts)&&ts<=at;
  const status=fresh?'FRESH_DELAYED':known?'STALE':'UNAVAILABLE';
  const price=known?q.price:null;
  const pnl=fresh&&Number.isFinite(entry)&&entry>0?10000*(price/entry-1):null;
  const sharePnl=fresh&&Number.isFinite(qty)?qty*(price-entry):null;
  if(pnl===null)allFresh=false;else aggregate+=pnl;
  return {...p,model_quantity_shares:qty,current_valuation_price:price,
   quote_timestamp_et:known?etStamp(q.timestamp):null,quote_timestamp_utc:known?q.timestamp:null,quote_source:known?'GOOGLEFINANCE':null,
   quote_delay_minutes:known?q.delayMinutes:null,valuation_status:status,
   unrealized_model_pnl:pnl,unrealized_share_pnl:sharePnl};
 });
 const unrealized=allFresh?aggregate:null;
 return {...feed,active_portfolio:active,valuation_as_of:instant.toISOString(),
  valuation_status:active.length===0?'NO_OPEN_POSITIONS':allFresh?'FRESH_DELAYED':active.some(p=>p.valuation_status==='FRESH_DELAYED')?'PARTIAL':'UNAVAILABLE_OR_STALE',
  valuation_coverage:active.filter(p=>p.valuation_status==='FRESH_DELAYED').length,
  unrealized_model_pnl:unrealized,
  current_valuation_model_equity:unrealized===null?null:100000+feed.realized_model_pnl+unrealized,
  total_valuation_model_pnl:unrealized===null?null:feed.realized_model_pnl+unrealized,
  valuation_read_only:true};
}
function createValuationReader({readFeed,api,clock=()=>new Date(),provider}={}){
 if(typeof readFeed!=='function')throw Error('VALUATION_FEED_READER_REQUIRED');
 const quoteProvider=provider||(api?createGoogleQuoteProvider({api,clock}):null);
 let cache=null,stamp=0,flight=null,identity='';
 return async function readValued(){
  const feed=await readFeed(),now=clock(),tickers=feed.active_portfolio.map(p=>p.ticker);
  const key=tickers.join('|');
  if(identity!==key){cache=null;stamp=0;identity=key;}
  // Missing observer credential is reported as unavailable, never substituted.
  if(tickers.length&&quoteProvider&&(!cache||now.getTime()-stamp>=TTL_MS)&&!flight){
   flight=(async()=>{
    try{
     // One bounded Sheets grid-read for every open ticker; no 518-stock intraday scan.
     const quotes=await quoteProvider.getQuotes({date:localET(now.toISOString()).date,tickers,allowPartial:true});
     if(quotes.length>tickers.length||new Set(quotes.map(q=>q.ticker)).size!==quotes.length||quotes.some(q=>!tickers.includes(q.ticker)))
      throw Error('VALUATION_COVERAGE_INCOMPLETE');
     cache=quotes;stamp=now.getTime();
    }catch{ // Keep last observed quotes with their ORIGINAL timestamps, never mask outage.
     if(!cache){cache=[];stamp=now.getTime();}
     else stamp=now.getTime();
    }
   })().finally(()=>{flight=null});
  }
  if(flight)await flight;
  return composeValuation(feed,cache||[],{now});
 };
}
module.exports={composeValuation,createValuationReader,TTL_MS,MAX_AGE_MS};
