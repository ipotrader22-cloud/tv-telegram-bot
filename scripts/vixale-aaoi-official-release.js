'use strict';
// Pinned primary-source backfill for AAOI's October 5, 2026 release.
// DO NOT use this as a future-day automatic source beyond its bounded period.
const crypto=require('node:crypto');
const URL='https://investors.ao-inc.com/news-releases/news-release-details/applied-optoelectronics-announces-completion-previously';
const PRESSWIRE_URL='https://www.prnewswire.com/news-releases/applied-optoelectronics-announces-completion-of-previously-announced-at-the-market-offering-302897857.html';
const RELEASE_DATE='2026-10-05';
const HEADLINE='Applied Optoelectronics Announces Completion of Previously Announced At the Market Offering';
function blocked(m){throw Error('AAOI PRIMARY BLOCKED: '+m);}
function clean(html){return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
 .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
 .replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();}
function parseRelease(html,{reviewDate,earliest,sourceUrl=URL}){
 if(!/^\d{4}-\d\d-\d\d$/.test(reviewDate)||!/^\d{4}-\d\d-\d\d$/.test(earliest))blocked('Date boundaries missing');
 if(typeof html!=='string'||html.length>2000000)blocked('Publisher page size invalid');
 const text=clean(html);
 const at=text.indexOf(HEADLINE);
 if(at<0)blocked('Exact official headline not found');
 const intro=text.slice(at,at+1400);
 if(!/October\s+5,\s+2026/i.test(intro)||!/\b(?:NASDAQ\s*:\s*AAOI|NASDAQ\s+AAOI)\b/i.test(intro)||
    !/at.the.market/i.test(intro))blocked('Publication date/company facts cannot be established directly');
 if(RELEASE_DATE<earliest||RELEASE_DATE>reviewDate)blocked('Release outside permitted source window');
 if(intro.length<200)blocked('Publisher article text too short');
 const url=new globalThis.URL(sourceUrl);
 if(!['investors.ao-inc.com','www.prnewswire.com'].includes(url.hostname))blocked('Unexpected publisher domain');
 return {url:sourceUrl,publishedDate:RELEASE_DATE,excerpt:intro.slice(0,850),verified:true,
   verification:'Official AAOI primary release (date/headline/ticker all checked in retrieved page)',
   hash:crypto.createHash('sha256').update(html).digest('hex')};
}
async function fetchAaoiPrimary({reviewDate,earliest,request=fetch}){
 const reasons=[];
 for(const url of [URL,PRESSWIRE_URL]){
  try{
   const r=await request(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!r.ok){reasons.push(new globalThis.URL(url).hostname+':HTTP_'+r.status);continue;}
   return [parseRelease(await r.text(),{reviewDate,earliest,sourceUrl:url})];
  }catch(e){reasons.push(new globalThis.URL(url).hostname+':REJECTED');}
 }
 blocked('Primary publisher mirrors unavailable '+reasons.join(';'));
}
module.exports={URL,PRESSWIRE_URL,RELEASE_DATE,parseRelease,fetchAaoiPrimary};
