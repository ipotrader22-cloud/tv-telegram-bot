'use strict';
// Government macroeconomic releases only. No market-price inference, company feed, broker API or AI.
const FEEDS=Object.freeze([
 {name:'Federal Reserve monetary policy',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',host:'www.federalreserve.gov'},
 {name:'BLS Consumer Price Index',url:'https://www.bls.gov/feed/cpi.rss',host:'www.bls.gov'},
 {name:'BLS Employment Situation',url:'https://www.bls.gov/feed/empsit.rss',host:'www.bls.gov'}
]);
function decode(v){return String(v||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function itemField(item,key){const re=new RegExp('<'+key+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+key+'>','i');return decode(item.match(re)?.[1]||'');}
function parseOfficialRss(xml,{source,reviewDate,earliest}){
 if(typeof xml!=='string'||xml.length>2000000||!/<(?:rss|rdf:RDF)\b/i.test(xml))throw Error('MACRO SOURCE BLOCKED: Invalid bounded RSS');
 const rows=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
 return rows.map(item=>{
  const link=itemField(item,'link'),title=itemField(item,'title'),published=itemField(item,'pubDate'),desc=itemField(item,'description');
  let u;try{u=new URL(link)}catch{return null}
  const when=Date.parse(published);
  if(u.protocol!=='https:'||u.hostname!==source.host||!Number.isFinite(when)||title.length<12)return null;
  const date=new Date(when).toISOString().slice(0,10);
  if(date<earliest||date>reviewDate)return null;
  return {kind:'us-macro',source:source.name,url:u.href,publishedDate:date,title:title.slice(0,160),excerpt:desc.slice(0,450),verified:true};
 }).filter(Boolean).slice(0,5);
}
async function fetchMacroReleases({reviewDate,earliest,request=fetch}){
 const tasks=await Promise.allSettled(FEEDS.map(async source=>{
  const r=await request(source.url,{headers:{Accept:'application/rss+xml,application/xml,text/xml'},redirect:'error',signal:AbortSignal.timeout(14000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  return parseOfficialRss(await r.text(),{source,reviewDate,earliest});
 }));
 const records=tasks.flatMap(x=>x.status==='fulfilled'?x.value:[]);
 return {records,providersChecked:tasks.length,providersAvailable:tasks.filter(x=>x.status==='fulfilled').length};
}
module.exports={FEEDS,parseOfficialRss,fetchMacroReleases};
