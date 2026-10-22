'use strict';
// Uncached Engine2 shadow HTML/API parity. Source is the isolated model ledger,
// NOT the existing live public portfolio (which stays unchanged).
function verifyShadowPageParity({feed,html}={}){
 const fail=reason=>({status:'BLOCKED',reason,publicLaunchVerified:false});
 if(!feed||feed.version!==2||feed.epoch!=='2026-10-19'||typeof html!=='string')
   return fail('INVALID_SHADOW_PARITY_INPUTS');
 if(!/^[0-9a-f]{64}$/.test(feed.snapshot_id||''))return fail('SNAPSHOT_ID_MISSING');
 const re=/<code id="model-snapshot-id">([^<]*)<\/code>/;
 const m=html.match(re);
 if(!m||m[1]!==feed.snapshot_id)return fail('HTML_API_FINGERPRINT_MISMATCH');
 const status=(html.match(/data-engine2-status="([^"]+)"/)||[])[1];
 if(status!==feed.status)return fail('HTML_API_REVIEW_STATE_MISMATCH');
 if(!['INCEPTION_ONLY_NOT_REVIEWED','SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED'].includes(feed.status))
   return fail('UNKNOWN_MODEL_PUBLICATION_STATE');
 const ids=new Set((feed.active_portfolio||[]).map(x=>x.ticker));
 if(ids.size!==feed.active_count||ids.size>10)return fail('INVALID_ACTIVE_MEMBERSHIP');
 const rows=html.match(/<tr><td data-label="Ticker"><strong>([^<]+)<\/strong><\/td>/g)||[];
 const htmlSymbols=rows.map(x=>x.match(/<strong>([^<]+)<\/strong>/)[1]);
 if(htmlSymbols.length!==ids.size||htmlSymbols.some(x=>!ids.has(x)))return fail('HTML_API_HOLDINGS_MISMATCH');
 if(!html.includes('No broker orders or live website publication.'))return fail('SHADOW_DISCLAIMER_MISSING');
 return {status:'SHADOW_HTML_API_PARITY_PASS',snapshotId:feed.snapshot_id,
  reviewDate:feed.snapshot_date,activeCount:ids.size,publicLaunchVerified:false};
}
module.exports={verifyShadowPageParity};
