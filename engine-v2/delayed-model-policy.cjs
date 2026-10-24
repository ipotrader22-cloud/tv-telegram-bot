'use strict';
const {localET}=require('./market-data-adapter.cjs');
const {previousSession}=require('../scripts/swing-market-calendar');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {stableStringify}=require('./stable-json.cjs');
const {createHash}=require('node:crypto');
const POLICY='DELAYED_0940_MODEL_V1';
const hash=x=>createHash('sha256').update(stableStringify(x)).digest('hex');
function etTime(date,minute){
 const utc=Date.parse(date+'T12:00:00Z'),offset=localET(new Date(utc).toISOString()).minute-720;
 return new Date(Date.parse(date+'T00:00:00Z')+(minute-offset)*60000).toISOString();
}
const priorIdentity=p=>p?{epoch:p.epoch,date:p.date,active:p.active,closed:p.closed}:null;
function validatePrepared(p,{date,previous,now}={}){
 if(!p||p.policy!==POLICY||p.date!==date||p.sourceSession!==previousSession(date)||p.priorHash!==hash(priorIdentity(previous)))throw Error('PREOPEN_IDENTITY_MISMATCH');
 const {fingerprint,...payload}=p;
 if(fingerprint!==hash(payload))throw Error('PREOPEN_HASH_MISMATCH');
 const t=Date.parse(p.preparedAt),prior=sessionEvidence(p.sourceSession),close=prior.closeEt.split(':').map(Number);
 if(!Number.isFinite(t)||t<Date.parse(etTime(p.sourceSession,close[0]*60+close[1]))||t>=Date.parse(etTime(date,570))||t>Date.parse(now))throw Error('PREOPEN_TIME_INVALID');
 if(p.batch?.date!==date||p.batch.items.some(x=>x.lastCompletedSessionDate!==p.sourceSession))throw Error('PREOPEN_SESSION_INCOMPLETE');
 return p;
}
function fixedQuote(bars,{ticker,date,fetchedAt}){
 const cutoff=etTime(date,580),matches=bars.filter(b=>b.ticker===ticker&&b.date===date&&b.end===cutoff);
 if(matches.length!==1)throw Error('EXACT_0940_BAR_REQUIRED');
 const b=matches[0];
 if(b.start!==etTime(date,579)||b.provider!=='YAHOO_CHART'||!b.sourceId||!Number.isFinite(b.close)||b.close<=0||b.volume<=0||Date.parse(fetchedAt)<Date.parse(cutoff))throw Error('INVALID_0940_BAR');
 return {ticker,price:b.close,timestamp:cutoff,sourceId:b.sourceId,provider:b.provider,session:'REGULAR',verified:true,exchangeVolume:b.volume,priceKind:'MINUTE_BAR_CLOSE',indicative:true,delayed:true,modelFill:false,policy:POLICY,fetchedAt};
}
function validFixedQuote(q,{date,runAt}={}){
 return q?.policy===POLICY&&q.provider==='YAHOO_CHART'&&q.timestamp===etTime(date,580)&&q.priceKind==='MINUTE_BAR_CLOSE'&&q.indicative===true&&q.modelFill===false&&q.verified===true&&q.session==='REGULAR'&&!!q.sourceId&&Number.isFinite(q.price)&&q.price>0&&q.exchangeVolume>0&&Date.parse(q.fetchedAt)>=Date.parse(q.timestamp)&&Date.parse(q.fetchedAt)<=Date.parse(runAt);
}
module.exports={POLICY,hash,priorIdentity,etTime,validatePrepared,fixedQuote,validFixedQuote};
