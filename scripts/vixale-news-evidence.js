'use strict';
// News stage: one independently-cited search per ticker. Never authorizes portfolio writes.
function blocker(message){throw Error('NEWS BLOCKED: '+message);}
function annotationUrls(response){
  return [...new Set((response.output||[]).flatMap(x=>x.content||[])
    .flatMap(x=>x.annotations||[])
    .filter(x=>x.type==='url_citation' && typeof x.url==='string')
    .map(x=>x.url).filter(url=>{
      try{const u=new URL(url);return u.protocol==='https:' && !u.username && !u.password;}
      catch{return false;}
    }))];
}
async function getNews({ticker,date,key,model='gpt-4.1-mini',request=fetch}){
  if(!/^[A-Z0-9.\-]{1,15}$/.test(ticker) || !/^\d{4}-\d\d-\d\d$/.test(date))blocker('Invalid research target');
  if(!key)blocker('Missing OpenAI key');
  const r=await request('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model,store:false,tools:[{type:'web_search',search_context_size:'medium'}],
      input:'Search for verifiable, date-specific business developments relevant to US-listed ticker '+ticker+
      ' within the seven days ending '+date+'. Cite primary or established financial reporting URLs. '+
      'State exactly what the cited source supports and publication date. Do not guess facts.',
      max_output_tokens:650}),
    signal:AbortSignal.timeout(90000)
  });
  if(!r.ok)blocker('OpenAI news HTTP '+r.status);
  const response=await r.json();
  if(response.status!=='completed')blocker('Incomplete web research '+ticker);
  if(!(response.output||[]).some(x=>x.type==='web_search_call'))blocker('No actual web search '+ticker);
  const urls=annotationUrls(response);
  if(!urls.length)blocker('No cited independent news sources '+ticker);
  const text=(response.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  if(text.length<80)blocker('Insufficient sourced news for '+ticker);
  return {ticker,date,checkedAt:new Date().toISOString(),urls,sourceText:text,
    provenance:'web_search URL annotations; factual claims require date verification before scoring'};
}
module.exports={annotationUrls,getNews};
