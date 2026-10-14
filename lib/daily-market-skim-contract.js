'use strict';
// Research/publication-only guard. No broker APIs, Sheet writes, credentials or model execution.
const crypto=require('node:crypto');
const TICKER_TAG=/\b(?:PLTR|NVDA|DELL|PANW|AAOI|COHR|XOM|FTNT)\b/g;
const allowedHosts=['sec.gov','www.sec.gov','www.nvidia.com','nvidianews.nvidia.com',
 'investors.palantir.com','investors.delltechnologies.com','investors.paloaltonetworks.com',
 'investors.coherent.com','investor.exxonmobil.com','investor.fortinet.com',
 'investors.ao-inc.com','www.energy.gov','www.bls.gov','www.federalreserve.gov'];
function reject(reason){throw Error('DAILY SKIM BLOCKED: '+reason);}
function iso(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));}
function validateSkim(value,{todayET}){
 if(!value||typeof value!=='object'||Array.isArray(value))reject('Missing object');
 if(!iso(todayET)||value.dateET!==todayET||!iso(value.universeDate)||value.universeDate>todayET)reject('Invalid/current-date mismatch');
 if(value.provenance!=='independent-public-sources')reject('Incorrect provenance');
 if(typeof value.reviewedAtET!=='string'||!new RegExp('^'+todayET+'T\\d\\d:\\d\\d:\\d\\d(?:-04:00|-05:00)$').test(value.reviewedAtET))reject('Timestamp must be ET with explicit offset');
 for(const k of ['summaryEn','summaryRu']){
  const s=value[k];
  if(typeof s!=='string'||s.length<50||s.length>700||/[\u0000-\u001f]|<[^>]+>/.test(s))reject('Malformed '+k);
 }
 const en=value.summaryEn.trim();
 if(en.split(/\s+/).length>90)reject('English skim >90 words');
 if(!Array.isArray(value.sources)||value.sources.length<1||value.sources.length>2)reject('Need 1–2 corroborating public sources');
 const urls=new Set();
 for(const source of value.sources){
  if(!source||!iso(source.issuedDate)||source.issuedDate>todayET||typeof source.issuer!=='string'||source.issuer.length<3||source.issuer.length>100)reject('Invalid source date/issuer');
  let u;try{u=new URL(source.url);}catch{reject('Invalid public source URL');}
  if(u.protocol!=='https:'||!allowedHosts.includes(u.hostname)||u.username||u.password||u.port)reject('Source host not allowlisted');
  if(urls.has(u.href))reject('Duplicate source');urls.add(u.href);
 }
 if(typeof value.stance!=='string'||!['constructive','mixed','defensive','neutral'].includes(value.stance))reject('Invalid stance');
 // This validates output shape, not semantic corroboration. Independent source review remains required.
 return {data:value,digest:crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
module.exports={validateSkim,TICKER_TAG,allowedHosts};
