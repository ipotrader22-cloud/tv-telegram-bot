'use strict';
// Evidence intake is local/read-only. It never promotes a historical audit to PASS.
const REQUIRED_DATES=['2026-08-21','2026-09-03','2026-09-04','2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-28','2026-09-29','2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-12','2026-10-16'];
function inventory(evidence=[]){
 if(!Array.isArray(evidence))throw Error('Evidence must be an array');
 const byDate=new Map(REQUIRED_DATES.map(date=>[date,[]]));
 for(const item of evidence){
  if(!item||typeof item!=='object')throw Error('Invalid evidence item');
  if(!byDate.has(item.date))continue;
  const fields=['source','sourceId','lotId','eventTimestamp','timezone','markCutoffTimestamp'];
  const missing=fields.filter(key=>typeof item[key]!=='string'||!item[key].trim());
  const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
  if(!missing.includes('eventTimestamp')&&!iso(item.eventTimestamp))missing.push('INVALID_EVENT_TIMESTAMP');
  if(!missing.includes('markCutoffTimestamp')&&!iso(item.markCutoffTimestamp))missing.push('INVALID_MARK_CUTOFF');
  byDate.get(item.date).push({source:item.source||null,sourceId:item.sourceId||null,lotId:item.lotId||null,missing});
 }
 return [...byDate].map(([date,items])=>({date,submitted:items.length,completeMetadata:items.filter(x=>!x.missing.length).length,certified:false,items}));
}
module.exports={REQUIRED_DATES,inventory};
if(require.main===module){
 const fs=require('node:fs');
 const file=process.argv[2];if(!file)throw Error('Usage: node historical-evidence-inventory.cjs evidence.json');
 console.log(JSON.stringify(inventory(JSON.parse(fs.readFileSync(file,'utf8'))),null,2));
}
