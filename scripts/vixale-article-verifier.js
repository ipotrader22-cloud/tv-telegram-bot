'use strict';
// Independent HTTP validation of URLs returned by OpenAI web_search annotations.
// A model-supplied date is NOT verification. This stage reads a publisher page.
const crypto=require('node:crypto');
const trust=['reuters.com','cnbc.com','marketwatch.com','barrons.com','wsj.com',
  'apnews.com','businesswire.com','prnewswire.com','sec.gov','finance.yahoo.com',
  'nasdaq.com','investing.com','fool.com','investors.com'];
function blocked(m){throw Error('ARTICLE BLOCKED: '+m);}
function hostAllowed(url){
 try{
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port) return false;
  return trust.some(d=>u.hostname===d||u.hostname.endsWith('.'+d));
 }catch{return false}
}
function decode(s){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function attribute(html,key){
 const tags=html.match(/<meta\b[^>]*>/gi)||[];
 for(const tag of tags){
  const name=tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
  const value=tag.match(/content=["']([^"']+)["']/i)?.[1];
  if(name===key && value)return decode(value);
 }
 return '';
}
function articlePage(html,ref,reviewDate,previous){
 const published=attribute(html,'article:published_time')||attribute(html,'datePublished')||
  attribute(html,'pubdate')||attribute(html,'date');
 const date=published.slice(0,10);
 const excerpt=attribute(html,'og:description')||attribute(html,'description');
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||date>reviewDate||date<previous)blocked('Cannot confirm current publication date');
 if(excerpt.trim().length<65)blocked('Insufficient directly retrieved article text');
 return {url:ref,publishedDate:date,excerpt:excerpt.slice(0,850),verified:true,
  hash:crypto.createHash('sha256').update(html).digest('hex')};
}
async function checkUrl(url,{reviewDate,previous,request=fetch}){
 if(!hostAllowed(url))blocked('Source domain not allowlisted');
 const response=await request(url,{method:'GET',headers:{'User-Agent':'VIXALE-Research/1.0'},
   redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)blocked('Publisher HTTP '+response.status);
 const body=await response.text();
 if(body.length>2000000)blocked('Publisher response too large');
 return articlePage(body,url,reviewDate,previous);
}
module.exports={hostAllowed,attribute,articlePage,checkUrl};
