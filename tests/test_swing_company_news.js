'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const news=require('../lib/swing-company-news');
const core=require('../lib/swing-leaders-core');
const ui=require('../website_swing_active_model_pnl');
const now=new Date('2026-11-11T18:45:00Z'),date='2026-11-10';
function card(title,relative,url,source='MarketWatch'){
 return '<div class="LIT7If"><div class="jDwR9c"><div class="WrUjhf">'+source+
  '</div><div class="JQ8Czd">'+relative+'</div></div><a href="'+url+
  '" target="_blank"><div class="TQWIEd">'+title+'</div></a></div>';
}
function page(cards){
 return '<html><head><title>Assurant Inc (AIZ) Stock Price &amp; News - Google Finance</title></head><body>'+
  '<div>News stories</div><div class="S4GWHe">'+cards.join('')+
  '<div class="VfPpkd">Show more</div></div><c-data id="next"></c-data></body></html>';
}
const goodUrl='https://www.marketwatch.com/news/assurant-2026';
function feed(){
 return {snapshot_date:'2026-11-11',snapshot_time_et:'10:01 ET',market_posture:'Model review',
  active_count:1,intern_count:0,cash_pct:'90%',quote_source:'GOOGLEFINANCE',
  quote_delay_notice:'Quotes may be delayed.',research_disclaimer:'Research only.',
  active_portfolio:[{ticker:'AIZ',exchange:'NYSE',score:80,entry_date:'2026-11-11',
   entry_price:'$322.02',current_price:'$322.02',return_pct:'0.00%',
   last_review_date:'2026-11-11',brief_note:'Technical nine-factor review score 80; Google quote time 15:00Z'}],
  interns:[],closed_trades:[],equity_history:[]};
}
test('strict Google Finance cards reject unrelated and unsafe headlines',()=>{
 const html=page([
  card('Assurant shares advance as analyst boosts target','20 hours ago',goodUrl),
  card('Unrelated competitor insurance commentary','20 hours ago','https://example.com/unrelated'),
  card('AIZ injected link','20 hours ago','javascript:alert(1)')
 ]);
 const result=news.parseCards(html,'AIZ');
 assert.equal(result.company,'Assurant');
 assert.equal(result.cards.length,1);
 assert.equal(result.cards[0].url,goodUrl);
 assert.equal(news.safeUrl('http://localhost:8000/private'),null);
 assert.equal(news.safeUrl('https://127.0.0.1/private'),null);
});
test('ET previous-session relative hour is approximate, never a false exact time',()=>{
 const stamp=news.ageEstimate('20 hours ago',now,date);
 assert.ok(stamp);
 assert.match(stamp.label,/Nov 10, 2026/);
 assert.match(stamp.label,/approx\./);
 assert.equal(news.ageEstimate('1 hour ago',now,date),null);
 assert.equal(news.ageEstimate('1 day ago',now,date),null);
});
test('publisher ISO publication metadata wins; invalid article date fails closed',()=>{
 const meta=news.articleMetadata('<meta property="article:published_time" content="2026-11-10T16:05:00-05:00">'+
  '<meta property="og:description" content="Assurant announced an update to its shareholder program.">');
 assert.equal(meta.date,'2026-11-10T21:05:00.000Z');
 assert.match(meta.description,/Assurant/);
 assert.equal(news.articleMetadata('<meta property="article:published_time" content="last Tuesday">').date,null);
});
test('collect uses only matching Google Finance sourced previous-trading-day news',async()=>{
 const html=page([card('Assurant announces latest quarterly update','20 hours ago',goodUrl)]);
 const publisher='<meta property="article:published_time" content="2026-11-10T16:05:00-05:00">'+
  '<meta property="og:description" content="Assurant reported higher sales in its quarterly financial results.">';
 const seen=[];
 const fetcher=async url=>{
  seen.push(url);
  return {ok:true,headers:{get:key=>key==='date'?'Wed, 11 Nov 2026 18:45:00 GMT':null},
   text:async()=>url.includes('google.com/finance/')?html:publisher};
 };
 const items=await news.collect({ticker:'AIZ',exchange:'NYSE',sessionDate:date,now,fetcher});
 assert.equal(items.length,1);
 assert.equal(items[0].time_precision,'exact');
 assert.equal(items[0].published_utc,'2026-11-10T21:05:00.000Z');
 assert.match(items[0].published_et,/Nov 10, 2026/);
 assert.match(items[0].summary,/Assurant reported higher sales/);
 assert.equal(seen.length,2);
 const wrong=async url=>({ok:true,headers:{get:()=>null},
  text:async()=>url.includes('google.com')?html:publisher.replace('2026-11-10','2017-12-05')});
 const older=await news.collect({ticker:'AIZ',exchange:'NYSE',sessionDate:date,now,fetcher:wrong});
 assert.equal(older.length,1);
 assert.equal(older[0].news_is_older,true);
 assert.match(older[0].published_et,/2017/);
});
test('publisher metadata unavailable preserves approximate source label, no fake summary',async()=>{
 const html=page([card('Assurant shares advance Tuesday','20 hours ago',goodUrl)]);
 const items=await news.collect({ticker:'AIZ',exchange:'NYSE',sessionDate:date,now,
  fetcher:async url=>{if(!url.includes('google.com/finance/'))throw Error('publisher blocked');
   return {ok:true,headers:{get:()=>null},text:async()=>html};}});
 assert.equal(items.length,1);
 assert.equal(items[0].time_precision,'approximate');
 assert.equal(items[0].published_utc,null);
 assert.match(items[0].summary,/Assurant shares advance Tuesday/);
});
test('read-only news overlays never mutate frozen data or change between immediate API/page requests',async()=>{
 let clock=new Date(now),calls=0;
 const decorate=news.createCompanyNewsReader({clock:()=>clock,load:async()=>{calls++;return [{
  ticker:'AIZ',summary:'Assurant reported a new corporate development.',
  publisher:'MarketWatch',url:goodUrl,published_et:'Nov 10, 2026, 4:05 PM ET',
  time_precision:'exact',published_utc:'2026-11-10T21:05:00Z'}]}});
 const original=feed(),base={available:true,stale:false,data:original};
 const a=await decorate(base),b=await decorate(base);
 assert.equal(calls,1);
 assert.deepEqual(a.data,b.data);
 assert.deepEqual(original,feed());
 assert.equal(a.data.company_news_session_date,'2026-11-11');
 assert.equal(a.data.active_portfolio[0].brief_note,original.active_portfolio[0].brief_note);
 const html=core.renderSwingLeadersHtml(a.data);
 assert.match(html,/Assurant reported a new corporate development/);
 assert.match(html,/Nov 10, 2026, 4:05 PM ET/);
 assert.match(html,/rel="noopener noreferrer"/);
 assert.doesNotMatch(html,/Technical nine-factor review/);
 assert.doesNotMatch(html,/Reviewed 2026-11-11/);
 const extended=ui.enhanceActivePortfolioTable(html);
 assert.match(extended,/Assurant reported a new corporate development/);
 assert.match(extended,/data-label="Quantity"/);
});
test('no verified news never substitutes old score text; legacy renderer is unchanged',()=>{
 const x=feed();
 x.active_portfolio[0].company_news_status='NO_VERIFIED_NEWS';
 x.active_portfolio[0].company_news_session_date=date;
 x.active_portfolio[0].company_news=[];
 const html=core.renderSwingLeadersHtml(x);
 assert.match(html,/No matching Google Finance company news verified for 2026-11-10/);
 assert.doesNotMatch(html,/Technical nine-factor review/);
 const legacy=core.renderSwingLeadersHtml(feed());
 assert.match(legacy,/Technical nine-factor review/);
 assert.match(legacy,/Reviewed 2026-11-11/);
});
test('latest NYSE session selects today from 09:30 ET and previous session before opening',()=>{
 assert.equal(news.latestNewsSession(new Date('2026-11-11T19:20:00Z')),'2026-11-11');
 assert.equal(news.latestNewsSession(new Date('2026-11-11T14:29:00Z')),'2026-11-10');
 assert.equal(news.latestNewsSession(new Date('2026-11-11T14:30:00Z')),'2026-11-11');
 assert.equal(news.latestNewsSession(new Date('2026-11-11T22:00:00Z')),'2026-11-11');
 assert.equal(news.latestNewsSession(new Date('2026-11-14T17:00:00Z')),'2026-11-13');
 assert.equal(news.latestNewsSession(new Date('2026-11-27T14:29:00Z')),'2026-11-25');
 assert.equal(news.latestNewsSession(new Date('2026-11-27T14:30:00Z')),'2026-11-27');
 assert.equal(news.latestNewsSession(new Date('2026-11-30T17:00:00Z')),'2026-11-30');
});
test('today AIZ Google Finance news includes source and posting time',async()=>{
 const today=new Date('2026-11-11T19:20:00Z'),sessionDate='2026-11-11';
 const html=page([card('Why Assurant (AIZ) Might be Well Poised for a Surge','1 hour ago',
  'https://www.zacks.com/stock/news/3027860/why-assurant-aiz-might-be-well-poised-for-a-surge','Zacks')]);
 const fetcher=async url=>({ok:true,headers:{get:()=>null},text:async()=>url.includes('google.com')?html:
  '<meta property="article:published_time" content="2026-11-11T13:10:00-05:00"><meta name="description" content="Assurant shares gain attention after a new financial update.">'});
 const items=await news.collect({ticker:'AIZ',exchange:'NYSE',sessionDate,now:today,fetcher});
 assert.equal(items.length,1);
 assert.equal(items[0].published_utc,'2026-11-11T18:10:00.000Z');
 assert.match(items[0].published_et,/Nov 11, 2026/);
 assert.match(items[0].summary,/Assurant/);
 const reader=news.createCompanyNewsReader({clock:()=>today,load:async params=>{
  assert.equal(params.sessionDate,'2026-11-11');return items;}});
 const snapshot=await reader({available:true,data:feed()});
 assert.equal(snapshot.data.company_news_session_date,'2026-11-11');
 assert.match(core.renderSwingLeadersHtml(snapshot.data),/Nov 11, 2026/);
});

