'use strict';
// Read-only Engine2 feed built strictly from the separate clean-epoch ledger.
// No copying data from the legacy Source-of-Truth model, no private evidence,
// and no claim a date was reviewed without a committed session.
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const {createHash}=require('node:crypto');
function withSnapshotId(payload){return {...payload,snapshot_id:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};}
const {readLastCleanState}=require('./clean-ledger.cjs');
function makeReadOnlyFeed(latest){
 if(!latest){
  return withSnapshotId({version:2,status:'INCEPTION_ONLY_NOT_REVIEWED',epoch:EPOCH,
   snapshot_date:null,starting_model_equity:100000,current_model_equity:null,
   active_portfolio:[],closed_trades:[],candidates:[],candidate_count:0,active_count:0,
   authoritative:false,published:false,notices:['No independently verified Engine 2 review has been committed.']});
 }
 if(latest.epoch!==EPOCH||!latest.date||!Array.isArray(latest.active)||!Array.isArray(latest.closed))
  throw Error('INVALID_CLEAN_EPOCH_STATE');
 const active=latest.active.map(x=>({
  ticker:x.ticker,entry_date:x.entryDate,entry_price:x.entryPrice,
  current_model_reference_price:x.currentPrice,score:x.currentScore,
  last_full_review_date:x.fullReviewDate,reference_price_kind:x.modelEntryPriceKind||'UNKNOWN',
  indicative_entry:x.modelEntryIndicative===true
 }));
 const closes=latest.closed.filter(x=>x.includePublic==='YES'&&x.effectiveDate<=latest.date).map(x=>({
  ticker:x.ticker,entry_date:x.entryDate,exit_date:x.exitDate,
  entry_price:x.entryPrice,exit_price:x.exitPrice,reason:x.reason,
  normalized_model_pnl:10000*(x.exitPrice/x.entryPrice-1)
 }));
 const realized=closes.reduce((s,x)=>s+x.normalized_model_pnl,0);
 const unrealized=latest.active.reduce((s,x)=>s+10000*(x.currentPrice/x.entryPrice-1),0);
 if(active.length>10||!Number.isFinite(realized)||!Number.isFinite(unrealized))throw Error('INVALID_NORMALIZED_MODEL_STATE');
 const equity=100000+realized+unrealized;
 const candidates=(latest.candidates||[]).filter(x=>x&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(x.ticker)&&!active.some(p=>p.ticker===x.ticker))
  .map(x=>({ticker:x.ticker,score:x.score,review_date:x.review_date,brief_reason:x.brief_reason}));
 return withSnapshotId({version:2,status:'SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED',epoch:EPOCH,snapshot_date:latest.date,
  starting_model_equity:100000,current_model_equity:equity,realized_model_pnl:realized,
  unrealized_model_pnl:unrealized,active_portfolio:active,closed_trades:closes,candidates,candidate_count:candidates.length,active_count:active.length,
  authoritative:false,published:false,notices:['Research model only, not brokerage executions. Shadow publication disabled.']});
}
async function readShadowPublicFeed({url,read=readLastCleanState}={}){
 const latest=await read({url});
 return makeReadOnlyFeed(latest);
}
module.exports={makeReadOnlyFeed,readShadowPublicFeed,withSnapshotId};
