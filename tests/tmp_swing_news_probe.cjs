'use strict';
const {parseCards,relativeEstimate,collect}=require('../lib/swing-company-news');
(async()=>{
 for(const [ticker,exchange] of [['EXR','NYSE'],['PSA','NYSE'],['VTRS','NASDAQ'],['AIZ','NYSE']]){
  try{
   const start=Date.now();
   const url='https://www.google.com/finance/quote/'+ticker+':'+exchange+'?hl=en&gl=US';
   const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'user-agent':'Mozilla/5.0 (compatible; VixaleSourceProbe/1.0)','accept-language':'en-US,en;q=0.9'}});
   const html=await r.text();
   let parsed;
   try {parsed=parseCards(html,ticker)}catch(err){parsed={error:String(err.message)}}
   const position=html.indexOf('>News stories</div>'),section=html.slice(position,position+50000);
   const blocks=[...section.matchAll(/<div class="LIT7If">([\s\S]*?)(?=<div class="LIT7If">|<div class="VfPpkd)/g)];
   const examples=blocks.slice(0,8).map(m=>({title:m[1].match(/<div class="TQWIEd">([\s\S]*?)<\/div>/)?.[1]?.slice(0,110),relative:m[1].match(/<div class="JQ8Czd">([^<]*)<\/div>/)?.[1],publisher:m[1].match(/<div class="WrUjhf">([^<]*)<\/div>/)?.[1]}));
   console.log(JSON.stringify({ticker,status:r.status,bytes:html.length,sectionAt:position,company:parsed.company,error:parsed.error,rawBlocks:blocks.length,cards:parsed.cards?.length,examples,links:blocks.slice(0,5).map(m=>m[1].match(/<a href="([^"]+)"/)?.[1]?.slice(0,190)),elapsedMs:Date.now()-start}));
   if(ticker!=='AIZ'){
    const query=encodeURIComponent('"'+({EXR:'Extra Space Storage',PSA:'Public Storage',VTRS:'Viatris'}[ticker])+'" stock');
    const rss='https://news.google.com/rss/search?q='+query+'&hl=en-US&gl=US&ceid=US:en';
    try{const news=await fetch(rss,{signal:AbortSignal.timeout(7000),headers:{'user-agent':'Mozilla/5.0'}});const xml=await news.text();console.log(JSON.stringify({ticker,rssStatus:news.status,rssBytes:xml.length,rssItems:(xml.match(/<item>/g)||[]).length,rssPrefix:xml.slice(0,170)}))}catch(error){console.log(JSON.stringify({ticker,rssError:error?.name||'error'}))}
   }
  }catch(err){console.log(JSON.stringify({ticker,error:err?.code||err?.name||'error'}))}
 }
})().catch(e=>{console.log(String(e));process.exitCode=1});
