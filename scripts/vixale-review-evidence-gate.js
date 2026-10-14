'use strict';
// Strict, evidence-only VIXALE model validators. No scores are estimated here.
const CAPS=Object.freeze({Market:10,Sector:15,Leadership:15,Catalyst:10,Base:15,Compression:10,Volume:15,MA:5,Resistance:5});
const FACTORS=Object.keys(CAPS);
function requireTrue(ok,message){if(!ok)throw new Error('DATA BLOCKED: '+message);}
function ticker(x){return String(x||'').trim().toUpperCase();}
function date(x){return /^\d{4}-\d{2}-\d{2}$/.test(String(x||''));}
function factors(review){
  requireTrue(review && typeof review==='object','Missing score review');
  const scores=review.factors;
  requireTrue(scores && typeof scores==='object' && Object.keys(scores).length===9,'Exactly nine factors required');
  for(const name of FACTORS){
    const x=scores[name];
    requireTrue(Number.isInteger(x)&&x>=0&&x<=CAPS[name],name+' score outside 0..'+CAPS[name]);
    const ev=review.evidence?.[name];
    requireTrue(ev && typeof ev==='object' && date(ev.asOfDate) &&
      Array.isArray(ev.sources) && ev.sources.length>0 &&
      ev.sources.every(s=>typeof s==='string' && /^https?:\/\//.test(s)) &&
      typeof ev.rationale==='string' && ev.rationale.trim().length>=12,
      name+' needs dated private sources and rationale');
  }
  requireTrue(FACTORS.reduce((a,n)=>a+scores[n],0)===review.score,'Nine factors must equal exact public score');
  requireTrue(Number.isInteger(review.score)&&review.score>=0&&review.score<=100,'Public score must be 0..100 integer');
  requireTrue(date(review.reviewDate),'Missing actual review date');
  const market=review.marketEvidence;
  requireTrue(market && date(market.lastCompletedSession) &&
    Number.isInteger(market.completedDailyBars) && market.completedDailyBars>=200,
    'At least 200 completed daily bars required');
  requireTrue(market.exchangeVolume===true,'Exchange volume must be evidenced, not social volume');
  requireTrue(Number.isFinite(market.sma20)&&Number.isFinite(market.sma50)&&Number.isFinite(market.sma200),
    'SMA20/50/200 missing');
  requireTrue(Number.isFinite(market.relativePerformance)&&Number.isFinite(market.relativeVolume),
    'Relative performance and volume missing');
  requireTrue(typeof review.sourceArtifact==='string'&&review.sourceArtifact.trim(),'Private research artifact missing');
  return review.score;
}
function unique(rows,label){
  const seen=new Set();
  for(const x of rows){
    requireTrue(x.ticker,'Empty '+label+' ticker');
    requireTrue(!seen.has(x.ticker),'Duplicate '+label+' ticker '+x.ticker);
    seen.add(x.ticker);
  }
  return seen;
}
function equalSet(a,b,left,right){
  const x=[...a].sort().join('|'),y=[...b].sort().join('|');
  requireTrue(x===y, left+' / '+right+' membership mismatch: '+x+' vs '+y);
}
function workbook(snapshot){
  requireTrue(snapshot && typeof snapshot==='object','Missing snapshot');
  const active=(snapshot.openPositions||[]).filter(r=>r.status==='Active Portfolio');
  const p=(snapshot.portfolio||[]).filter(r=>r.status==='Active Portfolio');
  const feed=snapshot.publicActive||[];
  const sa=unique(active,'Open Positions'),sp=unique(p,'Portfolio'),sf=unique(feed,'Public Feed');
  requireTrue(sa.size<=10,'More than 10 active positions');
  equalSet(sa,sp,'Open Positions','Portfolio');
  equalSet(sa,sf,'Open Positions','Public Feed');
  for(const row of active){
    requireTrue(date(row.entryDate)&&Number.isFinite(row.entryPrice)&&row.entryPrice>0,'Invalid lot entry '+row.ticker);
    requireTrue(Number.isInteger(row.entryScore)&&row.entryScore>=0&&row.entryScore<=100,'Invalid immutable entry score '+row.ticker);
    const master=p.find(x=>x.ticker===row.ticker),publicRow=feed.find(x=>x.ticker===row.ticker);
    requireTrue(master && publicRow && master.entryPrice===row.entryPrice && publicRow.entryPrice===row.entryPrice,
      'Entry-price mismatch '+row.ticker);
    requireTrue(master.score===publicRow.score,'Portfolio/Public current score mismatch '+row.ticker);
    requireTrue(row.reviewDate===publicRow.reviewDate,'Open/Public review date mismatch '+row.ticker);
  }
  const seenClosed=new Set();
  for(const r of snapshot.closedTrades||[]){
    const lot=[r.ticker,r.entryDate,r.exitDate,r.exitTime,r.reason].join('|');
    requireTrue(!seenClosed.has(lot),'Duplicate closed lot '+lot);
    seenClosed.add(lot);
    requireTrue(r.include==='YES'||r.include==='NO','Closed Q must be YES or NO');
    if(r.include==='YES')requireTrue(date(r.effectiveDate),'Included trade must have R effective date');
  }
  requireTrue(snapshot.formulas?.cashPct===true,'Public Feed cash_pct formula missing');
  requireTrue(snapshot.formulas?.closedSpill===true,'Public Feed Closed Trades spill missing');
  requireTrue(snapshot.formulas?.equityHistoryProtected===true,'Equity History C/E/F formulas or numeric historical D damaged');
  return {activeTickers:[...sa].sort(),closedTrades:(snapshot.closedTrades||[]).length};
}
function reviewSet(snapshot,reviews,expectedDate){
  const current=workbook(snapshot);
  requireTrue(date(expectedDate),'Invalid review day');
  const expected=[...new Set([...current.activeTickers,...(snapshot.candidates||[]).map(r=>r.ticker)])].sort();
  requireTrue(Array.isArray(reviews),'Reviews missing');
  const actual=unique(reviews.map(x=>({ticker:ticker(x.ticker)})),'review');
  equalSet(new Set(expected),actual,'All active+candidates','Full score evidence');
  for(const r of reviews){
    requireTrue(r.reviewDate===expectedDate,'Review date is not target day '+r.ticker);
    requireTrue(r.marketEvidence?.lastCompletedSession<expectedDate,'Session must be completed before review '+r.ticker);
    factors(r);
  }
  return {count:reviews.length,active:current.activeTickers.length,date:expectedDate};
}
module.exports={CAPS,FACTORS,factors,workbook,reviewSet};
