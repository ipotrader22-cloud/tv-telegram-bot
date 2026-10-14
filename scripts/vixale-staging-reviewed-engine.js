'use strict';
/*
 * Stage-only integration boundary between a verified nine-factor review,
 * fresh portfolio reconciliation, and the lease/fence primitive.
 *
 * DOES NOT gather/guess scores, select orders, write production, publish or email.
 * A production review engine must supply explicit evidence, fresh sheet readers,
 * quote verification, and a reviewed native batch plan.
 */
const {GuardedWriter}=require('./vixale-guarded-sheets-writer');
const {reviewSet}=require('./vixale-review-evidence-gate');
const STAGING_ID='10uRxpyGrItn_5rGrbhEsb-xoMJU7uv9NEhkCNcO8q80';
function blocked(x){throw Error('ENGINE BLOCKED: '+x);}
function stable(x){return JSON.stringify(x);}
async function commitStagingReviewedModel({
 sheets,spreadsheetId,runId,kind,expectedDate,readFreshSnapshot,
 verifiedReviews,buildFinancialRequests,validateQuotes,clock=()=>new Date()
}){
 if(spreadsheetId!==STAGING_ID)blocked('This integration is staging only; production write is disabled');
 if(!runId || typeof runId!=='string')blocked('Missing unique run owner');
 for(const [name,fn] of Object.entries({readFreshSnapshot,buildFinancialRequests,validateQuotes}))
   if(typeof fn!=='function')blocked('Missing '+name+' callback');
 if(!Array.isArray(verifiedReviews))blocked('Missing private research evidence');
 const writer=new GuardedWriter({sheets,spreadsheetId,owner:runId,kind,clock});
 let guarded=false;
 try{
   // Work from an isolated, fresh snapshot taken AFTER acquiring the metadata lease.
   await writer.acquire();
   guarded=true;
   const baseline=await readFreshSnapshot();
   reviewSet(baseline,verifiedReviews,expectedDate);
   const fingerprint=stable(baseline);
   const requests=await buildFinancialRequests({baseline,verifiedReviews,expectedDate});
   if(!Array.isArray(requests)||!requests.length)blocked('No reviewed transaction plan');
   const receipt=await writer.commit({
     requests,
     validateFresh:async()=>{
       const current=await readFreshSnapshot();
       if(stable(current)!==fingerprint)blocked('Workbook changed after plan: discard and rebuild');
       reviewSet(current,verifiedReviews,expectedDate);
     },
     validateQuotes:async()=>{
       const result=await validateQuotes({baseline,verifiedReviews,expectedDate,clock:clock()});
       if(result!==true)blocked('Timestamped regular-session quote verification incomplete');
     }
   });
   return {status:'STAGING_COMMIT',fence:receipt.fence,date:expectedDate};
 }finally{
   if(guarded){
     // Preserve original failure. Any uncertain lease state requires manual readback.
     try{await writer.release();}catch(e){console.error('STAGING LEASE RELEASE UNCERTAIN:',e.message);}
   }
 }
}
module.exports={commitStagingReviewedModel,STAGING_ID};
