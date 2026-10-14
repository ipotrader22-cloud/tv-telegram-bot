'use strict';
const {fetchAaoiPrimary}=require('./vixale-aaoi-official-release');
const now=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const floor=new Date(Date.parse(now+'T00:00:00Z')-30*86400000).toISOString().slice(0,10);
fetchAaoiPrimary({reviewDate:now,earliest:floor}).then(items=>{
 console.log(JSON.stringify({gate:'AAOI_OFFICIAL_NEWS',result:'PASS',
   dates:items.map(x=>x.publishedDate),sourceHost:'investors.ao-inc.com',
   note:'No OpenAI usage, no Sheet writes, no emails'}));
}).catch(e=>{console.error(e.message);process.exitCode=1;});
