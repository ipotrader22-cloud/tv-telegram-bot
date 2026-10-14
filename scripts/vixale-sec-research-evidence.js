'use strict';
// Read-only SEC filing discovery for live Active Portfolio research evidence.
// Filing arrival alone NEVER constitutes a completed ticker Research Note or score review.
const TICKERS=Object.freeze(['PLTR','NVDA','DELL','PANW','AAOI','COHR','XOM','FTNT']);
const REGISTRY='https://www.sec.gov/files/company_tickers.json';
const FORMS=new Set(['8-K','10-Q','10-K']);
function normTicker(x){return String(x||'').trim().toUpperCase();}
function mapRegistry(raw){
 const out=new Map();
 for(const row of Object.values(raw)){
  if(!row||!Number.isSafeInteger(row.cik_str)||!row.title)continue;
  const ticker=normTicker(row.ticker);
  if(!TICKERS.includes(ticker))continue;
  if(out.has(ticker))throw Error('SEC: duplicated ticker '+ticker);
  out.set(ticker,{ticker,cik:String(row.cik_str).padStart(10,'0'),issuer:row.title});
 }
 return out;
}
function parseRecent(payload,{ticker,cik,reviewDate,earliest}){
 const recent=payload?.filings?.recent;
 const fields=['form','accessionNumber','filingDate','primaryDocument'];
 if(!recent||!fields.every(k=>Array.isArray(recent[k])))throw Error('SEC submissions invalid '+ticker);
 if(recent.form.length>200000)throw Error('SEC submissions excessive '+ticker);
 const rows=[];
 for(let i=0;i<recent.form.length;i++){
  const form=recent.form[i],date=recent.filingDate[i],acc=recent.accessionNumber[i],doc=recent.primaryDocument[i];
  if(!FORMS.has(form)||typeof date!=='string'||date<earliest||date>reviewDate||! /^\d{10}-\d{2}-\d{6}$/.test(acc)||! /^[a-zA-Z0-9._-]{1,120}$/.test(doc))continue;
  const url='https://www.sec.gov/Archives/edgar/data/'+Number(cik)+'/'+acc.replace(/-/g,'')+'/'+doc;
  rows.push({ticker,cik,form,filingDate:date,officialUrl:url,provenance:'sec.gov official submission',verifiedIdentity:true,reviewed:false});
 }
 return rows.sort((a,b)=>b.filingDate.localeCompare(a.filingDate)).slice(0,12);
}
async function getJson(url,{request=fetch,userAgent='VIXALE Research Desk contact ipotrader22@gmail.com'}={}){
 const response=await request(url,{headers:{'User-Agent':userAgent,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw Error('SEC HTTP '+response.status);
 const size=Number(response.headers?.get?.('content-length')||0);
 if(size>8000000)throw Error('SEC oversized JSON');
 const body=await response.text();
 if(body.length>8000000)throw Error('SEC oversized JSON');
 return JSON.parse(body);
}
async function collectSec({tickers=TICKERS,reviewDate,earliest,request=fetch}){
 const reg=mapRegistry(await getJson(REGISTRY,{request}));
 const records={},missing=[];
 for(const ticker of tickers){
  if(!reg.has(ticker)){missing.push(ticker);continue;}
  const {cik,issuer}=reg.get(ticker);
  try{const payload=await getJson('https://data.sec.gov/submissions/CIK'+cik+'.json',{request});
    records[ticker]={issuer,cik,filings:parseRecent(payload,{ticker,cik,reviewDate,earliest})};
  }catch(e){records[ticker]={issuer,cik,filings:[],blocked:true,reason:String(e.message).slice(0,100)};}
 }
 return {reviewDate,earliest,records,missing,complete:missing.length===0&&Object.values(records).every(x=>!x.blocked)};
}
module.exports={TICKERS,REGISTRY,mapRegistry,parseRecent,collectSec};
