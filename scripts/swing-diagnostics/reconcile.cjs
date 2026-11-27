'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');

function ordered(rows) {
  return [...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function sameRows(actual, expected) { assert.deepEqual(ordered(actual), ordered(expected)); }
function money(actual, expected) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual-expected)<0.010001);
}
function displayedPrice(x) {
  if (typeof x === 'number') return x;
  assert.match(x,/^\$[0-9,]+\.\d{2}$/);
  return Number(x.replace(/[$,]/g,''));
}
function equityRows(history) {
  return history.slice(1).filter(row=>row[0]).map(r=>[r[0],r[2],r[3],r[5],r[6]]);
}

function reconcile({date,db,sheet,api}) {
  const gates = {};
  function check(name, available, fn) {
    if (!available) { gates[name]='UNVERIFIED'; return; }
    try {fn(); gates[name]='PASS';} catch {gates[name]='FAIL';}
  }
  check('session',db&&api&&sheet,()=>{
    assert.match(date,/^20\d\d-\d\d-\d\d$/);
    assert.equal(db.database,'vixale_engine_v2_shadow_20261016');
    assert.equal(db.readOnly,true);
    assert.equal(db.date,date);
    assert.equal(db.runId,'engine2|2026-10-19|'+date+'|morning');
    assert.match(db.snapshotId,/^[a-f0-9]{64}$/);
    assert.equal(api.snapshot_id,db.snapshotId);
    assert.equal(api.snapshot_date,date);
    assert.equal(api.decision_at,db.decisionAt);
    assert.equal(sheet.feed[1][1],date);
    assert.deepEqual(sheet.feed[10],['engine2_snapshot_id',db.snapshotId]);
    assert.equal(db.sheetState,'VERIFIED');
    assert.equal(db.publicationState,'VERIFIED');
  });
  check('decision_quotes',db&&api,()=>{
    assert.equal(api.price_policy,db.pricePolicy);
    sameRows(api.quote_times.map(x=>[x.ticker,x.price,x.timestamp]), db.quotes);
    const prices = new Map(db.quotes.map(([ticker,price])=>[ticker,price]));
    assert.equal(prices.size,db.quotes.length);
    for(const [ticker,,entry,mark] of db.active) {
      assert.ok(entry>0 && mark>0);
      if(db.pricePolicy==='GOOGLE_LATEST_1000_MODEL_V1') assert.equal(prices.get(ticker),mark);
    }
  });
  check('active_lots',db&&sheet&&api,()=>{
    const active=db.active;
    const open=sheet.open.slice(3).filter(r=>r[2]);
    const portfolio=sheet.portfolio.slice(7,17).filter(r=>r[2]);
    const published=sheet.feed.slice(13,23).filter(r=>r[0]);
    assert.equal(new Set(active.map(r=>r[0])).size,active.length);
    assert.equal(api.active_count,active.length);
    assert.equal(sheet.feed[4][1],active.length);
    sameRows(open.map(r=>[r[2],r[0],r[5],r[17],r[3],r[13]]),active.map(([t,d,e,m,s,es])=>[t,d,e,m,es,date]));
    sameRows(portfolio.map(r=>[r[2],r[3],r[5]]),active.map(([t,,e,,s])=>[t,s,e]));
    sameRows(published.map(r=>[r[0],r[3],displayedPrice(r[4]),displayedPrice(r[5]),r[2],r[7]]),
      active.map(([t,d,e,m,s])=>[t,d,Math.round(e*100)/100,Math.round(m*100)/100,s,date]));
    sameRows(api.active_portfolio.map(p=>[p.ticker,p.entry_date,p.entry_price,p.current_model_reference_price,p.score,p.last_full_review_date]),
      active.map(([t,d,e,m,s])=>[t,d,e,m,s,date]));
  });
  check('candidates',db&&sheet&&api,()=>{
    assert.equal(sheet.feed[5][1],db.candidates.length);
    assert.equal(api.candidate_count,db.candidates.length);
    sameRows(sheet.feed.slice(25,30).filter(r=>r[0]).map(r=>[r[0],r[1],r[3]]),db.candidates);
    sameRows(api.candidates.map(p=>[p.ticker,p.score,p.review_date]),db.candidates);
  });
  check('closed_lots',db&&sheet&&api,()=>{
    const rows=sheet.closed.slice(3).filter(r=>r[2]);
    sameRows(rows.map(r=>[r[2],r[4],r[5],r[0],r[8],r[12],r[13],r[16],r[17]]),db.closed);
    const lots=db.closed.filter(r=>r[7]==='YES'&&r[8]<=date).map(r=>r.slice(0,7));
    sameRows(api.closed_trades.map(p=>[p.ticker,p.entry_date,p.entry_price,p.exit_date,p.exit_price,p.last_score,p.reason]),lots);
    sameRows(sheet.feed.slice(32).filter(r=>r[0]).map(r=>[r[0],r[1],displayedPrice(r[2]),r[3],displayedPrice(r[4]),r[6],r[7]]),
      lots.map(([t,d,e,x,p,s,r])=>[t,d,Math.round(e*100)/100,x,Math.round(p*100)/100,s,r]));
    for(const p of api.closed_trades) money(p.normalized_model_pnl,10000*(p.exit_price/p.entry_price-1));
  });
  const missingDates = db&&sheet ? db.history.map(r=>r[0]).filter(d=>!equityRows(sheet.history).some(r=>r[0]===d)) : [];
  check('frozen_history',db&&sheet&&api,()=>{
    const history=equityRows(sheet.history);
    assert.ok(history.length && history.at(-1)[0]===date);
    assert.deepEqual(history.map(r=>r[0]),db.history.map(r=>r[0]));
    assert.equal(new Set(history.map(r=>r[0])).size,history.length);
    assert.deepEqual(api.equity_history.map(r=>r.date),db.history.map(r=>r[0]));
    db.history.forEach(([d,realized,unrealized,equity,count],i)=>{
      const a=api.equity_history[i], s=history[i];
      money(s[1],realized); money(s[2],unrealized); money(s[3],equity);
      assert.equal(s[4],count);
      money(a.realized,realized); money(a.unrealized,unrealized); money(a.equity,equity);
      money(100000+realized+unrealized,equity);
    });
  });
  check('morning_accounting',db&&api&&sheet,()=>{
    const realized=db.closed.filter(r=>r[7]==='YES'&&r[8]<=date).reduce((s,r)=>s+10000*(r[4]/r[2]-1),0);
    const unrealized=db.active.reduce((s,r)=>s+10000*(r[3]/r[2]-1),0);
    const row=sheet.history.find(r=>r[0]===date);
    money(row[2],realized); money(row[3],unrealized); money(row[4],realized+unrealized);
    money(api.current_model_equity,100000+realized+unrealized);
    money(api.realized_model_pnl,realized);
    const cash=(100000+realized-10000*db.active.length)/api.current_model_equity*100;
    assert.equal(sheet.feed[6][1],cash.toFixed(1)+'%');
  });
  check('protected_formulas',sheet?.formulas,()=>{
    const {cash,spill,equity}=sheet.formulas;
    // Hash the exact reviewed Engine 2 publisher formulas, including the Q filter.
    const sha = s=>createHash('sha256').update(s).digest('hex');
    assert.equal(sha(cash),'07e7a1b6eef17e918f332dba48196315c7e35b04930f6905039146e882db22db');
    assert.equal(sha(spill),'f06483cfb08a98377a9392341efcc53ff8c922b4ae8ed076a8fbc200c1d1b76d');
    const dated=sheet.history.slice(1).filter(r=>r[0]);
    assert.ok(dated.length);
    dated.forEach((r,i)=>{
      const n=i+2;
      assert.deepEqual(equity[i],[
        `=10000*IFERROR(SUM(FILTER('Closed Trades'!$L$4:$L,'Closed Trades'!$R$4:$R<=A${n},'Closed Trades'!$C$4:$C<>"",'Closed Trades'!$Q$4:$Q<>"NO")),0)`,
        r[3],`=C${n}+D${n}`,`=100000+E${n}`]);
      assert.ok(typeof r[3]==='number');
    });
  });
  const status=Object.values(gates).includes('FAIL')?'FAIL':Object.values(gates).includes('UNVERIFIED')?'UNVERIFIED':'PASS';
  return {status,gates,missingDates,scope:'PRIMARY_DATA_RECONCILIATION',sessionDate:date,snapshotId:db?.snapshotId||null};
}

module.exports={reconcile};
if(require.main===module) {
  const input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
  const result=reconcile(input);
  console.log(JSON.stringify(result));
  if(result.status!=='PASS')process.exitCode=1;
}
