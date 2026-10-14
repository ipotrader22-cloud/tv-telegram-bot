'use strict';
// Validate machine-generated research proposals independently of the language model.
const crypto=require('node:crypto');
const {CAPS,FACTORS,reviewSet}=require('./vixale-review-evidence-gate');
const {session,previousSession}=require('./swing-market-calendar');
function blocked(m){throw Error('SCORE BLOCKED: '+m);}
const validUrl=u=>{try{return new URL(u).protocol==='https:';}catch{return false;}};
function contextGate({date,research,snapshot,news}){
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||!session(date).open)blocked('NYSE session invalid');
 if(research?.gate!=='RESEARCH_INPUTS'||research.result!=='PASS'||research.date!==date)
   blocked('Current completed-session OHLCV artifact missing');
 const previous=previousSession(date),map=new Map(research.data.map(x=>[x.metrics?.symbol,x]));
 if(map.size!==research.data.length)blocked('Duplicate OHLCV metric symbols');
 const benchmarks={};
 for(const ticker of ['SPY','QQQ','SMH','XLK','XLE']){
  const b=map.get(ticker)?.metrics;
  if(!b || b.lastCompleteDate!==previous || b.dailyBars<200 || !Number.isFinite(b.return20Pct))
    blocked('Missing benchmark '+ticker);
  benchmarks[ticker]=b;
 }
 const symbols=[...new Set([
  ...snapshot.openPositions.filter(x=>x.status==='Active Portfolio').map(x=>x.ticker),
  ...snapshot.candidates.map(x=>x.ticker)])].sort();
 if(!symbols.length||symbols.length>20)blocked('Invalid universe');
 const input=symbols.map(ticker=>{
  const source=map.get(ticker),m=source?.metrics;
  if(!m||m.quoteDate!==date||m.lastCompleteDate!==previous||m.dailyBars<200||
    !['price','sma20','sma50','sma200','return20Pct','return60Pct','lastCompleteRelativeVolume']
      .every(k=>Number.isFinite(m[k])))blocked('Invalid OHLCV '+ticker);
  const articles=news[ticker];
  if(!Array.isArray(articles)||!articles.length||
    articles.some(x=>!validUrl(x.url)||!/^\d{4}-\d\d-\d\d$/.test(x.publishedDate)||
      x.publishedDate>date||x.publishedDate<previous||x.verified!==true))
     blocked('Independent dated news missing '+ticker);
  return {ticker,metrics:m,news:articles};
 });
 return {previous,symbols,input,benchmarks};
}
function schema(){
 const fields=Object.fromEntries(FACTORS.map(n=>[n,{type:'integer'}]));
 const provenance=Object.fromEntries(FACTORS.map(n=>[n,{type:'object',
   additionalProperties:false,required:['asOfDate','sources','rationale'],
   properties:{asOfDate:{type:'string'},sources:{type:'array',items:{type:'string'}},
    rationale:{type:'string'}}}]));
 const review={type:'object',additionalProperties:false,
  required:['ticker','score','reviewDate','factors','evidence'],
  properties:{ticker:{type:'string'},score:{type:'integer'},reviewDate:{type:'string'},
   factors:{type:'object',additionalProperties:false,required:FACTORS,properties:fields},
   evidence:{type:'object',additionalProperties:false,required:FACTORS,properties:provenance}}};
 return {type:'object',additionalProperties:false,required:['reviews'],
  properties:{reviews:{type:'array',items:review}}};
}
function validate({date,research,snapshot,news},answer){
 const x=contextGate({date,research,snapshot,news});
 if(!Array.isArray(answer?.reviews)||answer.reviews.length!==x.symbols.length)blocked('Partial review');
 const artifact='sha256:'+crypto.createHash('sha256').update(JSON.stringify({date,research,news})).digest('hex');
 const reviews=answer.reviews.map(r=>{
  const item=x.input.find(i=>i.ticker===r.ticker);if(!item)blocked('Unknown symbol '+r.ticker);
  const allowed=new Set(item.news.map(i=>i.url));
  for(const name of FACTORS){
   const e=r.evidence?.[name];
   if(!e||!Array.isArray(e.sources)||!e.sources.length||
     e.sources.some(url=>!allowed.has(url))||
     e.asOfDate<x.previous||e.asOfDate>date)blocked('Unverified evidence '+r.ticker+'/'+name);
  }
  const m=item.metrics;
  return {...r,sourceArtifact:artifact,
   marketEvidence:{lastCompletedSession:m.lastCompleteDate,completedDailyBars:m.dailyBars,
    exchangeVolume:true,sma20:m.sma20,sma50:m.sma50,sma200:m.sma200,
    relativePerformance:m.return20Pct-x.benchmarks.SPY.return20Pct,relativeVolume:m.lastCompleteRelativeVolume}};
 });
 reviewSet(snapshot,reviews,date);
 return {date,artifact,reviews,status:'RESEARCH_ONLY'};
}
module.exports={CAPS,contextGate,schema,validate};
