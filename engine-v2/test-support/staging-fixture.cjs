'use strict';
// Synthetic provider boundaries for tests only. Never imported by the runtime.
const {createAutonomousResearchProvider}=require('../autonomous-research-provider.cjs');
const {CASH,CLOSED}=require('../staging-sheets-publisher.cjs');
const {STAGING_ID,LEASE_ID,FENCE_ID,LEASE_KEY,FENCE_KEY,meta}=require('../native-sheets-lease.cjs');
const {validateMorningCommit}=require('../clean-ledger.cjs');
const {runCleanCycle}=require('../clean-cycle-runner.cjs');
const {stableStringify}=require('../stable-json.cjs');
const date='2026-10-22',runAt=date+'T14:00:00.000Z';
const roundTrip=x=>JSON.parse(stableStringify(x));
function providers(){
 const symbols=['AMD','SPY','QQQ','SMH','XLK','XLE'];
 const artifact={gate:'RESEARCH_INPUTS',result:'PASS',date,mode:'CLEAN_EPOCH',candidates:['AMD'],collectedAt:date+'T13:59:00Z',data:symbols.map(t=>({
  source:'https://query1.finance.yahoo.com/v8/finance/chart/'+t,exchange:'NASDAQ',metrics:{symbol:t,quoteDate:date,dailyBars:250,lastCompleteDate:'2026-10-21',lastCompleteClose:110,sma20:105,sma50:100,sma200:90,lastCompleteRelativeVolume:1.4,upDownVolume20:1.8,range5Pct:7,range20Pct:15,high20:112,high60:120,return20Pct:t==='AMD'?12:t==='SPY'?0:6,return60Pct:t==='AMD'?30:t==='SPY'?0:10,quoteTime:date+'T13:59:00Z',price:112}}))};
 const news={status:'COVERAGE_COMPLETE_SCORING_PENDING',date,complete:true,checkedAt:date+'T13:59:00Z',sourceId:'TEST_NEWS',tickers:['AMD'],evidence:[]};
 return {researchProvider:createAutonomousResearchProvider({universeCsv:'AMD',sectorByTicker:{AMD:'SMH'},artifactProvider:{getArtifact:async()=>artifact},newsProvider:{collect:async()=>news}}),quoteProvider:{getQuotes:async()=>[{ticker:'AMD',price:112,timestamp:date+'T13:59:00Z',sourceId:'TEST_QUOTE',provider:'TEST',session:'REGULAR',verified:true,exchangeVolume:1000}]}};
}
function memoryStore(){
 const rows=new Map();let busy=false;
 const store={rows,async withLock(work){if(busy)return {status:'BUSY'};busy=true;try{return await work({guard:async()=>{},get:async d=>roundTrip(rows.get(d)||null),save:async artifact=>{const r={artifact:roundTrip(artifact),state:{}};rows.set(artifact.manifest.payload.date,r);return roundTrip(r)},update:async(d,c)=>{const r=rows.get(d);r.state={...r.state,...roundTrip(c)};return roundTrip(r.state)},pending:async()=>[...rows].find(([,r])=>!['DELIVERED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED','EMAIL_DISABLED'].includes(r.state.delivery))?.[0]||null})}finally{busy=false}},async publishedFeed(){return [...rows.values()].filter(r=>r.state.sheet==='VERIFIED').at(-1)?.artifact.feed||null}};
 return store;
}
function memoryLedger(){
 let record=null,state=null;
 return {readRun:async()=>record&&roundTrip(record),readState:async()=>state&&roundTrip(state),runCycle:args=>runCleanCycle({...args,getPrior:async()=>state,commit:async({inputs})=>{
  const check=validateMorningCommit(inputs);if(check.status!=='READY_FOR_SHADOW_COMMIT')return check;
  record={run_id:check.plan.runId,payload_hash:'test-evidence',model:check.plan.model,evidence_manifest:{inputs,publicCandidates:[]}};
  state={epoch:'2026-10-19',date,active:inputs.positions,closed:inputs.closed,history:[{date,equity:check.plan.model.equity,realized:check.plan.model.realized,unrealized:check.plan.model.unrealized}]};
  return {status:'SHADOW_COMMITTED'};
 }})};
}
function fakeSheets(){
 const titles={968436309:'Open Positions',650700609:'Closed Trades',1474454824:'Portfolio',1441454616:'Public Feed',177001100:'Equity History'};
 const cells=new Map();let metadata=[meta(FENCE_ID,FENCE_KEY,'TEST_INCEPTION')],writes=0,loseReply=false;
 const key=(s,r,c)=>s+'!'+r+':'+c,set=(s,r,c,v)=>cells.set(key(s,r,c),v);
 set('Public Feed',6,1,CASH);set('Public Feed',32,0,CLOSED);set('Equity History',1,0,'2026-10-19');
 set('Equity History',1,2,'=10000*IFERROR(SUM(FILTER(\'Closed Trades\'!$L$4:$L,\'Closed Trades\'!$Q$4:$Q<>"NO")),0)');
 set('Equity History',1,3,0);set('Equity History',1,4,'=C2+D2');set('Equity History',1,5,'=100000+E2');
 for(let c=8;c<12;c++)set('Open Positions',3,c,'=TEST_PRESERVED_FORMULA');
 function read(range,option){
  const m=range.match(/^'([^']+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);if(!m)throw Error('TEST_BAD_RANGE:'+range);
  const column=x=>[...x].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
  const [s,r1,r2,c1,c2]=[m[1],+m[3]-1,+(m[5]||m[3])-1,column(m[2]),column(m[4]||m[2])];
  const values=[];
  for(let r=r1;r<=r2;r++){const row=[];for(let c=c1;c<=c2;c++){
   let v=cells.get(key(s,r,c))??'';
   if(option==='UNFORMATTED_VALUE'&&s==='Public Feed'&&r===6&&c===1)v='90.0%';
   if(option==='UNFORMATTED_VALUE'&&s==='Equity History'&&typeof v==='string'&&v.startsWith('=')){
    if(c===2)v=0;if(c===4)v=cells.get(key(s,r,3))||0;if(c===5)v=100000+(cells.get(key(s,r,3))||0);
   }row.push(v);
  }values.push(row)}
  while(values.length&&values.at(-1).every(x=>x===''))values.pop();
  return {range,values};
 }
 const api={spreadsheets:{get:async args=>{if(args.spreadsheetId!==STAGING_ID)throw Error('WRONG_WORKBOOK');return {data:{spreadsheetId:STAGING_ID,developerMetadata:structuredClone(metadata)}}},values:{batchGet:async({spreadsheetId,ranges,valueRenderOption})=>{if(spreadsheetId!==STAGING_ID)throw Error('WRONG_WORKBOOK');return {data:{valueRanges:ranges.map(r=>read(r,valueRenderOption))}}}},batchUpdate:async({spreadsheetId,requestBody})=>{
  if(spreadsheetId!==STAGING_ID)throw Error('WRONG_WORKBOOK');
  const next=structuredClone(metadata),changes=[];let financial=false;
  for(const req of requestBody.requests){
   if(req.deleteDeveloperMetadata){const f=req.deleteDeveloperMetadata.dataFilter.developerMetadataLookup;for(let i=next.length-1;i>=0;i--)if(next[i].metadataKey===f.metadataKey&&next[i].metadataValue===f.metadataValue)next.splice(i,1)}
   else if(req.createDeveloperMetadata){const m=req.createDeveloperMetadata.developerMetadata;if(next.some(x=>x.metadataId===m.metadataId))throw Error('DUPLICATE_METADATA_ID');next.push(m)}
   else if(req.updateCells){financial=true;const x=req.updateCells,r=x.range;x.rows.forEach((row,i)=>row.values.forEach((cell,j)=>{const v=cell.userEnteredValue;changes.push([titles[r.sheetId],r.startRowIndex+i,r.startColumnIndex+j,v?.formulaValue??v?.numberValue??v?.stringValue??''])}))}
   else throw Error('UNEXPECTED_MUTATION');
  }
  metadata=next;changes.forEach(x=>set(...x));if(financial)writes++;
  if(financial&&loseReply){loseReply=false;throw Error('SIMULATED_TIMEOUT_AFTER_COMMIT')}
  return {data:{}};
 }}};
 return {api,cells,set,get writes(){return writes},loseNextReply(){loseReply=true},replaceMetadata(m){metadata=m}};
}
module.exports={date,runAt,providers,memoryLedger,memoryStore,fakeSheets};
