'use strict';
/**
 * Production cycle preflight. Pure fail-closed decision logic: NO SHEET WRITES,
 * NO EMAIL SEND, NO SITE MUTATION. Works only with caller-supplied observed evidence.
 * Actual provider verification MUST precede marking a stage PASS.
 */
const {reviewSet}=require('./vixale-review-evidence-gate');
const {assertDailyReview}=require('./swing-daily-review-gate');
const {session}=require('./swing-market-calendar');
const ID='14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
function requireGate(ok,msg){if(!ok){const e=new Error('CYCLE BLOCKED: '+msg);e.code='VIXALE_CYCLE_BLOCKED';throw e;}}
function getStage(date,stage){return {date,stage,status:'PASS'};}
function checkData({spreadsheetId,snapshot,reviews,date}){
 requireGate(spreadsheetId===ID,'Unknown production workbook');
 requireGate(session(date).open,'Not an NYSE session');
 requireGate(snapshot?.publicSnapshotDate===date,'Public Feed is not for the requested date');
 const result=reviewSet(snapshot,reviews,date);
 requireGate(snapshot.equityDates?.filter(x=>x===date).length===1,'Exactly one current equity snapshot required');
 requireGate(snapshot.equityHistoryDate===date,'Equity History not current');
 requireGate(snapshot.closedLedgerImmutable===true,'Closed ledger/ Q-R reconciliation not attested');
 requireGate(snapshot.formulaReadbackVerified===true,'Historical formula readback missing');
 return {...getStage(date,'DATA'),...result};
}
function checkPublication({date,api,html,uncached}){
 requireGate(uncached===true,'Publication verification must be uncached');
 requireGate(api && typeof api==='object' && html && typeof html==='object','API/HTML evidence absent');
 assertDailyReview(api,date);
 requireGate(api.snapshot_date===html.snapshot_date,'HTML/API snapshot date mismatch');
 requireGate(api.equity_history_latest_date===html.equity_history_latest_date,'HTML/API equity mismatch');
 const tickers=x=>(x||[]).map(r=>r.ticker).sort().join('|');
 requireGate(tickers(api.active_portfolio)===tickers(html.active_portfolio),'HTML/API portfolio mismatch');
 requireGate(tickers(api.interns)===tickers(html.interns),'HTML/API candidate mismatch');
 requireGate(api.equity_history_latest_date===date,'Equity date not updated');
 return getStage(date,'PUBLICATION');
}
function deliveryEligibility({date,data,publication,history,recipient}){
 requireGate(data?.stage==='DATA'&&data.status==='PASS'&&data.date===date,'DATA gate not passed');
 requireGate(publication?.stage==='PUBLICATION'&&publication.status==='PASS'&&publication.date===date,
  'PUBLICATION gate not passed');
 requireGate(Array.isArray(history)&&history.every(x=>x&&typeof x==='object'),'Complete provider history required');
 requireGate(history.complete===true,'Provider history pagination not exhausted'); // caller must explicitly verify full history
 requireGate(typeof recipient==='string'&&recipient.length>3,'Recipient not configured');
 const subject='Vixale Swing Leaders — Morning Review — '+date;
 const logicalKey='vixale-swing-morning-review-'+date;
 const matches=history.filter(x=>x.subject===subject&&x.to===recipient);
 const delivered=matches.some(x=>x.status==='delivered');
 const accepted=matches.some(x=>['sent','delivered','queued','scheduled','delivery_delayed','bounced'].includes(x.status));
 return {date,stage:'DELIVERY',status:delivered?'DELIVERED':accepted?'HOLD_EXISTING':'ELIGIBLE',
  subject,logicalKey,maySend:!delivered&&!accepted};
}
module.exports={checkData,checkPublication,deliveryEligibility,ID};