test('today-first selection excludes older news when matching same-day stories exist',async()=>{
 const today=new Date('2026-11-11T19:20:00Z');
 const todayUrl='https://www.marketwatch.com/aiz-today';
 const oldUrl='https://www.marketwatch.com/aiz-older';
 const html=page([
  card('Assurant announces a new business update','2 hours ago',todayUrl),
  card('Assurant (AIZ) previous news','1 day ago',oldUrl)
 ]);
 const fetcher=async url=>({ok:true,headers:{get:()=>null},text:async()=>url.includes('google.com')?html:''});
 const items=await news.collect({ticker:'AIZ',exchange:'NYSE',sessionDate:'2026-11-11',now:today,fetcher});
 assert.equal(items.length,1);
 assert.equal(items[0].url,todayUrl);
 assert.equal(items[0].news_is_older,false);
});
test('when there is no news today, select latest available older article with clear date label',async()=>{
 const today=new Date('2026-11-11T19:20:00Z');
 const recent='https://www.marketwatch.com/aiz-yesterday',older='https://www.marketwatch.com/aiz-last-week';
 const html=page([
  card('Assurant results from previous session','1 day ago',recent),
  card('Assurant latest corporate announcement','1 week ago',older)
 ]);
 const fetcher=async url=>({ok:true,headers:{get:()=>null},text:async()=>url.includes('google.com')?html:''});
 const items=await news.collect({ticker:'AIZ',exchange:'NYSE',sessionDate:'2026-11-11',now:today,fetcher});
 assert.equal(items.length,2);
 assert.equal(items[0].url,recent);
 assert.equal(items[0].news_is_older,true);
 assert.equal(items[1].url,older);
 assert.match(items[0].published_et,/Google Finance estimate/);
 assert.match(core.renderSwingLeadersHtml({
   ...feed(),
   active_portfolio:[{...feed().active_portfolio[0],
    company_news_status:'READY',company_news_session_date:'2026-11-11',company_news:items}]
 }),/Earlier news/);
});
test('quote provider technical labels are hidden in server HTML but remain in authenticated data',()=>{
 const item={...feed().active_portfolio[0],
   valuation_status:'FRESH_MINUTE_BAR',current_valuation_price:321.74,valuation_return_pct:-0.09,
   unrealized_model_pnl:-8.70,quote_source:'GOOGLE_FINANCE_CHART_1M',
   quote_timestamp_et:'2026-11-11 14:20:00 ET',valuation_price_kind:'COMPLETED_MINUTE_BAR_CLOSE'};
 const html=core.renderSwingLeadersHtml({...feed(),active_portfolio:[item]});
 assert.match(html,/data-label="Current">\$\s*321\.74/);
 assert.match(html,/class="vx-valuation-evidence" hidden/);
 assert.doesNotMatch(html,/FRESH_MINUTE_BAR|GOOGLE_FINANCE_CHART_1M|completed 1-minute close/);
 const script=ui.buildQuoteRefreshScript?ui.buildQuoteRefreshScript():String(ui);
 assert.doesNotMatch(script,/note\.textContent=\(quote\.valuation_status/);
});

function companyPage(ticker,company,cards,padding=''){
 return '<html><head><title>'+company+' ('+ticker+') Stock Price &amp; News - Google Finance</title></head>'+
 '<body><div>News stories</div>'+padding+cards.join('')+
 '<div class="VfPpkd">Show more</div><c-data id="footer"></c-data></body></html>';
}
function rssItem(title,published,publisher='Yahoo Finance'){
 const url='https://news.google.com/rss/articles/CBMiDemo'+title.replace(/[^A-Za-z]/g,'').slice(0,20)+'?oc=5';
 return '<item><title>'+title+'</title><link>'+url+'</link>'+
 '<guid isPermaLink="false">demo</guid><pubDate>'+published+'</pubDate>'+
 '<source url="https://finance.yahoo.com">'+publisher+'</source></item>';
}
test('Google Finance News stories can appear after 40k of related-stock markup',()=>{
 const url='https://www.zacks.com/stock/news/3027749/hst-vs-psa-which-stock-is-the-better-value-option?cid=CS-SYND-FT-fundamental_analysis|yseop_template_3';
 const html=companyPage('PSA','Public Storage',[card('HST vs. PSA: Which Stock Is the Better Value Option?','3 hours ago',url,'Zacks')],' '.repeat(55000));
 const parsed=news.parseCards(html,'PSA');
 assert.equal(parsed.cards.length,1);
 assert.equal(parsed.cards[0].url,url);
});
test('Google News fallback accepts independently dated company headlines, not unrelated market news',()=>{
 const today=new Date('2026-11-11T19:20:00Z');
 const xml='<?xml version="1.0"?><rss version="2.0"><channel>'+
  rssItem('Extra Space Storage (EXR) adds facilities - Yahoo Finance','Wed, 11 Nov 2026 18:18:00 GMT')+
  rssItem('Semiconductor stocks rise broadly - Yahoo Finance','Wed, 11 Nov 2026 19:00:00 GMT')+
  rssItem('Extra Space Storage (EXR) reports earnings - Yahoo Finance','Tue, 10 Nov 2026 16:00:00 GMT')+
  '</channel></rss>';
 const records=news.googleNewsRecords(xml,{ticker:'EXR',company:'Extra Space Storage',sessionDate:'2026-11-11',now:today});
 assert.equal(records.length,1);
 assert.equal(records[0].news_is_older,false);
 assert.equal(records[0].publisher,'Yahoo Finance');
 assert.equal(records[0].news_provider,'GOOGLE_NEWS_RSS');
 assert.equal(records[0].published_utc,'2026-11-11T18:18:00.000Z');
 assert.match(records[0].published_et,/Google News/);
 assert.match(records[0].summary,/Extra Space Storage/);
});
test('Google News fallback returns latest older story with truthful publication date when nothing today',()=>{
 const now=new Date('2026-11-11T19:20:00Z');
 const xml='<rss>'+rssItem('Public Storage (PSA) investor update - Yahoo Finance','Tue, 10 Nov 2026 20:05:00 GMT')+
 rssItem('Public Storage (PSA) sector report - Yahoo Finance','Mon, 09 Nov 2026 12:00:00 GMT')+'</rss>';
 const records=news.googleNewsRecords(xml,{ticker:'PSA',company:'Public Storage',sessionDate:'2026-11-11',now});
 assert.equal(records.length,2);
 assert.equal(records[0].news_is_older,true);
 assert.equal(records[0].published_utc,'2026-11-10T20:05:00.000Z');
 const enriched=core.renderSwingLeadersHtml({...feed(),active_portfolio:[{...feed().active_portfolio[0],company_news_status:'READY',company_news:records}]});
 assert.match(enriched,/Earlier news/);
});
test('Google Finance generic market headlines trigger focused Google News fallback for EXR',async()=>{
 const now=new Date('2026-11-11T19:20:00Z');
 const html=companyPage('EXR','Extra Space Storage',
 [card('S&P 500 advances as technology names rise','2 hours ago','https://www.reuters.com/markets/tech/market-brief')]);
 const rss='<rss>'+rssItem('Extra Space Storage EXR portfolio news - Yahoo Finance','Wed, 11 Nov 2026 17:05:00 GMT')+'</rss>';
 const seen=[];
 const fetcher=async url=>{
  seen.push(url);
  return {ok:true,headers:{get:()=>null},text:async()=>url.includes('news.google.com/rss/search')?rss:html};
 };
 const records=await news.collectWithFallback({ticker:'EXR',exchange:'NYSE',sessionDate:'2026-11-11',now,fetcher});
 assert.equal(records.length,1);
 assert.equal(records[0].news_provider,'GOOGLE_NEWS_RSS');
 assert.match(seen.join(' '),/news.google.com\/rss\/search/);
});
test('Publisher reads are bounded and concurrent to prevent VTRS pending feedback',async()=>{
 const now=new Date('2026-11-11T19:20:00Z');
 const html=companyPage('VTRS','Viatris Inc',[
  card('Viatris announces investor conference','2 hours ago','https://www.marketwatch.com/viatris-a'),
  card('Viatris expands global medicines portfolio','3 hours ago','https://www.marketwatch.com/viatris-b'),
  card('VTRS receives new analyst coverage','4 hours ago','https://www.marketwatch.com/viatris-c')]);
 let active=0,maxActive=0;
 const fetcher=async url=>{
  if(url.includes('google.com/finance'))return {ok:true,headers:{get:()=>null},text:async()=>html};
  active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setTimeout(resolve,70));
  active--;
  return {ok:true,headers:{get:()=>null},text:async()=>'<meta property="article:published_time" content="2026-11-11T12:10:00-05:00">'};
 };
 const records=await news.collect({ticker:'VTRS',exchange:'NASDAQ',sessionDate:'2026-11-11',now,fetcher});
 assert.equal(maxActive,3);
 assert.equal(records.length,2);
 assert.ok(records.every(x=>x.news_is_older===false));
});
