'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const news=require('../lib/swing-company-news');
const core=require('../lib/swing-leaders-core');
const {localizeRussianHtml}=require('../website_russian_localization');
const now=new Date('2026-11-11T18:00:00Z');
const fixture=()=>({
 snapshot_date:'2026-11-11',snapshot_time_et:'10:01 ET',
 market_posture:'Research/model review',active_count:2,intern_count:0,cash_pct:'80%',
 quote_source:'GOOGLEFINANCE',quote_delay_notice:'Quotes delayed',
 research_disclaimer:'Research only',valuation_read_only:true,valuation_coverage:2,
 active_portfolio:[
 {ticker:'AIZ',exchange:'NYSE',score:80,entry_date:'2026-11-11',
 entry_price:'$322.02',current_price:'$322.02',return_pct:'0.00%',
 current_valuation_price:321.17,valuation_return_pct:-0.26,
 valuation_status:'FRESH_MINUTE_BAR',unrealized_model_pnl:-26.39,
 quote_source:'GOOGLE_FINANCE_CHART_1M',quote_timestamp_et:'2026-11-11 12:59:00 ET',
 valuation_price_kind:'COMPLETED_MINUTE_BAR_CLOSE',
 last_review_date:'2026-11-11',brief_note:'SECRET MORNING QUANT REVIEW'},
 {ticker:'VTRS',exchange:'NASDAQ',score:80,entry_date:'2026-11-11',
 entry_price:'$20.82',current_price:'$20.82',return_pct:'0.00%',
 current_valuation_price:21.02,valuation_return_pct:0.96,
 valuation_status:'FRESH_MINUTE_BAR',unrealized_model_pnl:96.06,
 quote_source:'GOOGLE_FINANCE_CHART_1M',quote_timestamp_et:'2026-11-11 12:59:00 ET',
 valuation_price_kind:'COMPLETED_MINUTE_BAR_CLOSE',
 last_review_date:'2026-11-11',brief_note:'SECRET MORNING QUANT REVIEW'}],
 interns:[],closed_trades:[],equity_history:[]
});
const item=(title,pubDate,url='https://news.google.com/rss/articles/CBMiAXY')=>
 '<item><title>'+title+'</title><link>'+url+'</link><pubDate>'+pubDate+
 '</pubDate><source>MarketWatch</source></item>';
const xml=(...items)=>'<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>'+items.join('')+'</channel></rss>';
test('today trading day, preopen yesterday, weekend previous Friday',()=>{
 assert.equal(news.tradingDay(now),'2026-11-11');
 assert.equal(news.tradingDay(new Date('2026-11-11T13:00:00Z')),'2026-11-10');
 assert.equal(news.tradingDay(new Date('2026-11-14T18:00:00Z')),'2026-11-13');
});
test('RSS selects only ticker-relevant, dated, exact Google News source items',()=>{
 const value=xml(
 item('Assurant raises annual outlook - MarketWatch','Wed, 11 Nov 2026 17:39:00 GMT'),
 item('Unrelated bank raises earnings - MarketWatch','Wed, 11 Nov 2026 17:40:00 GMT','https://news.google.com/rss/articles/CBMiYXY'),
 item('Assurant yesterday update - MarketWatch','Tue, 10 Nov 2026 17:39:00 GMT','https://news.google.com/rss/articles/CBMiXXX'),
 item('Assurant tomorrow future - MarketWatch','Wed, 11 Nov 2026 20:39:00 GMT','https://news.google.com/rss/articles/CBMiXXY'),
 item('Assurant spoofed link - MarketWatch','Wed, 11 Nov 2026 17:40:00 GMT','https://other.example/articles/CBMiXXX')
 );
 const parsed=news.parseRss(value,{ticker:'AIZ',company:'Assurant',date:'2026-11-11',now});
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].summary,'Assurant raises annual outlook');
 assert.equal(parsed[0].published_at,'2026-11-11T17:39:00.000Z');
 assert.equal(parsed[0].published_at_et,'2026-11-11 12:39:00 ET');
 assert.throws(()=>news.parseRss('<html/>',{ticker:'AIZ',company:'Assurant',date:'2026-11-11',now}),/RSS_INVALID/);
});
test('all positions receive company news and original morning research remains byte-identical',async()=>{
 let count=0,base={available:true,stale:false,data:fixture()};
 const provider=async({ticker,date})=>{count++;
  return {day:date,status:ticker==='AIZ'?'VERIFIED':'NO_ARTICLES',source:'Google News',
   articles:ticker==='AIZ'?[{summary:'Assurant raises annual outlook',
    published_at:'2026-11-11T17:39:00.000Z',published_at_et:'2026-11-11 12:39:00 ET',
    source:'MarketWatch',url:'https://news.google.com/rss/articles/CBMiAXY'}]:[]};
 };
 const decorate=news.createCompanyNewsReader({clock:()=>now,provider});
 const a=await decorate(base),b=await decorate(base);
 assert.equal(count,2);
 assert.equal(a.data.active_portfolio[0].brief_note,'SECRET MORNING QUANT REVIEW');
 assert.deepEqual(base.data,fixture());
 assert.deepEqual(a.data,b.data);
 const html=core.renderSwingLeadersHtml(a.data);
 assert.match(html,/Company News \(Last Trading Day\)/);
 assert.match(html,/Assurant raises annual outlook/);
 assert.match(html,/Posted 2026-11-11 12:39:00 ET/);
 assert.match(html,/No verified company news published for 2026-11-11/);
 assert.doesNotMatch(html,/SECRET MORNING QUANT REVIEW/);
 assert.doesNotMatch(html,/nine-factor quantitative review scored/);
 const ru=localizeRussianHtml(html,'/trading-systems/swing-trading');
 assert.match(ru,/2026-11-11 12:39:00 ET/);
 assert.match(ru,/news.google.com\/rss\/articles/);
});
test('upstream unavailable never invents news, timestamps, or old research commentary',async()=>{
 const decorate=news.createCompanyNewsReader({clock:()=>now,provider:async()=>{throw Error('403')}});
 const result=await decorate({available:true,stale:false,data:fixture()});
 assert.equal(result.data.active_portfolio[0].company_news.status,'UNAVAILABLE');
 const html=core.renderSwingLeadersHtml(result.data);
 assert.match(html,/News temporarily unavailable/);
 assert.doesNotMatch(html,/SECRET MORNING QUANT REVIEW/);
});
