'use strict';
// Compare independent completed factor reviews against real archived score records.
// Never promotes historical notebook notes into independently verified factors.
function reconcile({independentReviews,archivedReviews}){
 if(!Array.isArray(independentReviews)||!Array.isArray(archivedReviews))throw Error('Review lists required');
 const archived=new Map();
 for(const a of archivedReviews){const key=a.ticker+'|'+a.reviewDate;if(archived.has(key))throw Error('Duplicate archived review '+key);archived.set(key,a)}
 return independentReviews.map(i=>{
  const row={ticker:i.ticker,reviewDate:i.reviewDate};
  if(i.status!=='COMPLETE_ANALYST_REVIEW'||!Number.isInteger(i.score))return {...row,status:'INDEPENDENT_RESEARCH_INCOMPLETE'};
  const a=archived.get(i.ticker+'|'+i.reviewDate);
  if(!a)return {...row,status:'ARCHIVED_REVIEW_NOT_AVAILABLE'};
  if(!Number.isInteger(a.score))return {...row,status:'ARCHIVED_SCORE_NOT_VERIFIED'};
  if(a.score!==i.score)return {...row,status:'SCORE_DIFFERENCE',independentScore:i.score,archivedScore:a.score};
  return {...row,status:'SCORE_MATCH',independentScore:i.score,archivedScore:a.score};
 });
}
module.exports={reconcile};
