'use strict';
// Independent research evidence gate. Factor points require dated, independently sourced evidence.
// SHADOW ONLY; does not assign factor points automatically or call brokers.
const {score,CAPS}=require('./core.cjs');
const fail=m=>{throw Error(m)};
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
function validateResearch(x,{reviewDate}={}){
 if(!x||!/^[A-Z.-]+$/.test(x.ticker)||!validDate(reviewDate))fail('Missing ticker or review date');
 if(!Array.isArray(x.bars)||x.bars.length<200)fail('200 completed daily OHLCV bars required');
 const seen=new Set();
 for(const b of x.bars){
  if(!validDate(b.day)||b.day>=reviewDate||seen.has(b.day))fail('Invalid, future or duplicate completed daily bar');
  seen.add(b.day);
  if(![b.open,b.high,b.low,b.close,b.volume].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))fail('Incomplete exchange OHLCV');
  if(b.source==='SOCIAL_VOLUME')fail('Social activity cannot substitute exchange volume');
 }
 for(let i=1;i<x.bars.length;i++)if(x.bars[i].day<=x.bars[i-1].day)fail('Daily bars out of chronological order');
 const price=x.bars.at(-1).close;
 const sma=n=>x.bars.slice(-n).reduce((sum,b)=>sum+b.close,0)/n;
 if(!x.factors||!x.factorEvidence)fail('Full nine-factor evidence required');
 const points=score(x.factors);
 for(const k of Object.keys(CAPS)){
  const e=x.factorEvidence[k];
  if(!e||!validDate(e.date)||e.date>reviewDate||typeof e.source!=='string'||!e.source.trim()||typeof e.description!=='string'||!e.description.trim())fail('Missing dated factor evidence: '+k);
 }
 if(x.publicScore!==points)fail('Published score does not reconcile with nine factors');
 if(!Number.isInteger(x.publicScore)||x.publicScore<0||x.publicScore>100)fail('Invalid public score');
 return Object.freeze({ticker:x.ticker,reviewDate,score:points,eligible:points>=70,preferred:points>=80,indicators:{close:price,sma20:sma(20),sma50:sma(50),sma200:sma(200)},bars:x.bars.length,complete:true});
}
module.exports={validateResearch};
