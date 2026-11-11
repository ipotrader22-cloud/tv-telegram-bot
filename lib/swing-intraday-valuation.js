'use strict';
// Issue #388: read-only website valuation. Never writes Sheets, scores, decisions,
// broker state or model history. Morning Public Feed remains immutable.
const {createHash}=require('node:crypto');
const {session}=require('../scripts/swing-market-calendar');
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
 const {et,open,close}=market(now),trade=etParts(timestamp),age=now.getTime()-Date.parse(timestamp);
 if(!open||trade.day!==et.day||trade.minute<570||trade.minute>=close||
    age<0||age>MAX_QUOTE_AGE)return null;
 return {ticker,price,timestamp,source:'GOOGLEFINANCE',kind:'DELAYED_LAST_QUOTE',
  delayMinutes:delay,sourceHash:hash([symbol,price,timestamp,delay,volume])};
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
 if(!validSymbol(ticker,exchange)||!market(now).open)throw Error('GOOGLE_CHART_IDENTITY_INVALID');
 const day=market(now).et.day,parts=day.split('-').map(Number);
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
  const series=matches[0],observed=now.getTime(),{close}=market(now),quotes=[];
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
   if(observed-end>MAX_BAR_AGE)continue;
   quotes.push({ticker,price,timestamp:new Date(end).toISOString(),source:CHART_SOURCE,
    kind:'COMPLETED_MINUTE_BAR_CLOSE',delayMinutes:null,sourceHash:hash([ticker,exchange,candle,series[8]])});
  }
  quotes.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  return quotes.at(-1)||null;
 }
 return null;
}
function project(snapshot,quotes,now){
 const result=JSON.parse(JSON.stringify(snapshot)),by=new Map(quotes.map(q=>[q.ticker,q]));
 let pnl=0,coverage=0;
 result.active_portfolio=result.active_portfolio.map(p=>{
  const q=by.get(p.ticker),entry=Number(String(p.entry_price||'').replace(/[$,]/g,'')),
   mark=q?.price,valid=!!q&&Number.isFinite(entry)&&entry>0&&Number.isFinite(mark)&&mark>0;
  const unrealized=valid?10000*(mark/entry-1):null;
  if(valid){coverage++;pnl+=unrealized;}
  return {...p,morning_reference_price:p.current_price,morning_reference_return_pct:p.return_pct,
   current_valuation_price:valid?mark:null,
   valuation_return_pct:valid?100*(mark/entry-1):null,
   valuation_status:valid?(q.kind==='COMPLETED_MINUTE_BAR_CLOSE'?'FRESH_MINUTE_BAR':'FRESH_DELAYED'):'UNAVAILABLE',
   quote_source:valid?q.source:null,quote_timestamp_utc:valid?q.timestamp:null,
   quote_timestamp_et:valid?etParts(q.timestamp).text:null,
   quote_delay_minutes:valid?q.delayMinutes:null,valuation_price_kind:valid?q.kind:null,
   unrealized_model_pnl:unrealized};
 });
 result.valuation_read_only=true;result.valuation_as_of=now.toISOString();
 result.valuation_coverage=coverage;
 result.valuation_status=result.active_count===0?'NO_OPEN_POSITIONS':coverage===result.active_count?'FRESH_GOOGLE_VALUATION':coverage?'PARTIAL':'UNAVAILABLE_OR_STALE';
 result.active_unrealized_model_pnl=coverage===result.active_count?Math.round((pnl+Number.EPSILON)*100)/100:null;
 result.valuation_model_unrealized_pnl=result.active_unrealized_model_pnl;
 return result;
}
function createIntradayValuation({getSheetsClient,clock=()=>new Date(),chart=chartMinuteQuote}={}){
 if(typeof getSheetsClient!=='function')throw Error('GOOGLE_VALUATION_SHEETS_REQUIRED');
 let cache=[],identity='',next=0,inFlight=null,backoff=0,projectionAt=null;
 return async function decorate(base){
  if(!base?.available||!base.data)return base;
  const now=clock(),positions=base.data.active_portfolio||[],key=base.data.snapshot_date+'|'+positions.map(p=>[p.ticker,p.exchange,p.entry_price].join(':')).join('|');
  if(key!==identity){cache=[];next=0;backoff=0;identity=key;projectionAt=now;}
  if(market(now).open&&positions.length&&now.getTime()>=next&&!inFlight){
   inFlight=(async()=>{
    const quotes=new Map(cache.filter(q=>now.getTime()-Date.parse(q.timestamp)<=MAX_QUOTE_AGE).map(q=>[q.ticker,q]));
    try{
     const sheets=await getSheetsClient(),sheetQuotes=await readGoogleSheet({sheets,positions,now});
     for(const quote of sheetQuotes){
      const prior=quotes.get(quote.ticker);
      if(!prior||Date.parse(quote.timestamp)>=Date.parse(prior.timestamp))quotes.set(quote.ticker,quote);
     }
     backoff=0;
    }catch{backoff=Math.min(3,backoff+1);}
    const missing=positions.filter(p=>{
     const q=quotes.get(p.ticker),age=now.getTime()-Date.parse(q?.timestamp||'');
     return !q||age<0||age>(q.kind==='COMPLETED_MINUTE_BAR_CLOSE'?MAX_BAR_AGE:MAX_QUOTE_AGE);
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
    next=now.getTime()+TTL*Math.min(5,2**Math.max(0,backoff-1));
   })().finally(()=>{inFlight=null});
  }
  if(inFlight)await inFlight;
  const fresh=cache.filter(q=>{
   const age=now.getTime()-Date.parse(q.timestamp);
   return age>=0&&age<=(q.kind==='COMPLETED_MINUTE_BAR_CLOSE'?MAX_BAR_AGE:MAX_QUOTE_AGE)&&
    etParts(q.timestamp).day===market(now).et.day&&market(now).open;
  });
  // Stable projection identity within each 60-second fetch avoids spurious
  // API-versus-page fingerprint drift while freshness remains checked at now.
  return {...base,data:project(base.data,fresh,projectionAt||now)};
 };
}
module.exports={ENGINE2_ID,GRID_ID,GRID,TTL,MAX_QUOTE_AGE,MAX_BAR_AGE,CHART_SOURCE,
 etParts,sourceTime,market,quoteRow,readGoogleSheet,chartDecode,chartMinuteQuote,
 project,createIntradayValuation};
