'use strict';
// Real evidence -> mechanical factors -> certified batch. No invented news,
// broker fills, old membership, or disclosure of private source URLs.
const {parseV2Universe}=require('./research-universe.cjs');
const {autoAssess}=require('./automated-factor-assessor.cjs');
const {compileFullResearch}=require('./complete-research-compiler.cjs');
function createAutonomousResearchProvider({artifactProvider,newsProvider,universeCsv,sectorByTicker}={}){
 if(typeof artifactProvider?.getArtifact!=='function'||typeof newsProvider?.collect!=='function')
  throw Error('AUTONOMOUS_EVIDENCE_PROVIDERS_MISSING');
 const {candidates,benchmarks}=parseV2Universe(universeCsv);
 if(!sectorByTicker||candidates.some(x=>!sectorByTicker[x]))
  throw Error('RESEARCH_SECTOR_MAPPING_INCOMPLETE');
 return {async getBatch({date,runAt,session}={}){
  if(session?.date!==date||session?.isTradingDay!==true||session?.providerVerified!==true)
   throw Error('EXCHANGE_SESSION_UNVERIFIED');
  const artifact=await artifactProvider.getArtifact({date,runAt,symbols:[...candidates,...benchmarks]});
  if(artifact?.mode!=='CLEAN_EPOCH'||artifact.date!==date||artifact.result!=='PASS'||
     !Array.isArray(artifact.candidates)||JSON.stringify(artifact.candidates)!==JSON.stringify(candidates))
    throw Error('INDEPENDENT_UNIVERSE_RESEARCH_ARTIFACT_MISSING');
  if(!artifact.collectedAt||Date.parse(artifact.collectedAt)>Date.parse(runAt)||
     artifact.collectedAt.slice(0,10)!==new Date(runAt).toISOString().slice(0,10))
    throw Error('FUTURE_OR_UNDATED_OHLCV_ARTIFACT');
  const news=await newsProvider.collect({date,runAt,candidates});
  const scores=autoAssess({artifact,date,runAt,universe:candidates,sectorByTicker,newsReview:news});
  if(scores.status!=='DETERMINISTIC_NINE_FACTOR_ASSESSMENTS')
   throw Error('DETERMINISTIC_SCORING_BLOCKED:'+scores.reason);
  const result=compileFullResearch({artifact,date,runAt,universe:candidates,session,
    assessments:scores.assessments,newsReview:news});
  if(result.status!=='PASS')throw Error('FULL_RESEARCH_ATTESTATION_BLOCKED:'+result.reason);
  return {...result.batch,scoringPolicyVersion:scores.policyVersion,sourceEvidence:{artifact,news}};
 }};
}
module.exports={createAutonomousResearchProvider};
