'use strict';
const {createHash}=require('node:crypto');
const {validateMorningCommit}=require('./clean-ledger.cjs');
const {preparePublicationManifest}=require('./publication-contract.cjs');
const {makeReadOnlyFeed}=require('./shadow-public-feed.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const {stableStringify}=require('./stable-json.cjs');
const digest=x=>createHash('sha256').update(stableStringify(x)).digest('hex');
function buildStagingArtifact(record,history=[]){
 const inputs=record?.evidence_manifest?.inputs;
 if(!inputs||validateMorningCommit(inputs).status!=='READY_FOR_SHADOW_COMMIT')throw Error('COMMITTED_RESEARCH_INPUTS_REQUIRED');
 const {date,runAt}=inputs;
 const timeEt=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(runAt))+' ET';
 const positions=inputs.positions.map(p=>({...p,publicNote:inputs.researchBatch.items.find(r=>r.ticker===p.ticker)?.publicNote||'Reviewed '+date}));
 const notes=positions.map(p=>({ticker:p.ticker,reviewDate:date,reviewTimeET:timeEt,briefNote:p.publicNote+(inputs.pricePolicy?' | Model prices 09:40 ET; decision '+timeEt:'')}));
 const manifest=preparePublicationManifest({run:{runId:record.run_id,status:'SHADOW_COMMITTED',published:false},model:record.model,active:positions,closed:inputs.closed,notes,sourceEvidenceId:record.payload_hash});
 if(manifest.status!=='PUBLICATION_PLAN_ONLY')throw Error('MANIFEST_REJECTED:'+manifest.reason);
 const candidates=(record.evidence_manifest.publicCandidates||[]).slice().sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker)).slice(0,5);
 const feed=makeReadOnlyFeed({epoch:EPOCH,date,active:positions,closed:inputs.closed,candidates,history});
 delete feed.snapshot_id;
 feed.snapshot_time_et=timeEt;
 feed.reference_as_of=inputs.priceAsOf||runAt;
 if(inputs.pricePolicy){
  feed.price_policy=inputs.pricePolicy;
  feed.decision_at=runAt;
  feed.research_session_date=inputs.sourceEvidence.prepared.sourceSession;
  feed.price_time_et='09:40 ET';
 }
 feed.notices=['Private staging validation. Research model only; indicative reference marks are not broker fills.'];
 manifest.payload.positions=positions;
 manifest.payload.candidates=candidates;
 manifest.payload.closed=inputs.closed;
 manifest.payload.feed=feed;
 manifest.fingerprint=digest(manifest.payload);
 return {manifest,positions,closed:inputs.closed,timeEt,feed:{...feed,snapshot_id:manifest.fingerprint}};
}
function assertArtifact(a){
 if(!a?.manifest?.payload?.feed||stableStringify(a.positions)!==stableStringify(a.manifest.payload.positions)||
    stableStringify(a.closed)!==stableStringify(a.manifest.payload.closed)||a.timeEt!==a.manifest.payload.feed.snapshot_time_et||digest(a.manifest.payload)!==a.manifest.fingerprint||
    a.feed.snapshot_id!==a.manifest.fingerprint||stableStringify({...a.feed,snapshot_id:undefined})!==stableStringify(a.manifest.payload.feed))throw Error('STAGING_ARTIFACT_HASH_MISMATCH');
 return a;
}
module.exports={buildStagingArtifact,assertArtifact,digest};
