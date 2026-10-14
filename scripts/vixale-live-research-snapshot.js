'use strict';
// Read-only canonical workbook evidence. Never update, append or format cells.
const {google}=require('googleapis');
const {workbook}=require('./vixale-review-evidence-gate');
const ID='14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
const RANGES=["'Portfolio'!A8:M40","'Open Positions'!A4:R40",
  "'Public Feed'!A1:I45","'Closed Trades'!A4:R110","'Equity History'!A1:G60"];
function parseBlocks([port,positions,publicRows,closed,equity],formulaBlocks){
 const ticker=x=>String(x||'').trim().toUpperCase();
 const num=x=>typeof x==='number'?x:Number(x);
 const portfolio=port.filter(r=>r[12]==='Active Portfolio'&&ticker(r[2])).map(r=>({
   ticker:ticker(r[2]),status:r[12],score:num(r[3]),entryPrice:num(r[5])}));
 const openPositions=positions.filter(r=>r[4]==='Active Portfolio'&&ticker(r[2])).map(r=>({
   ticker:ticker(r[2]),status:r[4],entryDate:String(r[0]),entryScore:num(r[3]),
   entryPrice:num(r[5]),reviewDate:String(r[13])}));
 const publicActive=publicRows.slice(13,22).filter(r=>/^[A-Z.]+$/.test(ticker(r[0]))).map(r=>({
   ticker:ticker(r[0]),score:num(r[2]),entryPrice:num(r[4]),reviewDate:String(r[7])}));
 const candidates=publicRows.slice(25,30).filter(r=>/^[A-Z.]+$/.test(ticker(r[0]))).map(r=>({
   ticker:ticker(r[0]),score:num(r[1]),reviewDate:String(r[3])}));
 const closedTrades=closed.filter(r=>ticker(r[2])).map(r=>({
   ticker:ticker(r[2]),entryDate:String(r[4]),exitDate:String(r[0]),exitTime:String(r[1]),
   reason:String(r[13]),include:String(r[16]||''),effectiveDate:String(r[17]||'')}));
 const ef=formulaBlocks[2]||[],historic=equity.slice(1).filter(r=>String(r[0]||'').startsWith('20'));
 const equityHistoryProtected=historic.every(row=>{
   const index=equity.indexOf(row),fr=ef[index-1]||[];
   return String(fr[0]||'').startsWith('=') && typeof row[3]==='number' &&
     String(fr[2]||'').startsWith('=') && String(fr[3]||'').startsWith('=');
 });
 const snapshot={spreadsheetId:ID,portfolio,openPositions,publicActive,candidates,closedTrades,
  publicSnapshotDate:String(publicRows[1]?.[1]||''),equityHistoryDate:String(historic.at(-1)?.[0]||''),
  equityDates:historic.map(r=>String(r[0])),
  formulas:{cashPct:String(formulaBlocks[0]?.[0]?.[0]||'').startsWith('='),
   closedSpill:String(formulaBlocks[1]?.[0]?.[0]||'').startsWith('='),
   equityHistoryProtected}};
 workbook(snapshot);
 return snapshot;
}
async function readSnapshot({credentials,spreadsheetId=ID}){
 if(spreadsheetId!==ID)throw Error('Only canonical VIXALE workbook may supply production research evidence');
 const auth=new google.auth.GoogleAuth({credentials,
   scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 const sheets=google.sheets({version:'v4',auth});
 const query=async(ranges,valueRenderOption)=>{
  const r=await sheets.spreadsheets.values.batchGet({spreadsheetId,ranges,valueRenderOption,
    dateTimeRenderOption:'FORMATTED_STRING'});
  return r.data.valueRanges.map(x=>x.values||[]);
 };
 const blocks=await query(RANGES,'UNFORMATTED_VALUE');
 const formulas=await query(["'Public Feed'!B7","'Public Feed'!A33",
   "'Equity History'!C2:F60"],'FORMULA');
 return parseBlocks(blocks,formulas);
}
module.exports={ID,RANGES,parseBlocks,readSnapshot};
