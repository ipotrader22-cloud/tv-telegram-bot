'use strict';
const {fetchNvidiaOfficial}=require('./vixale-official-rss');
function nyDay(){const x=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return x;}
(async()=>{
 const date=nyDay();
 const floor=new Date(Date.parse(date+'T00:00:00Z')-30*86400000).toISOString().slice(0,10);
 const result=await fetchNvidiaOfficial({reviewDate:date,earliest:floor});
 if(!result.length)throw Error('No verified dated NVIDIA RSS item');
 console.log(JSON.stringify({gate:'NVIDIA_OFFICIAL_RSS',status:'PASS',
  count:result.length,dates:result.map(x=>x.publishedDate),
  note:'No API billing, no spreadsheet or email access'}));
})().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
