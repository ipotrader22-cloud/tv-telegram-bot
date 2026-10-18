'use strict';
// Publication contract only: never writes current Google Sheet or website.
// A production cutover would require native Sheets lease/fence + atomic batch
// and direct HTML/API post-change verification before any Resend delivery.
const {createHash}=require('node:crypto');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
function preparePublicationManifest({run,model,active=[],notes=[],closed=[],sourceEvidenceId}={}){
 const blocked=reason=>({status:'BLOCKED',reason,publishable:false});
 if(!run?.runId||run.status!=='SHADOW_COMMITTED'||run.published!==false||!run.runId.startsWith('engine2|'+EPOCH+'|'))return blocked('SHADOW_LEDGER_NOT_COMMITTED');
 if(!model||model.status!=='VALIDATED_NOT_PUBLISHED'||model.epoch!==EPOCH)return blocked('MODEL_NOT_VALIDATED');
 if(!sourceEvidenceId||!Array.isArray(notes)||notes.length!==active.length)return blocked('PUBLIC_REVIEW_EVIDENCE_INCOMPLETE');
 const date=model.date;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<EPOCH||!run.runId.includes('|'+date+'|'))return blocked('DATE_MISMATCH');
 const noteIndex=new Map(notes.map(n=>[n.ticker,n]));
 if(noteIndex.size!==active.length)return blocked('NOTES_NOT_UNIQUE');
 for(const a of active){
  const n=noteIndex.get(a.ticker);
  if(!n||n.reviewDate!==date||typeof n.briefNote!=='string'||!n.briefNote.trim()||!n.reviewTimeET) return blocked('STALE_REVIEW_NOTE');
  if(!a.entryDate||a.entryDate<EPOCH||a.fullReviewDate!==date)return blocked('INVALID_MODEL_MEMBERSHIP');
 }
 if(model.active!==active.length)return blocked('ACTIVE_COUNT_MISMATCH');
 if(Math.abs(model.realized+model.unrealized-model.total)>0.01||Math.abs(model.equity-100000-model.total)>0.01)return blocked('FIXED_10K_MODEL_ACCOUNTING');
 for(const c of closed)if(!['YES','NO'].includes(c.includePublic)||!c.effectiveDate)return blocked('MISSING_Q_R_CONTROL');
 const payload={epoch:EPOCH,date,runId:run.runId,sourceEvidenceId,active:active.map(a=>({ticker:a.ticker,entryDate:a.entryDate,entryPrice:a.entryPrice,score:a.currentScore,reviewDate:date,note:noteIndex.get(a.ticker).briefNote,noteTime:noteIndex.get(a.ticker).reviewTimeET})),model:{realized:model.realized,unrealized:model.unrealized,total:model.total,equity:model.equity,activeCount:model.active}};
 const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return {status:'PUBLICATION_PLAN_ONLY',publishable:false,fingerprint,payload,requires:['NATIVE_SHEETS_LEASE_FENCE','ATOMIC_WORKBOOK_WRITE','FORMULA_PRESERVATION','DIRECT_HTML_API_PARITY','RESEND_OUTBOX_DELIVERY'],approved:false};
}
function verifyPublication({manifest,sheet,api,html}={}){
 const fail=reason=>({status:'BLOCKED',reason});
 if(manifest?.status!=='PUBLICATION_PLAN_ONLY')return fail('INVALID_MANIFEST');
 if(!sheet||!api||!html)return fail('MISSING_PUBLICATION_READBACK');
 const p=manifest.payload;
 if(sheet.snapshotDate!==p.date||api.snapshotDate!==p.date||html.snapshotDate!==p.date)return fail('STALE_SNAPSHOT_DATE');
 if(sheet.activeCount!==p.model.activeCount||api.activeCount!==p.model.activeCount||html.activeCount!==p.model.activeCount)return fail('MEMBERSHIP_MISMATCH');
 if(!api.snapshotId||api.snapshotId!==html.snapshotId)return fail('HTML_API_FINGERPRINT_MISMATCH');
 if(!api.noStore||!html.noStore||api.stale||html.stale)return fail('CACHE_OR_STALE_RESPONSE');
 if(api.reviewDates?.some(d=>d!==p.date)||html.reviewDates?.some(d=>d!==p.date))return fail('STALE_REVIEW_DATE');
 if(!sheet.protectedFormulasVerified)return fail('PROTECTED_FORMULAS_NOT_PROVEN');
 return {status:'VERIFIED',snapshotId:api.snapshotId,runId:p.runId,date:p.date};
}
module.exports={preparePublicationManifest,verifyPublication};
