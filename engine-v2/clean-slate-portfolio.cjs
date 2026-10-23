'use strict';
// Clean-slate model portfolio generation, isolated from historical workbook.
// This module does not publish, run schedules, or execute real orders.
const {score,snapshot}=require('./core.cjs');
const EPOCH='2026-10-19',CAPITAL=100000,MAX_POSITIONS=10,ALLOCATION=10000;
function initializeEpoch({date=EPOCH,openingCapital=CAPITAL,existingPositions=[],closed=[]}={}){
 if(date!==EPOCH)throw Error('Unexpected clean-slate epoch');
 if(openingCapital!==CAPITAL)throw Error('Unexpected model starting capital');
 if(existingPositions.length||closed.length)throw Error('Clean slate cannot import legacy lots');
 return Object.freeze({epoch:date,capital:openingCapital,active:[],closed:[],totalRealized:0,status:'EMPTY_AWAITING_VERIFIED_RESEARCH',historicalImported:false});
}
function prepareDailyReview({date,positions,researchComplete,quoteEvidenceComplete,marketSessionConfirmed}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<EPOCH)throw Error('Invalid new epoch review date');
 if(researchComplete!==true||quoteEvidenceComplete!==true||marketSessionConfirmed!==true)
  return {status:'BLOCKED',date,reason:'MISSING_RESEARCH_MARKET_DATA_OR_SESSION_EVIDENCE',publishable:false};
 if(!Array.isArray(positions)||positions.length>MAX_POSITIONS)throw Error('Invalid position count');
 const keys=new Set();
 for(const x of positions){
  const key=x.ticker+'|'+x.entryDate;
  if(keys.has(key))throw Error('Duplicate model lot '+key);
  keys.add(key);
  if(x.entryDate<EPOCH)throw Error('Legacy trade excluded: '+key);
  if(!Number.isInteger(x.currentScore)||score(x.factors)!==x.currentScore||x.currentScore<70)throw Error('Unverified nine-factor score: '+key);
  if(x.fullReviewDate!==date)throw Error('Stale review: '+key);
  if(!(Number.isFinite(x.currentPrice)&&x.currentPrice>0))throw Error('Missing quote: '+key);
 }
 return {status:'READY_FOR_VALIDATED_SNAPSHOT',date,publishable:false,eligiblePositions:positions.length};
}
function buildDailySnapshot({date,positions=[],closed=[],researchComplete=false,quoteEvidenceComplete=false,marketSessionConfirmed=false}={}){
 const gate=prepareDailyReview({date,positions,researchComplete,quoteEvidenceComplete,marketSessionConfirmed});
 if(gate.status!=='READY_FOR_VALIDATED_SNAPSHOT')return gate;
 const result=snapshot({reviewDate:date,active:positions,closed,researchComplete:true});
 return {...result,epoch:EPOCH,status:'VALIDATED_NOT_PUBLISHED',publishable:false};
}
module.exports={EPOCH,CAPITAL,MAX_POSITIONS,ALLOCATION,initializeEpoch,prepareDailyReview,buildDailySnapshot};
