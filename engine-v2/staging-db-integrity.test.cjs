'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditStagingDb}=require('./staging-db-integrity.cjs');
const url='postgresql://localhost/vixale_engine_v2_shadow_20990101',date='2026-11-02',runId='model|2026-11-02';
const active=[
 {ticker:'CVX',entryPrice:231.77,currentPrice:227.77},
 {ticker:'XOM',entryPrice:182.6,currentPrice:179.67}
];
const unrealized=active.reduce((n,p)=>n+10000*(p.currentPrice/p.entryPrice-1),0);
const model={activeCount:2,realized:0,unrealized,total:unrealized,equity:100000+unrealized};
const events=[{event_id:'CVX|2026-11-02|OPEN|2026-11-02',type:'OPEN',ticker:'CVX',entry_date:'2026-11-02'},
 {event_id:'XOM|2026-11-02|OPEN|2026-11-02',type:'OPEN',ticker:'XOM',entry_date:'2026-11-02'}];
const expectedEvents=events.map(e=>({eventId:e.event_id}));
const artifact={manifest:{fingerprint:'fingerprint',payload:{runId,date,model}},feed:{snapshot_id:'fingerprint'},positions:active};
function harness(overrides={}){
 const calls=[];
 const rows={
  identity:[{db:'vixale_engine_v2_shadow_20990101'}],
  tables:[{runs:'vixale_v2.clean_runs',events:'vixale_v2.clean_events',daily:'vixale_v2.clean_daily_state',pipeline:'vixale_v2.staging_pipeline',preopen:'vixale_v2.preopen_preparations'}],
  runs:[{run_id:runId,model,evidence_manifest:{inputs:{events:expectedEvents}}}],
  daily:[{run_id:runId,active,closed:[]}],
  pipeline:[{run_id:runId,snapshot_id:'fingerprint',artifact,state:{sheet:'VERIFIED',publication:'VERIFIED',delivery:'EMAIL_DISABLED'}}],
  preopen:[{n:1}],events
 };
 Object.assign(rows,overrides);
 const client={
  connect:async()=>{calls.push('connect')},
  query:async(sql)=>{calls.push(sql);
   if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
   const key=sql.includes('current_database()')?'identity':
    sql.includes('to_regclass(')?'tables':
    sql.includes('FROM vixale_v2.clean_runs')?'runs':
    sql.includes('FROM vixale_v2.clean_daily_state')?'daily':
    sql.includes('FROM vixale_v2.staging_pipeline')?'pipeline':
    sql.includes('FROM vixale_v2.preopen_preparations')?'preopen':
    sql.includes('FROM vixale_v2.clean_events')?'events':null;
   if(!key)throw Error('Unexpected query');return {rows:rows[key]};
  },
  end:async()=>{calls.push('end')}
 };
 return {calls,clientFactory:()=>client};
}
test('private audit validates one durable financial run, events and model accounting without writes',async()=>{
 const h=harness(),r=await auditStagingDb({url,date,clientFactory:h.clientFactory});
 assert.equal(r.status,'PASS',JSON.stringify(r));
 assert.equal(r.runCount,1);assert.equal(r.activeCount,2);assert.equal(r.eventCount,2);
 assert.equal(r.deliveryStatus,'EMAIL_DISABLED');assert.equal(r.writesPerformed,false);
 assert.ok(h.calls.includes('BEGIN READ ONLY'));assert.ok(h.calls.includes('ROLLBACK'));
 assert.equal(h.calls.at(-1),'end');
 assert.ok(h.calls.every(s=>!/^INSERT|^UPDATE|^DELETE|^CREATE|^DROP/i.test(s)));
});
test('duplicate event or missing daily journal fails closed',async()=>{
 const duplicate=harness({events:[events[0],{...events[0],event_id:'different'}]});
 assert.equal((await auditStagingDb({url,date,clientFactory:duplicate.clientFactory})).reason,'DUPLICATE_OR_MISSING_EVENTS');
 const missing=harness({daily:[]});
 assert.equal((await auditStagingDb({url,date,clientFactory:missing.clientFactory})).reason,'SESSION_JOURNAL_CARDINALITY_MISMATCH');
});
test('altered P&L and missing publication fail closed',async()=>{
 const pnl=harness({runs:[{run_id:runId,model:{...model,unrealized:0,total:0,equity:100000},evidence_manifest:{inputs:{events:expectedEvents}}}]});
 assert.equal((await auditStagingDb({url,date,clientFactory:pnl.clientFactory})).reason,'NORMALIZED_ACCOUNTING_MISMATCH');
 const drift=harness({pipeline:[{run_id:runId,snapshot_id:'other',artifact,state:{sheet:'VERIFIED',publication:'VERIFIED'}}]});
 assert.equal((await auditStagingDb({url,date,clientFactory:drift.clientFactory})).reason,'PUBLICATION_JOURNAL_MISMATCH');
});
test('invalid DB, invalid date or DB access failure never leaks secrets',async()=>{
 assert.equal((await auditStagingDb({url:'postgresql://localhost/production',date})).reason,'SHADOW_DATABASE_REQUIRED');
 assert.equal((await auditStagingDb({url,date:'invalid'})).reason,'INVALID_SESSION_DATE');
 const r=await auditStagingDb({url,date,clientFactory:()=>({connect:async()=>{throw Error('private-secret')},end:async()=>{}})});
 assert.equal(r.reason,'STAGING_READ_ONLY_AUDIT_UNAVAILABLE');
 assert.doesNotMatch(JSON.stringify(r),/secret/);
});
