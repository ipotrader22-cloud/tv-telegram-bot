'use strict';
// Read-only staging audit with credentials from GitHub Secrets; never mutates either workbook.
const {google}=require('googleapis');
const {workbook}=require('./vixale-review-evidence-gate');
const STAGING='10uRxpyGrItn_5rGrbhEsb-xoMJU7uv9NEhkCNcO8q80';
const PRODUCTION='14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
const RANGES=[
  "'Portfolio'!A8:M40","'Open Positions'!A4:R40",
  "'Public Feed'!A1:I45","'Closed Trades'!A4:R90","'Equity History'!A1:G45"
];
const get=(rows,i)=>rows?.[i]??'';
const number=x=>typeof x==='number'?x:Number(String(x||'').replace(/[,$%]/g,''));
const ticker=x=>String(x||'').trim().toUpperCase();
function parseSnapshot(blocks){
 const [p,op,pub,closed,equity]=blocks;
 const port=(p||[]).filter(r=>ticker(r[2])&&r[12]==='Active Portfolio')
   .map(r=>({ticker:ticker(r[2]),score:number(r[3]),entryPrice:number(r[5]),status:r[12]}));
 const open=(op||[]).filter(r=>ticker(r[2])&&r[4]==='Active Portfolio')
   .map(r=>({ticker:ticker(r[2]),entryScore:number(r[3]),entryDate:String(r[0]),entryPrice:number(r[5]),status:r[4],reviewDate:String(r[13])}));
 const feed=(pub||[]).slice(13,22).filter(r=>ticker(r[0]) && /^[A-Z.]+$/.test(ticker(r[0])))
   .map(r=>({ticker:ticker(r[0]),score:number(r[2]),entryPrice:number(r[4]),reviewDate:String(r[7])}));
 const candidates=(pub||[]).slice(25,30).filter(r=>ticker(r[0]))
   .map(r=>({ticker:ticker(r[0]),score:number(r[1]),reviewDate:String(r[3])}));
 const history=(equity||[]).slice(1).filter(r=>String(r[0]||'').startsWith('20'));
 const closedTrades=(closed||[]).filter(r=>ticker(r[2])).map(r=>({
   ticker:ticker(r[2]),entryDate:String(r[4]),exitDate:String(r[0]),
   exitTime:String(r[1]),reason:String(r[13]),include:String(r[16]||''),
   effectiveDate:String(r[17]||'')
 }));
 return {portfolio:port,openPositions:open,publicActive:feed,candidates,closedTrades,
  historyDates:history.map(r=>String(r[0]))};
}
async function main(){
 if(process.env.VIXALE_STAGING_SPREADSHEET_ID && process.env.VIXALE_STAGING_SPREADSHEET_ID!==STAGING)
  throw Error('Not the approved private staging workbook');
 if(STAGING===PRODUCTION) throw Error('Staging may not equal production');
 const raw=process.env.VIXALE_GOOGLE_SERVICE_ACCOUNT_JSON;
 if(!raw) throw Error('Secret missing');
 const credentials=JSON.parse(raw);
 const auth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 const api=google.sheets({version:'v4',auth});
 const read=async(option,ranges)=>{
  const response=await api.spreadsheets.values.batchGet({spreadsheetId:STAGING,
   ranges,valueRenderOption:option,dateTimeRenderOption:'FORMATTED_STRING'});
  return response.data.valueRanges.map(x=>x.values||[]);
 };
 const blocks=await read('UNFORMATTED_VALUE',RANGES);
 const snapshot=parseSnapshot(blocks);
 const formulaRanges=["'Public Feed'!B7","'Public Feed'!A33",
  "'Equity History'!C2:F30"];
 const f=await read('FORMULA',formulaRanges);
 const e=f[2];
 const histories=blocks[4].slice(1).filter(r=>String(r[0]||'').startsWith('20'));
 const okHistoric=histories.every((row,i)=>{
  const originalIndex=blocks[4].findIndex(x=>x===row);
  const formulas=e[originalIndex-1]||[];
  return typeof formulas[0]==='string'&&formulas[0].startsWith('=') &&
    typeof row[3]==='number' &&
    typeof formulas[2]==='string'&&formulas[2].startsWith('=') &&
    typeof formulas[3]==='string'&&formulas[3].startsWith('=');
 });
 snapshot.formulas={
  cashPct:String(f[0]?.[0]?.[0]||'').startsWith('='),
  closedSpill:String(f[1]?.[0]?.[0]||'').startsWith('='),
  equityHistoryProtected:okHistoric
 };
 const result=workbook(snapshot);
 if(snapshot.historyDates.filter(x=>x===snapshot.historyDates.at(-1)).length!==1)
  throw Error('Duplicate latest history date');
 console.log(JSON.stringify({gate:'STAGING_READ_ONLY',status:'PASS',
  staging:true,active:result.activeTickers,candidates:snapshot.candidates.length,
  closedTrades:result.closedTrades,historyLatest:snapshot.historyDates.at(-1),
  protectedFormulas:true,
  note:'No production writes; no staging writes; no email sent'}));
}
main().catch(e=>{console.error('STAGING BLOCKED: '+(e.response?.status||'')+' '+e.message);process.exitCode=1;});
