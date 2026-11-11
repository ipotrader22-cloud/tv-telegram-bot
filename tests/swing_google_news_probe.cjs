'use strict';
(async()=>{
 for(const pair of [['AIZ','NYSE'],['VTRS','NASDAQ']]){
  try{
   const response=await fetch('https://www.google.com/finance/quote/'+pair.join(':')+'?hl=en&gl=US',{headers:{'user-agent':'Mozilla/5.0 (compatible; VixaleNewsTest/1.0)','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(12000)});
   const html=await response.text(),match=html.match(/News stories|News\s+stories/i),idx=match?.index??-1;
   const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].filter(m=>/news|article|finance/i.test(m[1])).slice(0,12).map(m=>m[1]);
   const block=idx<0?'':html.slice(idx,idx+16000).split('>Show more<')[0];
   const cards=[...block.matchAll(/<div class="LIT7If">([\s\S]*?)(?=<div class="LIT7If">|<div class="VfPpkd)/g)].slice(0,4);
   const items=cards.map(m=>{const body=m[1];return {
     href:body.match(/<a href="([^"]+)"[^>]*>/)?.[1],
     publisher:body.match(/<div class="WrUjhf">([^<]+)/)?.[1],
     relative:body.match(/<div class="JQ8Czd">([^<]+)/)?.[1],
     title:body.match(/<div class="TQWIEd">([^<]+)/)?.[1]};}).filter(x=>x.href);
   console.log(JSON.stringify({ticker:pair[0],http:response.status,items}));
   for(const a of items.slice(0,3)){
    try{const res=await fetch(a.href.replace(/&amp;/g,'&'),{headers:{'user-agent':'Mozilla/5.0','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(9000)});const page=(await res.text()).slice(0,300000);
      const published=[...page.matchAll(/<(?:meta|time)\b[^>]*(?:datePublished|article:published_time|pubdate|dateCreated|datetime|datepublished)[^>]*>/gi)].slice(0,4).map(x=>x[0].slice(0,350));
      const meta=[...page.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/gi)].slice(0,2).map(x=>x[0].slice(0,380));
      console.log(JSON.stringify({publisher:a.publisher,title:a.title,http:res.status,dateTags:published,descriptions:meta,finalUrl:res.url.slice(0,160)}));
    }catch(error){console.log(JSON.stringify({publisher:a.publisher,status:'BLOCKED',reason:String(error?.cause?.code||error?.name||'UNKNOWN')}))}
   }
  }catch(error){console.log(JSON.stringify({ticker:pair[0],status:'BLOCKED',reason:String(error?.cause?.code||error?.name||'UNKNOWN')}))}
 }
})().catch(()=>process.exitCode=1);
