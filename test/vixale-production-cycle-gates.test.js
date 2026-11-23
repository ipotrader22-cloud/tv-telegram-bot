'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {checkData,checkPublication,deliveryEligibility,ID}=require('../scripts/vixale-production-cycle-gates');
const day='2026-10-14', prior='2026-10-13';
const history=()=>{const h=[];h.complete=true;return h;};
function snapshot(){
 return {portfolio:[],openPositions:[],publicActive:[],candidates:[],closedTrades:[],
  formulas:{cashPct:true,closedSpill:true,equityHistoryProtected:true},
  publicSnapshotDate:day,equityHistoryDate:day,equityDates:[day],
  closedLedgerImmutable:true,formulaReadbackVerified:true};
}
const validData=()=>checkData({spreadsheetId:ID,snapshot:snapshot(),reviews:[],date:day});
function api(){
 return {snapshot_date:day,equity_history_latest_date:day,active_portfolio:[],interns:[]};
}
test('DATA refuses stale worksheet',()=>assert.throws(()=>checkData({spreadsheetId:ID,snapshot:{...snapshot(),publicSnapshotDate:prior},reviews:[],date:day}),/Public Feed/));
test('DATA refuses missing current full-review evidence',()=>{
 const s=snapshot();s.candidates=[{ticker:'NVDA'}];
 assert.throws(()=>checkData({spreadsheetId:ID,snapshot:s,reviews:[],date:day}),/membership mismatch/);
});
test('DATA refuses missing or duplicated equity date',()=>{
 for(const arr of [[],[day,day]]){
  const s=snapshot();s.equityDates=arr;
  assert.throws(()=>checkData({spreadsheetId:ID,snapshot:s,reviews:[],date:day}),/Exactly one current equity/);
 }
});
test('PUBLICATION refuses stale reviewed date',()=>{
 const x=api();x.active_portfolio=[{ticker:'PLTR',last_review_date:prior,brief_note:'Prior verified research'}];
 assert.throws(()=>checkPublication({date:day,api:x,html:x,uncached:true}),/review must be current/);
});
test('PUBLICATION refuses cached result and mismatched HTML',()=>{
 assert.throws(()=>checkPublication({date:day,api:api(),html:api(),uncached:false}),/uncached/);
 assert.throws(()=>checkPublication({date:day,api:api(),html:{...api(),snapshot_date:prior},uncached:true}),/date mismatch/);
});
test('DELIVERY is forbidden before both gates',()=>{
 assert.throws(()=>deliveryEligibility({date:day,data:{stage:'DATA',status:'PASS',date:day},publication:null,history:history(),recipient:'test@example.test'}),/PUBLICATION/);
});
test('DELIVERY blocks partially paginated provider history',()=>{
 const d=validData(),p=checkPublication({date:day,api:api(),html:api(),uncached:true});
 assert.throws(()=>deliveryEligibility({date:day,data:d,publication:p,history:[],recipient:'test@example.test'}),/pagination/);
});
test('DELIVERY never sends if existing accepted or delivered',()=>{
 const d=validData(),p=checkPublication({date:day,api:api(),html:api(),uncached:true});
 const h=history(),subject='Vixale Swing Leaders — Morning Review — '+day;
 h.push({subject,to:'test@example.test',status:'delivered'});
 assert.equal(deliveryEligibility({date:day,data:d,publication:p,history:h,recipient:'test@example.test'}).maySend,false);
 h[0].status='sent';
 assert.equal(deliveryEligibility({date:day,data:d,publication:p,history:h,recipient:'test@example.test'}).status,'HOLD_EXISTING');
});
test('DELIVERY eligible only when provider history complete and empty',()=>{
 const d=validData(),p=checkPublication({date:day,api:api(),html:api(),uncached:true});
 const x=deliveryEligibility({date:day,data:d,publication:p,history:history(),recipient:'test@example.test'});
 assert.equal(x.maySend,true);assert.equal(x.logicalKey,'vixale-swing-morning-review-'+day);
});
