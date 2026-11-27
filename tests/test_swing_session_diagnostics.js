'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {reconcile}=require('../scripts/swing-diagnostics/reconcile.cjs');
const {engine2Workbook}=require('../lib/swing-engine2-workbook');
const date='2026-11-27', prior='2026-11-20';
function history(date,priorPnl=0) {return [date,0,priorPnl,100000+priorPnl,0];}
function inputs() {
  const historyRows=[history(prior,-30),history(date)];
  return {date,db:{history:historyRows,active:[],closed:[],quotes:[],candidates:[]},api:{
    active_portfolio:[],closed_trades:[],candidates:[],quote_times:[],
    equity_history:historyRows.map(([date,realized,unrealized,equity])=>({date,realized,unrealized,equity}))},
    sheet:{portfolio:[],open:[],closed:[],feed:[],history:[[],...historyRows.map(([d,r,u,e,n])=>[d,'10:00 ET',r,u,r+u,e,n])]}};
}
test('equal current totals cannot conceal a missing historical session',()=>{
  const x=inputs();
  assert.equal(reconcile(x).gates.frozen_history,'PASS');
  x.sheet.history.splice(1,1);
  assert.deepEqual(reconcile(x).missingDates,[prior]);
  assert.equal(reconcile(x).gates.frozen_history,'FAIL');
});
test('colliding dates and offsetting historical value errors fail independently',()=>{
  const x=inputs();
  x.api.equity_history[0].date=date;
  assert.equal(reconcile(x).gates.frozen_history,'FAIL');
  const y=inputs();
  y.sheet.history[1][2]+=50; y.sheet.history[1][3]-=50;
  assert.equal(reconcile(y).gates.frozen_history,'FAIL');
});
test('a wrong price or stale timestamp fails even with unchanged aggregate equity',()=>{
  const x=inputs();
  x.db.pricePolicy=x.api.price_policy='GOOGLE_LATEST_1000_MODEL_V1';
  x.db.quotes=[['ABC',10,'2026-11-27T14:59:00Z']];
  x.api.quote_times=[{ticker:'ABC',price:10,timestamp:'2026-11-27T14:28:00Z'}];
  assert.equal(reconcile(x).gates.decision_quotes,'FAIL');
});
test('unavailable evidence cannot pass',()=>{
  assert.equal(reconcile({date}).status,'UNVERIFIED');
});
test('QA workbook selection is limited to the dedicated staging site',()=>{
  const id='test_copy_workbook_12345678901234567890';
  const env={RENDER_SERVICE_ID:'srv-dbn675ui0phs73857rp0',SITE_BASE_URL:'https://vixale-engine2-website-staging.onrender.com',VIXALE_SWING_QA_WORKBOOK_ID:id};
  assert.equal(engine2Workbook(env),id);
  for(const bad of [{RENDER_SERVICE_ID:'production'},{SITE_BASE_URL:'https://www.vixale.com'},{GOOGLE_SHEET_ID:id},
    {VIXALE_SWING_QA_WORKBOOK_ID:engine2Workbook({})}]) assert.throws(()=>engine2Workbook({...env,...bad}));
});
test('stored preparation bytes and the committed preparation must both match',async()=>{
  const {readEvidence}=require('../scripts/swing-diagnostics/evidence.cjs');
  const verifyPreparation=async(stored,prepared)=>assert.deepEqual(await readEvidence(stored),await readEvidence(prepared));
  const {gzipSync}=require('node:zlib');
  const {createHash}=require('node:crypto');
  const value={fingerprint:'fixture',batch:{items:[{score:75}],sourceEvidence:{artifact:{bars:[[42,45]]},news:[]}}};
  const raw=Buffer.from(JSON.stringify(value));
  const store={__vixaleEvidenceEncoding:'gzip-json-v1',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),data:gzipSync(raw).toString('base64')};
  await verifyPreparation(store,value);
  const changed=structuredClone(value);
  changed.batch.sourceEvidence.artifact.bars[0][0]++;
  await assert.rejects(verifyPreparation(store,changed));
  await verifyPreparation(value,structuredClone(value));
  await assert.rejects(verifyPreparation(store,{...value,batch:[]}));
  await assert.rejects(verifyPreparation({...store,data:gzipSync('x').toString('base64')},value));
});
