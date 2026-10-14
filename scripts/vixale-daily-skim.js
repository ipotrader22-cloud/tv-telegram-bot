'use strict';
// Primary public company press releases ONLY. No TWS, IBKR or paid news material.
const {fetchNvidiaOfficial}=require('./vixale-official-rss');
const {validateSkim}=require('../lib/daily-market-skim-contract');
function dayNY(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function timestampNY(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZoneName:'shortOffset'}).formatToParts(now).map(p=>[p.type,p.value]));
 const hh=parts.hour==='24'?'00':parts.hour;const offset=parts.timeZoneName==='GMT-4'?'-04:00':parts.timeZoneName==='GMT-5'?'-05:00':null;
 if(!offset)throw Error('Unexpected America/New_York timezone offset');
 return dayNY(now)+'T'+hh+':'+parts.minute+':'+parts.second+offset;
}
function createBrief(items,{dateET,reviewedAtET}){
 const recent=items.filter(x=>x.verified && x.publishedDate<=dateET);
 if(!recent.length)throw Error('SKIM PENDING: No independently verified primary releases; no publishing.');
 const source=recent.sort((a,b)=>b.publishedDate.localeCompare(a.publishedDate))[0];
 const txt=source.excerpt.toLowerCase();
 const themes=[];
 if(/\b(?:chip design|semiconductor|fabrication|manufactur|fab)\b/.test(txt))themes.push('semiconductor design and manufacturing');
 if(/\b(?:artificial intelligence|ai)\b/.test(txt))themes.push('AI technology');
 if(/\b(?:data center|datacenter)\b/.test(txt))themes.push('data-center technology');
 const enThemes=themes.length?themes.join(' and '):'the company’s operations and products';
 const ruThemes=themes.length?themes.map(t=>({'semiconductor design and manufacturing':'разработки и производства микросхем','AI technology':'технологий искусственного интеллекта','data-center technology':'технологий центров обработки данных'}[t])).join(' и '):'деятельности и продуктов компании';
 const value={
  dateET,reviewedAtET,universeDate:dateET,provenance:'independent-public-sources',stance:'neutral',
  summaryEn:'NVIDIA’s latest verified company announcement is dated '+source.publishedDate+'. Its official release covers '+enThemes+'. This is a dated company-news snapshot, not a comprehensive assessment of the market or an Active Portfolio ranking update.',
  summaryRu:'Последнее подтверждённое корпоративное сообщение NVIDIA датировано '+source.publishedDate+'. Официальный релиз посвящён теме: '+ruThemes+'. Это обзор датированных корпоративных новостей, а не полная оценка рынка или обновление рейтинга Active Portfolio.',
  sources:[{url:source.url,issuedDate:source.publishedDate,issuer:'NVIDIA Newsroom'}]
 };
 return validateSkim(value,{todayET:dateET}).data;
}
async function collect({now=new Date(),fetcher=fetchNvidiaOfficial}={}){
 const dateET=dayNY(now);
 const floor=new Date(Date.parse(dateET+'T00:00:00Z')-14*86400000).toISOString().slice(0,10);
 const items=await fetcher({reviewDate:dateET,earliest:floor});
 return createBrief(items,{dateET,reviewedAtET:timestampNY(now)});
}
if(require.main===module){
 collect().then(x=>{process.stdout.write(JSON.stringify(x)+'\n');}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={dayNY,timestampNY,createBrief,collect};
