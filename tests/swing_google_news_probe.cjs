'use strict';
(async()=>{
 for(const pair of [['AIZ','NYSE'],['VTRS','NASDAQ']]){
  try{
   const response=await fetch('https://www.google.com/finance/quote/'+pair.join(':')+'?hl=en&gl=US',{headers:{'user-agent':'Mozilla/5.0 (compatible; VixaleNewsTest/1.0)','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(12000)});
   const html=await response.text(),match=html.match(/News stories|News\s+stories/i),idx=match?.index??-1;
   const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].filter(m=>/news|article|finance/i.test(m[1])).slice(0,12).map(m=>m[1]);
   console.log(JSON.stringify({ticker:pair[0],http:response.status,size:html.length,newsIndex:idx,newsExcerpt:idx<0?null:html.slice(Math.max(0,idx-1200),idx+10500).replace(/<script[^>]*>[\s\S]*?<\/script>/g,'[script]').slice(0,10500),interestingAnchors:anchors}));
  }catch(error){console.log(JSON.stringify({ticker:pair[0],status:'BLOCKED',reason:String(error?.cause?.code||error?.name||'UNKNOWN')}))}
 }
})().catch(()=>process.exitCode=1);
