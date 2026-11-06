'use strict';
// VIXALE fixed-$10k model accounting only. Pure read-only reconciliation helper.
const ALLOCATION=10000, BASE_EQUITY=100000;
const fail=m=>{throw new Error('MODEL ACCOUNTING BLOCKED: '+m);};
function tradingDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'');}
function reconcile({asOfDate,active,closed,reported}){
 if(!tradingDate(asOfDate))fail('Valid as-of date required');
 if(!Array.isArray(active)||!Array.isArray(closed))fail('Missing exact lot arrays');
 let realized=0,unrealized=0,includedClosed=0;
 const seen=new Set();
 for(const row of closed){
  if(row.include!=='YES'&&row.include!=='NO')fail('Closed Q must be YES or NO');
  const key=[row.ticker,row.entryDate,row.exitDate,row.exitTime,row.reason].join('|');
  if(!row.ticker||seen.has(key))fail('Missing or duplicate closed lot');
  seen.add(key);
  if(row.include==='NO')continue;
  if(!tradingDate(row.effectiveDate))fail('Included close missing R effective date');
  if(row.effectiveDate>asOfDate)continue;
  if(!Number.isFinite(row.realizedReturnFraction))fail('Invalid realized return percentage');
  realized+=ALLOCATION*row.realizedReturnFraction;
  includedClosed++;
 }
 const activeSeen=new Set();
 for(const row of active){
  if(!row.ticker||activeSeen.has(row.ticker))fail('Duplicate open ticker');
  activeSeen.add(row.ticker);
  if(!Number.isFinite(row.entryPrice)||row.entryPrice<=0||!Number.isFinite(row.currentPrice)||row.currentPrice<=0)
   fail('Missing price for exact active lot');
  const observedReturn=row.currentPrice/row.entryPrice-1;
  if(Number.isFinite(row.currentReturnFraction) && Math.abs(row.currentReturnFraction-observedReturn)>0.00005)
   fail('Open return/price discrepancy '+row.ticker);
  unrealized+=ALLOCATION*observedReturn;
 }
 const total=realized+unrealized,equity=BASE_EQUITY+total;
 if(reported){
  for(const [key,value] of Object.entries({realized,unrealized,total,equity})){
   if(!Number.isFinite(reported[key])||Math.abs(reported[key]-value)>0.02)
    fail('Reconciliation mismatch '+key);
  }
 }
 return {realized,unrealized,total,equity,activeCount:active.length,includedClosed};
}
module.exports={reconcile,ALLOCATION,BASE_EQUITY};
