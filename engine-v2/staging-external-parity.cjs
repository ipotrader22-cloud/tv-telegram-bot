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
 // Price cells and P&L are independently refreshed between HTTP reads.
 // Everything except these four known valuation-only fragments must be
 // byte-for-byte equal to the certified renderer for this immutable feed.
 function structural(html){
  return html
   .replace(/<td data-label="Current" data-valuation-field="price">[\s\S]*?<\/td>/g,
    '<td data-label="Current" data-valuation-field="price">[VALUATION]</td>')
   .replace(/<td data-label="P&L, \$" data-valuation-field="pnl" class="(?:gain|loss)">[\s\S]*?<\/td>/g,
    '<td data-label="P&L, $" data-valuation-field="pnl" class="neutral">[VALUATION]</td>')
   .replace(/<td data-label="Return" data-valuation-field="return">[\s\S]*?<\/td>/g,
    '<td data-label="Return" data-valuation-field="return">[VALUATION]</td>')
   .replace(/<strong id="valuation-total">[^<]*<\/strong>/g,
    '<strong id="valuation-total">[VALUATION]</strong>');
 }
 if(structural(html)!==structural(renderShadowSwing(feed)))
  throw Error('EXACT_VISIBLE_HTML_MISMATCH');
 const rows=[...html.matchAll(/<tr data-valuation-ticker="([^"]+)">([\s\S]*?)<\/tr>/g)];
 if(rows.length!==feed.active_portfolio.length)throw Error('STAGING_VALUATION_ROWS_MISMATCH');
 const {sourceTime}=require('./google-quote-provider.cjs');
 const parseMoney=s=>{
  if(s==='—')return null;
  if(!/^[+-]?\$[\d,]+\.\d{2}$/.test(s))throw Error('STAGING_VISIBLE_PNL_INVALID');
  return Number(s.replace(/[$,]/g,''));
 };
 for(let i=0;i<rows.length;i++){
  const p=feed.active_portfolio[i],row=rows[i][2];
  if(rows[i][1]!==p.ticker)throw Error('STAGING_VALUATION_ROWS_MISMATCH');
  const current=row.match(/<td data-label="Current" data-valuation-field="price">([^<]*) <small>([^<]*)<\/small><\/td>/);
  const pnl=row.match(/<td data-label="P&L, \$" data-valuation-field="pnl" class="(?:gain|loss)">([^<]*)<\/td>/);
  const pct=row.match(/<td data-label="Return" data-valuation-field="return">([^<]*)<\/td>/);
  if(!current||!pnl||!pct)throw Error('STAGING_VALUATION_FIELDS_MISSING');
  const label=current[2],isFresh=label.startsWith('FRESH_DELAYED · GOOGLEFINANCE delayed ');
  const isStale=label.startsWith('STALE · '),isUnavailable=label.startsWith('UNAVAILABLE · ');
  if(!isFresh&&!isStale&&!isUnavailable)throw Error('STAGING_VALUATION_STATUS_INVALID');
  if(!isFresh){
   if(pnl[1]!=='—'||pct[1]!=='—')throw Error('STAGING_STALE_PNL_PRESENT');
   continue;
  }
  const time=label.match(/^FRESH_DELAYED · GOOGLEFINANCE delayed (\d{1,2})m · (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ET$/);
  if(!time||Number(time[1])>20)throw Error('STAGING_FRESH_QUOTE_EVIDENCE_INVALID');
  const stamp=sourceTime(time[2]),at=Date.parse(feed.valuation_as_of||'');
  if(!Number.isFinite(at)||at-Date.parse(stamp)>22*60000||at-Date.parse(stamp)<-2*60000)
   throw Error('STAGING_VISIBLE_QUOTE_STALE');
  const price=parseMoney(current[1].trim()),profit=parseMoney(pnl[1]),entry=p.entry_price;
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(profit)||
     !Number.isFinite(entry)||entry<=0||!/[+-]?\d+\.\d{2}%/.test(pct[1]))
   throw Error('STAGING_VISIBLE_PNL_INVALID');
  // The source price is rounded to cents for display. Bound its effect on
  // 10k-normalized model P&L rather than falsely requiring exact equality.
  const expected=10000*(price/entry-1);
  if(Math.abs(profit-expected)>50/entry+0.015||
     Math.abs(Number(pct[1].slice(0,-1))-100*(price/entry-1))>0.005+0.5/entry)
   throw Error('STAGING_VISIBLE_PNL_INVALID');
 }
 if(feed.active_count){
  if(feed.valuation_read_only!==true||!Number.isFinite(Date.parse(feed.valuation_as_of||'')))
   throw Error('STAGING_VALUATION_CONTRACT_MISSING');
  const fresh=feed.active_portfolio.filter(q=>q.valuation_status==='FRESH_DELAYED');
  if(feed.valuation_coverage!==fresh.length)throw Error('STAGING_VALUATION_COVERAGE_INVALID');
  for(const q of feed.active_portfolio){
   if(!['FRESH_DELAYED','STALE','UNAVAILABLE'].includes(q.valuation_status))
    throw Error('STAGING_VALUATION_STATUS_INVALID');
   if(q.valuation_status!=='FRESH_DELAYED'&&q.unrealized_model_pnl!==null)
    throw Error('STAGING_STALE_PNL_PRESENT');
   if(q.valuation_status==='FRESH_DELAYED'&&
      (q.quote_source!=='GOOGLEFINANCE'||!Number.isFinite(q.current_valuation_price)||
       q.current_valuation_price<=0||!Number.isFinite(Date.parse(q.quote_timestamp_utc||''))||
       !Number.isFinite(q.quote_delay_minutes)))
    throw Error('STAGING_FRESH_QUOTE_EVIDENCE_INVALID');
  }
  if(fresh.length!==feed.active_count&&feed.unrealized_model_pnl!==null)
   throw Error('STAGING_INCOMPLETE_AGGREGATE_PNL');
 }
 return {status:'EXTERNAL_STAGING_API_HTML_PASS',snapshotDate:feed.snapshot_date,snapshotId:feed.snapshot_id,activeCount:feed.active_count,readOnly:true,emailEnabled:false,productionCutover:false};
}
if(require.main===module)probe().then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message,productionCutover:false}));process.exitCode=1});
module.exports={probe};
