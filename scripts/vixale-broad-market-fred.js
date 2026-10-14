'use strict';
// Dated public FRED series. Only concise original commentary, no raw quote redistribution.
const SERIES=Object.freeze({
 sp500:{id:'SP500',url:'https://fred.stlouisfed.org/series/SP500'},
 nasdaq:{id:'NASDAQCOM',url:'https://fred.stlouisfed.org/series/NASDAQCOM'},
 vix:{id:'VIXCLS',url:'https://fred.stlouisfed.org/series/VIXCLS'},
 treasury10y:{id:'DGS10',url:'https://fred.stlouisfed.org/series/DGS10'}
});
function parseCsv(csv,id,{reviewDate}){
 if(typeof csv!=='string'||csv.length>3000000)throw Error('MARKET DATA: oversized');
 const rows=csv.trim().split(/\r?\n/);
 if(!['DATE,VALUE','observation_date,'+id].includes(rows[0].trim()))throw Error('MARKET DATA: unexpected FRED CSV for '+id);
 const valid=[];
 for(const row of rows.slice(1)){
  const match=row.match(/^(\d{4}-\d{2}-\d{2}),(-?\d+(?:\.\d+)?)$/);
  if(!match||match[1]>reviewDate)continue;
  const value=Number(match[2]);
  if(Number.isFinite(value)&&value>0)valid.push({date:match[1],value});
 }
 const tail=valid.slice(-2);
 if(tail.length!==2||tail[0].date>=tail[1].date)throw Error('MARKET DATA: insufficient completed observations '+id);
 const [prev,last]=tail;
 if(Date.parse(reviewDate+'T00:00:00Z')-Date.parse(last.date+'T00:00:00Z')>5*86400000)
  throw Error('MARKET DATA: stale '+id+' '+last.date);
 return {date:last.date,level:last.value,previousDate:prev.date,previousLevel:prev.value,
  changePct:100*(last.value-prev.value)/prev.value};
}
async function fetchSeries(key,{reviewDate,request=fetch}){
 const source=SERIES[key];if(!source)throw Error('Unknown series');
 const url='https://fred.stlouisfed.org/graph/fredgraph.csv?id='+encodeURIComponent(source.id);
 const res=await request(url,{headers:{Accept:'text/csv'},redirect:'error',signal:AbortSignal.timeout(18000)});
 if(!res.ok)throw Error('FRED '+source.id+' HTTP '+res.status);
 const raw=await res.text();
 return {...parseCsv(raw,source.id,{reviewDate}),sourceUrl:source.url};
}
async function collectMarket({reviewDate,request=fetch}){
 const entries=await Promise.allSettled(Object.keys(SERIES).map(k=>fetchSeries(k,{reviewDate,request})));
 const data={};
 for(const [i,key] of Object.keys(SERIES).entries())if(entries[i].status==='fulfilled')data[key]=entries[i].value;
 const required=['sp500','nasdaq','vix','treasury10y'];
 if(!required.every(k=>data[k]))throw Error('MARKET PENDING: Missing required dated index, volatility or Treasury series');
 // Equivalent session dates are essential: no mixed index-session claims.
 if(data.sp500.date!==data.nasdaq.date||data.sp500.date!==data.vix.date)
  throw Error('MARKET PENDING: Mismatched equity/VIX close dates');
 return {data,asOfDate:data.sp500.date};
}
module.exports={SERIES,parseCsv,fetchSeries,collectMarket};
