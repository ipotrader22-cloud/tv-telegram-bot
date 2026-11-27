'use strict';

// Run inside the private Engine 2 checkout. Only the small model projection
// leaves the process. The compressed source evidence and credentials stay here.
const {createRequire} = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const epoch = '2026-10-19';

async function collect(date, root = process.cwd()) {
  assert.match(date, /^20\d\d-\d\d-\d\d$/);
  const engine = createRequire(path.resolve(root, 'engine-v2/clean-ledger.cjs'));
  const {Client} = engine('pg');
  const {decodeEvidence} = engine('./evidence-storage.cjs');
  const {dbName} = engine('./clean-ledger.cjs');
  const {verifyCurrentOpenings} = engine('./same-session-opening.cjs');
  const {validateMorningTrigger} = engine('./nyse-morning-clock.cjs');
  const {snapshot} = engine('./core.cjs');
  const url = process.env.VIXALE_V2_SHADOW_DATABASE_URL;
  const expected = dbName(url);
  assert.equal(expected,'vixale_engine_v2_shadow_20261016');
  const db = new Client({connectionString:url, connectionTimeoutMillis:5000, statement_timeout:20000});
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity = (await db.query("select current_database() as db, current_setting('transaction_read_only') as ro")).rows[0];
    assert.equal(identity.db, expected);
    assert.equal(identity.ro, 'on');
    const result = await db.query(`select r.run_id,r.model,r.evidence_manifest,r.accepted_at,
      d.active,d.closed,p.snapshot_id,p.state
      from vixale_v2.clean_runs r join vixale_v2.clean_daily_state d using(epoch,session_date,run_id)
      left join vixale_v2.staging_pipeline p on p.run_id=r.run_id and p.session_date=r.session_date
      where r.epoch=$1 and r.session_date=$2`, [epoch,date]);
    assert.equal(result.rowCount, 1, 'decision_missing');
    const row = result.rows[0];
    const input = decodeEvidence(row.evidence_manifest.inputs);
    assert.equal(input.date,date);
    assert.equal(validateMorningTrigger({date,runAt:input.runAt}).status,'PASS');
    const prepared = (await db.query('select artifact from vixale_v2.preopen_preparations where session_date=$1',[date])).rows;
    assert.equal(prepared.length,1);
    const frozen=decodeEvidence(prepared[0].artifact);
    assert.equal(input.preparedHash,frozen.fingerprint);
    assert.deepEqual(input.researchBatch,frozen.batch);
    assert.deepEqual(input.sourceEvidence.prepared,frozen);
    const research = engine('./research-attestation.cjs').validateResearchBatch(input.researchBatch);
    assert.equal(research.status,'PASS');
    const {GOOGLE_POLICY,validGoogleQuote} = engine('./google-quote-provider.cjs');
    const evidence = input.sourceEvidence;
    if (input.pricePolicy === GOOGLE_POLICY) {
      assert.ok(evidence.quotes.every(q=>validGoogleQuote(q,{date,runAt:input.runAt})));
    } else {
      // Historical 09:40 configurations have a different attestation contract.
      assert.equal(engine('./clean-ledger.cjs').validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
    }
    assert.deepEqual(input.positions,row.active);
    assert.deepEqual(input.closed,row.closed);
    const model = snapshot({active:row.active,closed:row.closed,researchComplete:true,reviewDate:date});
    for (const k of ['active','realized','unrealized','total','equity']) assert.equal(row.model[k],model[k]);
    const carried = input.sourceEvidence.previous?.active || [];
    verifyCurrentOpenings({date,runAt:input.runAt,positions:carried,openings:input.sourceEvidence.openings});
    const events = (await db.query('select payload from vixale_v2.clean_events where run_id=$1 order by event_id',[row.run_id])).rows;
    const sortEvents = xs => [...xs].sort((a,b)=>a.eventId.localeCompare(b.eventId));
    assert.deepEqual(sortEvents(events.map(e=>e.payload)),sortEvents(input.events));
    const history = (await db.query(`select session_date::text as date,model from vixale_v2.clean_runs
      where epoch=$1 and session_date<=$2 order by session_date`,[epoch,date])).rows.map(({date,model})=>
      [date,model.realized,model.unrealized,model.equity,model.active]);
    if (history[0]?.[0] !== epoch) history.unshift([epoch,0,0,100000,0]);
    return {date,runId:row.run_id,snapshotId:row.snapshot_id,decisionAt:input.runAt,acceptedAt:row.accepted_at,
      database:identity.db,readOnly:true,events:events.length,openingProofs:carried.length,
      factorReviews:input.researchBatch.items.length,pricePolicy:input.pricePolicy,
      quotes:input.sourceEvidence.quotes.map(x=>[x.ticker,x.price,x.timestamp]),
      active:row.active.map(p=>[p.ticker,p.entryDate,p.entryPrice,p.currentPrice,p.currentScore,p.entryScore]),
      closed:row.closed.map(p=>[p.ticker,p.entryDate,p.entryPrice,p.exitDate,p.exitPrice,p.lastScore,p.reason,p.includePublic,p.effectiveDate]),
      candidates:row.evidence_manifest.publicCandidates.slice().sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker)).slice(0,5).map(p=>[p.ticker,p.score,p.review_date]),
      history,sheetState:row.state?.sheet,publicationState:row.state?.publication,delivery:row.state?.delivery};
  } finally { try {await db.query('ROLLBACK');} finally {await db.end();} }
}
module.exports = {collect};
if (require.main === module) collect(process.argv[2]).then(result=>console.log(JSON.stringify(result))).catch(error=>{
  console.error('Private ledger read failed', error.code || error.name);
  process.exitCode=1;
});
