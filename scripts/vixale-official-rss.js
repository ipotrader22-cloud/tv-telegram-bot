'use strict';
// A specific, verified publisher-controlled source; no model-generated citation/date.
const crypto=require('node:crypto');
const RSS_URL='https://nvidianews.nvidia.com/cats/press_release.xml';
const DOMAIN='nvidianews.nvidia.com';
function block(message){throw Error('RSS BLOCKED: '+message);}
function decode(x){return String(x||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16)));}
function field(item,name){
 const m=item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
 return m?decode(m[1]).trim():'';
}
function stripMarkup(s){return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
function parse(xml,{reviewDate,earliest}){
 if(!/^\d{4}-\d\d-\d\d$/.test(reviewDate)||!/^\d{4}-\d\d-\d\d$/.test(earliest))block('Invalid date constraint');
 if(typeof xml!=='string'||!/<rss\b/i.test(xml)||xml.length>2000000)block('Not a bounded RSS document');
 const entries=xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
 const news=[];
 for(const entry of entries){
  const link=field(entry,'link'),published=field(entry,'pubDate'),title=stripMarkup(field(entry,'title'));
  const summary=stripMarkup(field(entry,'description'));
  let url;try{url=new URL(link);}catch{continue;}
  if(url.protocol!=='https:'||url.hostname!==DOMAIN||url.username||url.password||url.port)continue;
  const timestamp=Date.parse(published);
  if(!Number.isFinite(timestamp))continue;
  const date=new Date(timestamp).toISOString().slice(0,10);
  if(date<earliest||date>reviewDate||summary.length<65||title.length<8)continue;
  const excerpt=(title+'. '+summary).slice(0,850);
  news.push({url:url.href,publishedDate:date,excerpt,verified:true,
    verification:'official publisher RSS pubDate and description',
    hash:crypto.createHash('sha256').update(entry).digest('hex')});
 }
 const dedup=[...new Map(news.map(n=>[n.url,n])).values()];
 return dedup.sort((a,b)=>b.publishedDate.localeCompare(a.publishedDate)).slice(0,4);
}
async function fetchNvidiaOfficial({reviewDate,earliest,request=fetch}){
 const response=await request(RSS_URL,{headers:{'Accept':'application/rss+xml, application/xml, text/xml'},
   redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)block('Official feed HTTP '+response.status);
 const xml=await response.text();
 const records=parse(xml,{reviewDate,earliest});
 if(!records.length)block('No dated, recent press release in official RSS');
 return records;
}
module.exports={RSS_URL,parse,fetchNvidiaOfficial};
