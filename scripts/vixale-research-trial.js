'use strict';
// Manual research trial only. Never writes financial data or sends notifications.
const fs=require('node:fs'),crypto=require('node:crypto');
const {readSnapshot}=require('./vixale-live-research-snapshot');
const {getNews}=require('./vixale-news-evidence');
const {checkUrl}=require('./vixale-article-verifier');
const {contextGate,schema,validate,CAPS}=require('./vixale-research-score-gate');
const {previousSession,session}=require('./swing-market-calendar');
function fail(message){throw Error('RESEARCH RUN BLOCKED: '+message);}
function dateNY(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',
 year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
async function openai(payload,key){
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
 if(!r.ok)fail('OpenAI scoring HTTP '+r.status);
 const response=await r.json();
 if(response.status!=='completed')fail('Incomplete scoring result');
 const messages=(response.output||[]).flatMap(x=>x.content||[])
   .filter(x=>x.type==='output_text').map(x=>x.text);
 if(messages.length!==1)fail('Ambiguous scoring JSON response');
 try{return JSON.parse(messages[0]);}catch{fail('Invalid JSON from scorer');}
}
async function main(){
 if(process.env.VIXALE_ENABLE_PRODUCTION_WRITES==='true')fail('No production writers in research job');
 const date=dateNY();
 if(!session(date).open)fail('No NYSE session today');
 const key=process.env.VIXALE_OPENAI_API_KEY;
 if(!key)fail('OpenAI secret absent');
 const raw=process.env.VIXALE_GOOGLE_SERVICE_ACCOUNT_JSON;
 if(!raw)fail('Google credential absent');
 const snapshot=await readSnapshot({credentials:JSON.parse(raw)});
 const research=JSON.parse(fs.readFileSync('swing-research-inputs.json','utf8'));
 if(research.date!==date)fail('Stale research input');
 const symbols=[...new Set([...snapshot.openPositions.map(x=>x.ticker),
  ...snapshot.candidates.map(x=>x.ticker)])].sort();
 const news={};
 for(const ticker of symbols){
  const response=await getNews({ticker,date,key});
  const verified=[];
  const newsFloor=new Date(Date.parse(date+'T00:00:00Z')-30*86400000).toISOString().slice(0,10);
  for(const url of response.urls.slice(0,4)){
   try{verified.push(await checkUrl(url,{reviewDate:date,previous:newsFloor}));}
   catch(e){console.log(JSON.stringify({stage:'NEWS',ticker,sourceRejected:true,reason:String(e.message||'SOURCE_ERROR').slice(0,110),
      sourceHost:(()=>{try{return new URL(url).hostname;}catch{return 'invalid'}})()}));}
  }
  if(!verified.length)fail('No independently verified recent article '+ticker);
  news[ticker]=verified;
 }
 const context={date,research,snapshot,news};
 const source=contextGate(context);
 const result=await openai({model:'gpt-4.1-mini',store:false,
  instructions:'Evaluate all nine VIXALE score factors using exact max points '+JSON.stringify(CAPS)+
  '. Analyze only supplied dated article excerpts and completed-session price/volume metrics. '+
  'For each factor give dated concise reasoning and cite one or more exact URLs supplied for that ticker. '+
  'Never invent dates or sources or declare unsupported news verified. '+
  'When evidence is incomplete do not claim a complete assessment. Model-only, no broker orders.',
  input:[{role:'user',content:JSON.stringify({date,universe:source.input,benchmarks:source.benchmarks})}],
  text:{format:{type:'json_schema',name:'vixale_nine_factor_research',
    strict:true,schema:schema()}}},key);
 const proposal=validate(context,result);
 const digest=crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
 // Research-only log: no internal notes or article excerpts printed.
 console.log(JSON.stringify({gate:'VIXALE_RESEARCH',status:'PASS',date,
  tickers:proposal.reviews.map(x=>x.ticker),digest,
  note:'Research-only. No sheet writes, site changes or email.'}));
 // Keep private evidence within this ephemeral runner; no artifact upload by default.
}
main().catch(e=>{console.error(e.message.replace(/sk-[a-zA-Z0-9_-]+/g,'[REDACTED]'));process.exitCode=1;});
