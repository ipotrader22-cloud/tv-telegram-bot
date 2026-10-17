'use strict';
// Dated public-evidence intake. Retrieval verifies HTTP response and content identity,
// but does not itself prove the factual claim or establish an analyst factor score.
const crypto=require('node:crypto');
const trust=(url,type)=>{let u;try{u=new URL(url)}catch{return false}if(u.protocol!=='https:'||u.username||u.password)return false;const h=u.hostname.toLowerCase();if(type==='SEC_FILING')return h==='sec.gov'||h.endsWith('.sec.gov');if(type==='COMPANY_IR')return h.startsWith('investors.')||h.startsWith('ir.')||h.startsWith('investor.');return ['REPUTABLE_NEWS','EXCHANGE_NOTICE'].includes(type)};
async function retrieveDocument({ticker,reviewDate,source,fetchImpl=globalThis.fetch}){
 if(!/^[A-Z.-]+$/.test(ticker)||!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)||!source||!trust(source.url,source.sourceType))throw Error('Untrusted document source');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(source.publishedDate)||source.publishedDate>reviewDate)throw Error('Document not available by review date');
 if(typeof fetchImpl!=='function')throw Error('Fetch dependency missing');
 const response=await fetchImpl(source.url,{headers:{Accept:'text/html, text/plain, application/json','User-Agent':'VIXALE-Research/2.0 compliance-contact-required'},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Document HTTP '+response.status);
 const mime=(response.headers.get('content-type')||'').toLowerCase();
 if(!/(text\/html|text\/plain|application\/json)/.test(mime))throw Error('Unsupported document MIME');
 const body=await response.text();
 if(body.length<80||body.length>2_000_000)throw Error('Document size outside validation bounds');
 const digest=crypto.createHash('sha256').update(body).digest('hex');
 const plain=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 if(!plain||plain.length<50)throw Error('Insufficient source content');
 return {ticker,reviewDate,publishedDate:source.publishedDate,sourceType:source.sourceType,url:source.url,contentSha256:digest,contentLength:body.length,retrievedAt:new Date().toISOString(),extractedText:plain.slice(0,15000),status:'RETRIEVED_NOT_FACT_VERIFIED'};
}
module.exports={retrieveDocument,trust};
