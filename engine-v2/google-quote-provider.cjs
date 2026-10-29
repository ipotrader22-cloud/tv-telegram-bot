'use strict';
// Owner-approved latest Google quote at morning review; never a broker fill.
const {localET}=require('./market-data-adapter.cjs');
const {etTime,hash}=require('./delayed-model-policy.cjs');
const {STAGING_ID}=require('./native-sheets-lease.cjs');
const GOOGLE_POLICY='GOOGLE_LATEST_1000_MODEL_V1';
const QUOTE_SHEET='Engine 2 Quotes',QUOTE_SHEET_ID=290100001;
const MAX_AGE_MS=20*60000;
function sourceTime(value){
 const m=/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value||'');
 if(!m||+m[2]>23||+m[3]>59||+m[4]>59)throw Error('GOOGLE_QUOTE_TIMESTAMP_INVALID');
 const t=new Date(Date.parse(etTime(m[1],+m[2]*60 + +m[3])) + +m[4]*1000).toISOString();
 if(localET(t).date!==m[1])throw Error('GOOGLE_QUOTE_TIMESTAMP_INVALID');
 return t;
}
function normalizeGoogleQuote(v,{date,fetchedAt,runAt=fetchedAt}={}){
 if(!v||!/^(NASDAQ|NYSE|AMEX):[A-Z][A-Z0-9.-]{0,14}$/.test(v.symbol||''))throw Error('GOOGLE_QUOTE_IDENTITY_INVALID');
 const timestamp=sourceTime(v.tradeTimeET),t=localET(timestamp);
 const age=Date.parse(runAt)-Date.parse(timestamp),fetchAge=Date.parse(fetchedAt)-Date.parse(timestamp);
 if(!Number.isFinite(v.price)||v.price<=0||!Number.isFinite(v.dailyVolume)||v.dailyVolume<=0||
    !Number.isFinite(v.delayMinutes)||v.delayMinutes<0||v.delayMinutes>20||
    t.date!==date||t.minute<570||t.minute>=960||
    localET(runAt).date!==date||!Number.isFinite(age)||age<0||age>MAX_AGE_MS||
    !Number.isFinite(fetchAge)||fetchAge<0||Date.parse(fetchedAt)>Date.parse(runAt))
  throw Error('GOOGLE_QUOTE_STALE_OR_INVALID');
 return {ticker:v.symbol.split(':')[1],price:v.price,timestamp,sourceId:'GOOGLEFINANCE:'+hash(v),
  provider:'GOOGLEFINANCE',session:'REGULAR',verified:true,priceKind:'DELAYED_LAST_QUOTE',
  indicative:true,delayed:true,modelFill:false,policy:GOOGLE_POLICY,fetchedAt,
  dailyVolume:v.dailyVolume,delayMinutes:v.delayMinutes,sourceValues:v};
}
function validGoogleQuote(q,{date,runAt}={}){
 try{return hash(normalizeGoogleQuote(q?.sourceValues,{date,runAt,fetchedAt:q?.fetchedAt}))===hash(q);}
 catch{return false;}
}
function createGoogleQuoteProvider({api,clock=()=>new Date()}={}){
 return {async getQuotes({date,tickers}){
  if(!Array.isArray(tickers)||new Set(tickers).size!==tickers.length)throw Error('GOOGLE_QUOTE_IDENTITY_INVALID');
  if(!tickers.length)return [];
  const r=await api.spreadsheets.get({spreadsheetId:STAGING_ID,ranges:["'"+QUOTE_SHEET+"'!A1:F11"],
   includeGridData:true,fields:'spreadsheetId,properties(timeZone),sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue))))'});
  const d=r.data,s=d?.sheets?.[0],grid=s?.data?.[0];
  if(d.spreadsheetId!==STAGING_ID||d.properties?.timeZone!=='America/New_York'||
     s?.properties?.sheetId!==QUOTE_SHEET_ID||s.properties.title!==QUOTE_SHEET||
     (grid?.startRow||0)!==0||(grid?.startColumn||0)!==0)throw Error('GOOGLE_QUOTE_SHEET_INVALID');
  const fetchedAt=clock().toISOString(),byTicker=new Map();
  for(let i=1;i<(grid.rowData||[]).length;i++){
   const cells=grid.rowData[i].values||[],symbol=cells[0]?.effectiveValue?.stringValue;
   if(!symbol)continue;
   const ticker=symbol.split(':')[1];
   if(byTicker.has(ticker))throw Error('GOOGLE_QUOTE_IDENTITY_INVALID');
   const row=i+1,expected=[
    '=IFERROR(GOOGLEFINANCE(A'+row+',"price"),"")',
    '=IFERROR(TEXT(GOOGLEFINANCE(A'+row+',"tradetime"),"yyyy-mm-dd hh:mm:ss"),"")',
    '=IFERROR(GOOGLEFINANCE(A'+row+',"datadelay"),"")',
    '=IFERROR(GOOGLEFINANCE(A'+row+',"volume"),"")'];
   if(expected.some((f,k)=>cells[k+1]?.userEnteredValue?.formulaValue!==f))
    throw Error('GOOGLE_QUOTE_FORMULA_INVALID');
   const v={symbol,price:cells[1]?.effectiveValue?.numberValue,
    tradeTimeET:cells[2]?.effectiveValue?.stringValue,delayMinutes:cells[3]?.effectiveValue?.numberValue,
    dailyVolume:cells[4]?.effectiveValue?.numberValue};
   byTicker.set(ticker,v);
  }
  return tickers.map(ticker=>{
   if(!byTicker.has(ticker))throw Error('GOOGLE_QUOTE_MISSING');
   return normalizeGoogleQuote(byTicker.get(ticker),{date,fetchedAt});
  });
 }};
}
module.exports={GOOGLE_POLICY,QUOTE_SHEET,QUOTE_SHEET_ID,MAX_AGE_MS,sourceTime,normalizeGoogleQuote,validGoogleQuote,createGoogleQuoteProvider};
