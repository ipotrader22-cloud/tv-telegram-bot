'use strict';
// Issue #388: read-only website valuation. Never writes Sheets, scores, decisions,
// broker state or model history. Morning Public Feed remains immutable.
const {createHash}=require('node:crypto');
const {session,previousSession}=require('../scripts/swing-market-calendar');
const ENGINE2_ID='1Ii20kcegWWhQfz_RUrDe0OhfFG1y9TNjrEI1Xy6mqyA';
const GRID_ID=290100001,GRID="'Engine 2 Quotes'!A1:E651";
const CHART_URL='https://www.google.com/finance/beta/_/FinHubUi/data/batchexecute';
const TTL=60000,MAX_QUOTE_AGE=20*60000,MAX_BAR_AGE=5*60000;
const CHART_SOURCE='GOOGLE_FINANCE_CHART_1M';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function etParts(when){
 const date=when instanceof Date?when:new Date(when);
 if(!Number.isFinite(date.getTime()))throw Error('INVALID_VALUATION_TIME');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',
  month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
  hourCycle:'h23'}).formatToParts(date);
 const field=k=>parts.find(v=>v.type===k)?.value;
 return {day:field('year')+'-'+field('month')+'-'+field('day'),
  minute:Number(field('hour'))*60+Number(field('minute')),
  text:field('year')+'-'+field('month')+'-'+field('day')+' '+field('hour')+':'+field('minute')+':'+field('second')+' ET'};
}
function sourceTime(text){
 const m=/^(20\d\d-\d\d-\d\d) (\d\d):(\d\d):(\d\d)$/.exec(text||'');
 if(!m||+m[2]>23||+m[3]>59||+m[4]>59)throw Error('INVALID_GOOGLE_TRADETIME');
 const midday=new Date(m[1]+'T12:00:00Z');
 if(!Number.isFinite(midday.getTime()))throw Error('INVALID_GOOGLE_TRADETIME');
 const et=etParts(midday),offset=(et.minute-720)*60000;
 const instant=new Date(Date.parse(m[1]+'T'+m[2]+':'+m[3]+':'+m[4]+'Z')-offset);
 if(etParts(instant).text!==text+' ET')throw Error('INVALID_GOOGLE_TRADETIME');
 return instant.toISOString();
}
function market(now){
 const et=etParts(now),s=session(et.day),[h,m]=String(s.closeEt||'16:00').split(':').map(Number);
 return {et,open:!!s.open&&et.minute>=570&&et.minute<h*60+m,close:h*60+m};
}
// Outside RTH, value only the most recently completed NYSE session, including
// weekends/holidays/early closes. Re-read its evidence after a process restart.
function valuationSession(now){
 const current=market(now),today=session(current.et.day);
 const day=current.open||(today.open&&current.et.minute>=current.close)
  ?current.et.day:previousSession(current.et.day);
 const closeText=session(day).closeEt, [h,m]=closeText.split(':').map(Number);
 return {day,open:current.open,close:h*60+m,
  closeTime:Date.parse(sourceTime(day+' '+closeText+':00'))};
}
function quoteUsable(q,now){
 if(!q||!Number.isFinite(q.price)||q.price<=0)return false;
 const stamp=Date.parse(q.timestamp),context=valuationSession(now);
 if(!Number.isFinite(stamp)||stamp>now.getTime())return false;
 const et=etParts(stamp),minuteBar=q.kind==='COMPLETED_MINUTE_BAR_CLOSE';
 if(et.day!==context.day||et.minute<570||stamp>context.closeTime)return false;
 // Completed-bar timestamps are bar ends; a 09:30 end is premarket.
 if(minuteBar&&et.minute<=570)return false;
 const age=(context.open?now.getTime():context.closeTime)-stamp;
 return age>=0&&age<=(minuteBar?MAX_BAR_AGE:MAX_QUOTE_AGE);
}
function validSymbol(ticker,exchange){
 return /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker||'')&&/^(NYSE|NASDAQ|AMEX|BATS)$/.test(exchange||'');
}
function quoteRow(cells,row,ticker,exchange,now){
 const symbol=cells?.[0]?.effectiveValue?.stringValue;
 if(symbol!==exchange+':'+ticker)return null;
 const formulas=[
  '=IFERROR(GOOGLEFINANCE(A'+row+',"price"),"")',
  '=IFERROR(TEXT(GOOGLEFINANCE(A'+row+',"tradetime"),"yyyy-mm-dd hh:mm:ss"),"")',
  '=IFERROR(GOOGLEFINANCE(A'+row+',"datadelay"),"")',
  '=IFERROR(GOOGLEFINANCE(A'+row+',"volume"),"")'
 ];
 if(formulas.some((formula,i)=>cells[i+1]?.userEnteredValue?.formulaValue!==formula))
  throw Error('GOOGLE_VALUATION_FORMULA_MISMATCH');
 const price=cells[1]?.effectiveValue?.numberValue,
  delay=cells[3]?.effectiveValue?.numberValue,volume=cells[4]?.effectiveValue?.numberValue;
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(delay)||delay<0||delay>20||
    !Number.isFinite(volume)||volume<=0)return null;
 let timestamp;try{timestamp=sourceTime(cells[2]?.effectiveValue?.stringValue)}catch{return null}
 const quote={ticker,price,timestamp,source:'GOOGLEFINANCE',kind:'DELAYED_LAST_QUOTE',
  delayMinutes:delay,sourceHash:hash([symbol,price,timestamp,delay,volume])};
 return quoteUsable(quote,now)?quote:null;
}
async function readGoogleSheet({sheets,positions,now}){
 if(!sheets?.spreadsheets?.get)throw Error('GOOGLE_VALUATION_READER_UNAVAILABLE');
 const response=await sheets.spreadsheets.get({spreadsheetId:ENGINE2_ID,ranges:[GRID],
  includeGridData:true,fields:'spreadsheetId,properties(timeZone),sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue))))'});
 const data=response?.data,tab=data?.sheets?.[0],grid=tab?.data?.[0];
 if(data?.spreadsheetId!==ENGINE2_ID||data?.properties?.timeZone!=='America/New_York'||
    tab?.properties?.sheetId!==GRID_ID||tab?.properties?.title!=='Engine 2 Quotes'||
    (grid?.startRow||0)!==0||(grid?.startColumn||0)!==0)throw Error('GOOGLE_VALUATION_GRID_UNVERIFIED');
 const by=new Map();
 for(let i=1;i<(grid?.rowData||[]).length;i++){
  const cells=grid.rowData[i]?.values||[],symbol=cells[0]?.effectiveValue?.stringValue;
  if(!symbol)continue;
  if(by.has(symbol))throw Error('GOOGLE_VALUATION_DUPLICATE_SYMBOL');
  by.set(symbol,{cells,row:i+1});
 }
 const quotes=[];
 for(const position of positions){
  const ticker=position.ticker,exchange=position.exchange;
  if(!validSymbol(ticker,exchange))throw Error('GOOGLE_VALUATION_IDENTITY_INVALID');
  const row=by.get(exchange+':'+ticker);
  if(!row)continue;
  const q=quoteRow(row.cells,row.row,ticker,exchange,now);
  if(q)quotes.push(q);
 }
 return quotes;
}
function chartDecode(value){
 let text=String(value||'').trim();
 if(text.startsWith(")]}'"))text=text.slice(4).trim();
 const attempts=[];
 try{attempts.push(JSON.parse(text))}catch{
  for(const line of text.split('\n'))if(line.trim().startsWith('[['))
   try{attempts.push(JSON.parse(line))}catch{}
 }
 for(const v of attempts)for(const row of Array.isArray(v)?v:[]){
  if(row?.[0]==='wrb.fr'&&typeof row[2]==='string'){
   try{return JSON.parse(row[2])}catch{}
  }
 }
 throw Error('GOOGLE_CHART_DECODE_INVALID');
}
async function chartMinuteQuote({ticker,exchange,now,fetcher=fetch}){
 if(!validSymbol(ticker,exchange))throw Error('GOOGLE_CHART_IDENTITY_INVALID');
 const context=valuationSession(now),day=context.day,parts=day.split('-').map(Number);
 const args=[[[null,[ticker,exchange]]],null,[parts,parts,1],null,null,null,null,1];
 for(const rpc of ['c2u4wc','AiCwsd']){
  const body=new URLSearchParams({'f.req':JSON.stringify([[[rpc,JSON.stringify(args),null,'1']]])});
  let response;try{response=await fetcher(CHART_URL+'?rpcids='+rpc+'&hl=en&gl=US',{
   method:'POST',headers:{'accept':'*/*','content-type':'application/x-www-form-urlencoded;charset=UTF-8',
   origin:'https://www.google.com',referer:'https://www.google.com/finance/beta','x-same-domain':'1'},
   body,signal:AbortSignal.timeout(12000)});
  }catch{throw Error('GOOGLE_CHART_TRANSPORT_UNAVAILABLE')}
  if(response?.status===403||response?.status===429)throw Error('GOOGLE_CHART_RESTRICTED');
  if(response?.status===400&&rpc==='c2u4wc')continue;
  if(!response?.ok)throw Error('GOOGLE_CHART_HTTP_UNAVAILABLE');
  const raw=chartDecode(await response.text());
  const matches=Array.isArray(raw?.[0])?raw[0].filter(v=>v?.[0]?.[0]===ticker&&v?.[0]?.[1]===exchange):[];
  if(matches.length!==1||matches[0]?.[8]!==60||!Array.isArray(matches[0]?.[3]))
   throw Error('GOOGLE_CHART_SERIES_UNVERIFIED');
  const series=matches[0],observed=now.getTime(),{close}=context,quotes=[];
  for(const block of series[3])for(const candle of Array.isArray(block?.[2])?block[2]:[]){
   if(!Array.isArray(candle)||candle.length<6)throw Error('GOOGLE_CHART_CANDLE_INVALID');
   const [open,price,high,low,stamp,volume]=candle;
   if([open,price,high,low,volume].some(n=>!Number.isFinite(n)||n<=0)||
      high<Math.max(open,price,low)||low>Math.min(open,price,high))
    throw Error('GOOGLE_CHART_CANDLE_INVALID');
   const start=Date.parse(stamp),end=start+60000;
   if(!Number.isFinite(start)||start%60000||end>observed)continue;
   const et=etParts(start);
   if(et.day!==day||et.minute<570||et.minute>=close)continue;
   const q={ticker,price,timestamp:new Date(end).toISOString(),source:CHART_SOURCE,
    kind:'COMPLETED_MINUTE_BAR_CLOSE',delayMinutes:null,sourceHash:hash([ticker,exchange,candle,series[8]])};
   if(quoteUsable(q,now))quotes.push(q);
  }
  quotes.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  return quotes.at(-1)||null;
 }
 return null;
}
function project(snapshot,quotes,now){
 const result=JSON.parse(JSON.stringify(snapshot)),by=new Map(quotes.map(q=>[q.ticker,q]));
 const context=valuationSession(now);
 let pnl=0,coverage=0;
 result.active_portfolio=result.active_portfolio.map(p=>{
  const q=by.get(p.ticker),entry=Number(String(p.entry_price||'').replace(/[$,]/g,'')),
   mark=q?.price,valid=!!q&&!q.stale&&quoteUsable(q,now)&&
    (!p.entry_date||p.entry_date<=context.day)&&Number.isFinite(entry)&&entry>0&&Number.isFinite(mark)&&mark>0;
  const unrealized=valid?10000*(mark/entry-1):null;
  if(valid){coverage++;pnl+=unrealized;}
  return {...p,morning_reference_price:p.current_price,morning_reference_return_pct:p.return_pct,
   current_valuation_price:valid?mark:null,
   valuation_return_pct:valid?100*(mark/entry-1):null,
   valuation_status:valid?(!context.open?'LAST_SESSION_QUOTE':q.kind==='COMPLETED_MINUTE_BAR_CLOSE'?'FRESH_MINUTE_BAR':'FRESH_DELAYED'):q?.stale?'STALE':'UNAVAILABLE',
   quote_source:q?.source||null,quote_timestamp_utc:q?.timestamp||null,
   quote_timestamp_et:q?.timestamp?etParts(q.timestamp).text:null,
   quote_delay_minutes:q?.delayMinutes??null,valuation_price_kind:q?.kind||null,
   last_known_valuation_price:q?.stale?q.price:null,
   unrealized_model_pnl:unrealized};
 });
 result.valuation_read_only=true;result.valuation_as_of=now.toISOString();
 result.valuation_market_open=context.open;result.valuation_session_date=context.day;
 result.valuation_coverage=coverage;
 result.valuation_status=result.active_count===0?'NO_OPEN_POSITIONS':coverage===result.active_count?(context.open?'FRESH_GOOGLE_VALUATION':'LAST_SESSION_VALUATION'):coverage?'PARTIAL':'UNAVAILABLE_OR_STALE';
 result.active_unrealized_model_pnl=coverage===result.active_count?Math.round((pnl+Number.EPSILON)*100)/100:null;
 result.valuation_model_unrealized_pnl=result.active_unrealized_model_pnl;
 return result;
}
function createIntradayValuation({getSheetsClient,clock=()=>new Date(),chart=chartMinuteQuote,logger=console}={}){
 if(typeof getSheetsClient!=='function')throw Error('GOOGLE_VALUATION_SHEETS_REQUIRED');
 let cache=[],identity='',next=0,inFlight=null,backoff=0,projectionAt=null;
 return async function decorate(base){
  if(!base?.available||!base.data)return base;
  const now=clock(),context=valuationSession(now),positions=base.data.active_portfolio||[],
   key=base.data.snapshot_date+'|'+context.day+'|'+context.open+'|'+positions.map(p=>[p.ticker,p.exchange,p.entry_date,p.entry_price].join(':')).join('|');
  if(key!==identity){cache=[];next=0;backoff=0;identity=key;projectionAt=now;}
  if(positions.length&&now.getTime()>=next&&!inFlight){
   inFlight=(async()=>{
    const quotes=new Map(cache.filter(q=>etParts(q.timestamp).day===context.day).map(q=>[q.ticker,q]));
    try{
     const sheets=await getSheetsClient(),sheetQuotes=await readGoogleSheet({sheets,positions,now});
     for(const quote of sheetQuotes){
      const prior=quotes.get(quote.ticker);
      if(!prior||Date.parse(quote.timestamp)>=Date.parse(prior.timestamp))quotes.set(quote.ticker,quote);
     }
     backoff=0;
    }catch{backoff=Math.min(3,backoff+1);}
    const missing=positions.filter(p=>{
     const q=quotes.get(p.ticker);
     return !quoteUsable(q,now)||(!context.open&&context.closeTime-Date.parse(q.timestamp)>MAX_BAR_AGE);
    });
    // Two concurrent chart reads at most; no 518-stock intraday research.
    let index=0;
    await Promise.all(Array.from({length:Math.min(2,missing.length)},async()=>{
     while(index<missing.length){
      const p=missing[index++];
      try{
       const q=await chart({ticker:p.ticker,exchange:p.exchange,now});
       if(q){
        const prior=quotes.get(q.ticker);
        if(!prior||Date.parse(q.timestamp)>Date.parse(prior.timestamp))quotes.set(q.ticker,q);
       }
      }catch{} // Retain original evidence/time; never fabricate price.
     }
    }));
    cache=[...quotes.values()];
    projectionAt=now;
    // One sanitized, public-market-data observation per bounded refresh.
    // Render readback can verify real Google timestamps without exposing credentials.
    const evaluated=project(base.data,cache.map(q=>({...q,stale:!quoteUsable(q,now)})),now);
    logger?.info?.('SWING_INTRADAY_VALUATION '+JSON.stringify({
     asOf:evaluated.valuation_as_of,date:evaluated.snapshot_date,
     coverage:evaluated.valuation_coverage,active:evaluated.active_count,
     entries:evaluated.active_portfolio.map(p=>({ticker:p.ticker,status:p.valuation_status,
      price:p.current_valuation_price,source:p.quote_source,sourceTime:p.quote_timestamp_et,
      modelPnl:p.unrealized_model_pnl})),aggregatePnl:evaluated.active_unrealized_model_pnl
    }));
    next=now.getTime()+TTL*(context.open?Math.min(5,2**Math.max(0,backoff-1)):5);
   })().finally(()=>{inFlight=null});
  }
  if(inFlight)await inFlight;
  const observed=cache.filter(q=>etParts(q.timestamp).day===context.day)
   .map(q=>({...q,stale:!quoteUsable(q,now)}));
  // Preserve stable HTML/API fingerprints between reads. Freshness and session
  // admission still use the actual clock, not the earlier observation time.
  const data=project(base.data,observed,now);
  data.valuation_as_of=(projectionAt||now).toISOString();
  return {...base,data};
 };
}
module.exports={ENGINE2_ID,GRID_ID,GRID,TTL,MAX_QUOTE_AGE,MAX_BAR_AGE,CHART_SOURCE,
 etParts,sourceTime,market,valuationSession,quoteUsable,quoteRow,readGoogleSheet,chartDecode,chartMinuteQuote,
 project,createIntradayValuation};
