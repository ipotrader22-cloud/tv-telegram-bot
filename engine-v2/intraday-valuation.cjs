'use strict';
// Issue #388 read-only valuation. Google Sheet quotes remain primary; a separately
// identified, completed Google Chart 1-minute bar may value stale/missing quotes.
// Neither source changes immutable model decisions, entries, events or history.
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {createGoogleQuoteProvider}=require('./google-quote-provider.cjs');
const {createGoogleChartSource}=require('./google-finance-chart-source.cjs');
const {boundedMap}=require('./bounded-map.cjs');
const TTL_MS=60000,MAX_AGE_MS=20*60000,MAX_CHART_AGE_MS=5*60000;
const CHART_PROVIDER='GOOGLE_FINANCE_CHART_1M';
function etStamp(iso){
 const d=new Date(iso);
 if(!Number.isFinite(d.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
  second:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const get=k=>parts.find(x=>x.type===k)?.value;
 return get('year')+'-'+get('month')+'-'+get('day')+' '+get('hour')+':'+get('minute')+':'+get('second')+' ET';
}
function isSessionOpen(now){
 const et=localET(now.toISOString()),session=sessionEvidence(et.date);
 const [hour,minute]=String(session.closeEt||'16:00').split(':').map(Number);
 return {et,close:hour*60+minute,open:!!session.isTradingDay&&et.minute>=570&&et.minute<hour*60+minute};
}
function normalizeCompletedMinute({ticker,bars,sourceHash,now}={}){
 if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker||'')||
    !/^[a-f0-9]{64}$/.test(sourceHash||'')||!Array.isArray(bars))
  throw Error('VALUATION_CHART_EVIDENCE_INVALID');
 const {et,open}=isSessionOpen(now),at=now.getTime();
 if(!open)return null;
 // Only completed regular-session minutes are eligible. Source data may
 // include in-progress or future bars; these must never be used as prices.
 const eligible=bars.filter(b=>{
  const start=Date.parse(b?.start||''),end=Date.parse(b?.end||'');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==60000||end>at||
     b?.ticker!==ticker||b?.date!==et.date||b?.provider!=='GOOGLE_FINANCE_CHART'||
     b?.priceKind!=='MINUTE_BAR_OHLCV'||b?.session!=='REGULAR'||
     !String(b?.sourceId||'').startsWith('GOOGLE_CHART_1M:'+ticker+':')||
     !Number.isFinite(b.close)||b.close<=0||!Number.isFinite(b.volume)||b.volume<=0)return false;
  const startEt=localET(b.start);
  return startEt.date===et.date&&startEt.minute>=570;
 });
 eligible.sort((a,b)=>Date.parse(a.end)-Date.parse(b.end));
 const last=eligible.at(-1);
 if(!last)return null;
 return {ticker,price:last.close,timestamp:last.end,provider:CHART_PROVIDER,
  priceKind:'COMPLETED_MINUTE_BAR_CLOSE',session:'REGULAR',verified:true,
  sourceId:last.sourceId,sourceHash,delayMinutes:null,indicative:true,modelFill:false};
}
function composeValuation(feed,quotes,{now=new Date()}={}){
 if(!feed||feed.version!==2||!Array.isArray(feed.active_portfolio))
  throw Error('VALUATION_FEED_INVALID');
 const instant=now instanceof Date?now:new Date(now),at=instant.getTime();
 if(!Number.isFinite(at))throw Error('VALUATION_CLOCK_INVALID');
 const {et,close,open}=isSessionOpen(instant),by=new Map();
 // Publish only calculation evidence for held symbols, never raw provider data.
 const fields=['ticker','price','timestamp','provider','priceKind','session','verified','sourceId','sourceHash','delayMinutes'];
 const held=new Set(feed.active_portfolio.map(p=>p.ticker));
 for(const q of quotes||[])if(q&&held.has(q.ticker)&&!by.has(q.ticker))
  by.set(q.ticker,Object.fromEntries(fields.filter(k=>Object.hasOwn(q,k)).map(k=>[k,q[k]])));
 const evidence=[...by.values()];
 let aggregate=0,allFresh=true;
 const active=feed.active_portfolio.map(p=>{
  const entry=p.entry_price,qty=Number.isFinite(entry)&&entry>0?Math.floor(10000/entry):null;
  const q=by.get(p.ticker),ts=Date.parse(q?.timestamp||''),age=at-ts;
  const sheet=q?.provider==='GOOGLEFINANCE'&&q?.priceKind==='DELAYED_LAST_QUOTE'&&
   Number.isFinite(q.delayMinutes)&&q.delayMinutes>=0&&q.delayMinutes<=20;
  const chart=q?.provider===CHART_PROVIDER&&q?.priceKind==='COMPLETED_MINUTE_BAR_CLOSE'&&
   q.delayMinutes===null&&/^[a-f0-9]{64}$/.test(q.sourceHash||'')&&
   String(q.sourceId||'').startsWith('GOOGLE_CHART_1M:'+p.ticker+':');
  const sourceOk=(sheet||chart)&&q?.verified===true&&q?.ticker===p.ticker&&q?.session==='REGULAR';
  const known=sourceOk&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(ts)&&ts<=at;
  const fresh=known&&open&&age<=(chart?MAX_CHART_AGE_MS:MAX_AGE_MS)&&
   localET(q.timestamp).date===et.date&&localET(q.timestamp).minute>=570&&
   localET(q.timestamp).minute<=close;
  const status=fresh?(chart?'FRESH_MINUTE_BAR':'FRESH_DELAYED'):known?'STALE':'UNAVAILABLE';
  const price=known?q.price:null;
  const pnl=fresh&&Number.isFinite(entry)&&entry>0?10000*(price/entry-1):null;
  const sharePnl=fresh&&Number.isFinite(qty)?qty*(price-entry):null;
  if(pnl===null)allFresh=false;else aggregate+=pnl;
  return {...p,model_quantity_shares:qty,current_valuation_price:price,
   quote_timestamp_et:known?etStamp(q.timestamp):null,quote_timestamp_utc:known?q.timestamp:null,
   quote_source:known?q.provider:null,quote_delay_minutes:known?q.delayMinutes:null,
   valuation_price_kind:known?q.priceKind:null,valuation_status:status,
   unrealized_model_pnl:pnl,unrealized_share_pnl:sharePnl};
 });
 const unrealized=allFresh?aggregate:null;
 const count=active.filter(p=>p.valuation_status==='FRESH_DELAYED'||p.valuation_status==='FRESH_MINUTE_BAR').length;
 return {...feed,active_portfolio:active,valuation_as_of:instant.toISOString(),
  valuation_status:active.length===0?'NO_OPEN_POSITIONS':allFresh?(active.every(p=>p.valuation_status==='FRESH_DELAYED')?'FRESH_DELAYED':'FRESH_GOOGLE_VALUATION'):count?'PARTIAL':'UNAVAILABLE_OR_STALE',
  valuation_coverage:count,unrealized_model_pnl:unrealized,
  current_valuation_model_equity:unrealized===null?null:100000+feed.realized_model_pnl+unrealized,
  total_valuation_model_pnl:unrealized===null?null:feed.realized_model_pnl+unrealized,
  valuation_read_only:true,valuation_quotes:evidence};
}
function createValuationReader({readFeed,api,clock=()=>new Date(),provider,chartProvider}={}){
 if(typeof readFeed!=='function')throw Error('VALUATION_FEED_READER_REQUIRED');
 const quoteProvider=provider||(api?createGoogleQuoteProvider({api,clock}):null);
 // Dependency injection keeps tests fully offline. Production Engine 2 shadow
 // observer has the approved staging Sheets client and Google chart provider.
 const charts=chartProvider===undefined?(api?createGoogleChartSource():null):chartProvider;
 let cache=[],retryAt=0,failures=0,flight=null,identity='';
 const chartRetry=new Map();
 return async function readValued(){
  const feed=await readFeed(),now=clock(),tickers=feed.active_portfolio.map(p=>p.ticker);
  const key=tickers.join('|');
  if(identity!==key){cache=[];retryAt=0;failures=0;chartRetry.clear();identity=key;}
  const {et,open}=isSessionOpen(now);
  if(tickers.length&&open&&now.getTime()>=retryAt&&!flight){
   flight=(async()=>{
    const by=new Map(cache.map(q=>[q.ticker,q]));
    try{
     if(quoteProvider){
      // One bounded read covers all open positions. Strict morning decision
      // quote reader behavior is not changed by this opt-in partial read.
      const quotes=await quoteProvider.getQuotes({date:et.date,tickers,allowPartial:true});
      if(quotes.length>tickers.length||new Set(quotes.map(q=>q.ticker)).size!==quotes.length||
         quotes.some(q=>!tickers.includes(q.ticker)))throw Error('VALUATION_COVERAGE_INCOMPLETE');
      for(const quote of quotes){
       const old=by.get(quote.ticker);
       if(!old||Date.parse(quote.timestamp)>=Date.parse(old.timestamp))by.set(quote.ticker,quote);
      }
     }
     failures=0;
    }catch{failures++;}
    if(charts){
     const projected=composeValuation(feed,[...by.values()],{now});
     const unresolved=projected.active_portfolio.filter(p=>
      p.valuation_status!=='FRESH_DELAYED'&&p.valuation_status!=='FRESH_MINUTE_BAR').map(p=>p.ticker);
     await boundedMap(unresolved,2,async ticker=>{
      const previous=chartRetry.get(ticker)||{failures:0,next:0};
      if(now.getTime()<previous.next)return;
      try{
       const result=await charts.getMinuteHistory({ticker,fromDate:et.date,throughDate:et.date});
       const quote=normalizeCompletedMinute({ticker,bars:result.bars,sourceHash:result.sourceHash,now});
       if(!quote)throw Error('VALUATION_CHART_NOT_COMPLETED');
       const old=by.get(ticker);
       if(!old||Date.parse(quote.timestamp)>Date.parse(old.timestamp))by.set(ticker,quote);
       chartRetry.set(ticker,{failures:0,next:now.getTime()+TTL_MS});
      }catch{
       const failures=previous.failures+1;
       chartRetry.set(ticker,{failures,next:now.getTime()+Math.min(5*TTL_MS,TTL_MS*2**Math.min(failures-1,3))});
      }
     });
    }
    cache=[...by.values()];
    retryAt=now.getTime()+Math.min(5*TTL_MS,TTL_MS*2**Math.min(Math.max(0,failures-1),3));
   })().finally(()=>{flight=null});
  }
  if(flight)await flight;
  return composeValuation(feed,cache,{now});
 };
}
module.exports={composeValuation,createValuationReader,normalizeCompletedMinute,
 TTL_MS,MAX_AGE_MS,MAX_CHART_AGE_MS,CHART_PROVIDER};
