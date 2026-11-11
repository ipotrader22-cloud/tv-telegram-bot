'use strict';
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const ORIGIN='https://vixale-engine-v2-shadow-observer.onrender.com';
async function probe({origin=ORIGIN,fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.hostname!=='vixale-engine-v2-shadow-observer.onrender.com'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('UNAPPROVED_STAGING_ORIGIN');
 const paths=['/health','/v2/model/snapshot','/v2/swing-trading'],replies=[];
 for(const path of paths){
  let response;
  for(let attempt=0;attempt<3;attempt++){
   if(attempt)await pause(attempt===1?3000:8000);
   try{
    response=await fetcher(origin+path,{method:'GET',redirect:'error',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
   }catch{
    if(attempt===2)throw Error('STAGING_TRANSPORT_UNAVAILABLE:'+path);
    continue;
   }
   if(response.status===200)break;
   if(response.status!==429&&response.status<500)throw Error('STAGING_HTTP_NOT_200:'+path+':'+response.status);
   if(attempt===2)throw Error('STAGING_TRANSIENT_HTTP_EXHAUSTED:'+path);
  }
  if(!/no-store/i.test(response.headers.get('cache-control')||''))throw Error('STAGING_CACHE_POLICY:'+path);
  replies.push(response);
 }
 const [health,feed,html]=await Promise.all([replies[0].json(),replies[1].json(),replies[2].text()]);
 if(health.mode!=='READ_ONLY'||health.databaseConnected!==true||health.schemaInitialized!==true)throw Error('SHADOW_HEALTH_UNVERIFIED');
 if(health.stagingPipeline?.emailEnabled!==false)throw Error('STAGING_EMAIL_NOT_DISABLED');
 if(health.cleanSlate?.epoch!=='2026-10-19'||health.cleanSlate?.readyForProduction!==false)throw Error('SHADOW_EPOCH_OR_SAFETY_INVALID');
 if(feed.version!==2||feed.epoch!=='2026-10-19'||!/^20\d{2}-\d{2}-\d{2}$/.test(feed.snapshot_date||'')||feed.snapshot_date<'2026-10-19'||!Array.isArray(feed.active_portfolio)||!Array.isArray(feed.closed_trades)||!Array.isArray(feed.candidates))throw Error('SNAPSHOT_SCHEMA_UNVERIFIED');
 if(!/^[a-f0-9]{64}$/i.test(feed.snapshot_id||''))throw Error('SNAPSHOT_FINGERPRINT_INVALID');
 if(feed.active_portfolio.length!==feed.active_count||feed.active_count>10)throw Error('ACTIVE_MEMBERSHIP_MISMATCH');
 // The API and page are independent HTTP reads. Their intraday quote times
 // can legitimately differ. Verify HTML exactly against its OWN embedded
 // public feed, then compare the immutable model identity and bounded recency
 // against the independently retrieved API feed.
 const match=/<script type="application\/json" id="engine2-rendered-feed">([^<]*)<\/script>/.exec(html);
 let displayed;try{displayed=JSON.parse(match?.[1]||'')}catch{throw Error('EXACT_VISIBLE_HTML_MISMATCH')}
 if(html!==renderShadowSwing(displayed))throw Error('EXACT_VISIBLE_HTML_MISMATCH');
 if(displayed.version!==2||displayed.epoch!==feed.epoch||
    displayed.snapshot_date!==feed.snapshot_date||displayed.snapshot_id!==feed.snapshot_id||
    displayed.active_count!==feed.active_count||
    displayed.active_portfolio.length!==feed.active_portfolio.length)
  throw Error('STAGING_MODEL_IDENTITY_DRIFT');
 for(let i=0;i<feed.active_portfolio.length;i++){
  const a=feed.active_portfolio[i],b=displayed.active_portfolio[i];
  if(a.ticker!==b.ticker||a.entry_price!==b.entry_price||
     a.entry_date!==b.entry_date||
     a.current_model_reference_price!==b.current_model_reference_price)
   throw Error('STAGING_MODEL_IDENTITY_DRIFT');
 }
 if(feed.active_count){
  for(const p of [feed,displayed]){
   if(p.valuation_read_only!==true||
      !Number.isFinite(Date.parse(p.valuation_as_of||'')))
    throw Error('STAGING_VALUATION_CONTRACT_MISSING');
   const fresh=p.active_portfolio.filter(q=>q.valuation_status==='FRESH_DELAYED');
   if(p.valuation_coverage!==fresh.length)throw Error('STAGING_VALUATION_COVERAGE_INVALID');
   for(const q of p.active_portfolio){
    if(!['FRESH_DELAYED','STALE','UNAVAILABLE'].includes(q.valuation_status))
     throw Error('STAGING_VALUATION_STATUS_INVALID');
    if(q.valuation_status!=='FRESH_DELAYED'&&q.unrealized_model_pnl!==null)
     throw Error('STAGING_STALE_PNL_PRESENT');
    if(q.valuation_status==='FRESH_DELAYED'&&
       (q.quote_source!=='GOOGLEFINANCE'||!Number.isFinite(q.current_valuation_price)||
        q.current_valuation_price<=0||
        !Number.isFinite(Date.parse(q.quote_timestamp_utc||''))||
        !Number.isFinite(q.quote_delay_minutes)))
     throw Error('STAGING_FRESH_QUOTE_EVIDENCE_INVALID');
   }
   if(fresh.length!==p.active_count&&p.unrealized_model_pnl!==null)
    throw Error('STAGING_INCOMPLETE_AGGREGATE_PNL');
  }
  if(Math.abs(Date.parse(feed.valuation_as_of)-Date.parse(displayed.valuation_as_of))>120000)
   throw Error('STAGING_VALUATION_READBACK_DRIFT');
 }
 return {status:'EXTERNAL_STAGING_API_HTML_PASS',snapshotDate:feed.snapshot_date,snapshotId:feed.snapshot_id,activeCount:feed.active_count,readOnly:true,emailEnabled:false,productionCutover:false};
}
if(require.main===module)probe().then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message,productionCutover:false}));process.exitCode=1});
module.exports={probe};
