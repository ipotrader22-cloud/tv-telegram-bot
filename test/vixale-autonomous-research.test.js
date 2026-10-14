'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {annotationUrls}=require('../scripts/vixale-news-evidence');
const {articlePage,hostAllowed}=require('../scripts/vixale-article-verifier');
const {contextGate,validate}=require('../scripts/vixale-research-score-gate');
const {FACTORS,CAPS}=require('../scripts/vixale-review-evidence-gate');
const date='2026-10-14',prev='2026-10-13';
function setup(){
 const mk=ticker=>({metrics:{symbol:ticker,quoteDate:date,lastCompleteDate:prev,
  dailyBars:250,price:100,sma20:95,sma50:90,sma200:80,
  return20Pct:12,return60Pct:30,lastCompleteRelativeVolume:1.1}});
 const symbols=['PLTR','SPY','QQQ','SMH','XLK','XLE'];
 const research={gate:'RESEARCH_INPUTS',result:'PASS',date,data:symbols.map(mk)};
 const row={ticker:'PLTR',entryPrice:90,score:75,reviewDate:prev};
 const snapshot={openPositions:[{...row,status:'Active Portfolio',entryDate:'2026-10-08',entryScore:80}],
  portfolio:[{...row,status:'Active Portfolio'}],publicActive:[row],candidates:[],
  closedTrades:[],formulas:{cashPct:true,closedSpill:true,equityHistoryProtected:true}};
 const url='https://www.reuters.com/markets/verified';
 const news={PLTR:[{url,publishedDate:date,excerpt:'An independent, dated company announcement supported by a verified article.',verified:true}]};
 return {date,research,snapshot,news,url};
}
test('citations exclude non-HTTPS and duplicates',()=>{
 const x=annotationUrls({output:[{content:[{annotations:[{type:'url_citation',url:'https://www.reuters.com/a'},
  {type:'url_citation',url:'https://www.reuters.com/a'},{type:'url_citation',url:'http://localhost/'}]}]}]});
 assert.deepEqual(x,['https://www.reuters.com/a']);
});
test('publisher allowlist rejects attacker-controlled lookalikes',()=>{
 assert.equal(hostAllowed('https://www.reuters.com/a'),true);
 assert.equal(hostAllowed('https://reuters.com.evil.com/a'),false);
 assert.equal(hostAllowed('http://www.reuters.com/a'),false);
});
test('publisher date requires independently fetched metadata',()=>{
 const html='<meta property="article:published_time" content="2026-10-14T10:00:00Z">'+
 '<meta property="og:description" content="A published company report states an independently dated result with sufficient detail to review.">';
 const x=articlePage(html,'https://www.reuters.com/a',date,prev);
 assert.equal(x.verified,true);assert.equal(x.publishedDate,date);
 assert.throws(()=>articlePage(html,'https://www.reuters.com/a','2026-10-12','2026-10-09'),/publication date/);
});
test('benchmarks and per-stock fresh daily metrics are required',()=>{
 const x=setup();
 assert.equal(contextGate(x).symbols[0],'PLTR');
 x.research.data=x.research.data.filter(z=>z.metrics.symbol!=='SPY');
 assert.throws(()=>contextGate(x),/Missing benchmark SPY/);
});
test('no news blocks proposed scores',()=>{
 const x=setup();x.news.PLTR=[];
 assert.throws(()=>contextGate(x),/news missing/);
});
test('fake sources block full review even with all scores',()=>{
 const x=setup(),factors=Object.fromEntries(FACTORS.map(n=>[n,CAPS[n]]));
 const evidence=Object.fromEntries(FACTORS.map(n=>[n,{asOfDate:date,sources:['https://false.example/x'],
  rationale:'A sufficiently long rationale from dated information'}]));
 assert.throws(()=>validate(x,{reviews:[{ticker:'PLTR',reviewDate:date,score:100,factors,evidence}]}),
   /Unverified evidence/);
});
test('all nine weighted points validated against immutable lot and feed membership',()=>{
 const x=setup(),factors=Object.fromEntries(FACTORS.map(n=>[n,CAPS[n]]));
 const evidence=Object.fromEntries(FACTORS.map(n=>[n,{asOfDate:date,sources:[x.url],
  rationale:'Dated evidence substantiates the component scoring judgment'}]));
 const out=validate(x,{reviews:[{ticker:'PLTR',reviewDate:date,score:100,factors,evidence}]});
 assert.equal(out.reviews[0].score,100);assert.equal(out.reviews[0].marketEvidence.relativePerformance,0);
 assert.equal(out.status,'RESEARCH_ONLY');
});

test('recent dated company facts may predate prior NYSE session, never older than seven days',()=>{
 const x=setup();x.news.PLTR[0].publishedDate='2026-10-09';
 assert.equal(contextGate(x).symbols[0],'PLTR');
 x.news.PLTR[0].publishedDate='2026-09-01';
 assert.throws(()=>contextGate(x),/news missing/);
});

test('OpenAI search is restricted to verified publisher domains',async()=>{
 const {getNews}=require('../scripts/vixale-news-evidence');
 let args;
 const request=async(url,requestArgs)=>{
  args=JSON.parse(requestArgs.body);
  return {ok:true,json:async()=>({status:'completed',output:[
   {type:'web_search_call',id:'test'},
   {type:'message',content:[{type:'output_text',text:'A dated and published corporate news source is available for this company and its latest position.',
     annotations:[{type:'url_citation',url:'https://investors.ao-inc.com/news/press'}]}]}]})};
 };
 const result=await getNews({ticker:'AAOI',date:'2026-10-14',key:'TEST_ONLY',request});
 assert.ok(args.tools[0].filters.allowed_domains.includes('ao-inc.com'));
 assert.ok(!args.tools[0].filters.allowed_domains.includes('6ix.com'));
 assert.ok(args.input.includes('Applied Optoelectronics'));
 assert.equal(result.urls.length,1);
});

test('web research has adequate token budget and fails closed on incomplete response',async()=>{
 const {getNews}=require('../scripts/vixale-news-evidence');
 let payload;
 await assert.rejects(
   ()=>getNews({ticker:'AAOI',date:'2026-10-14',key:'TEST_ONLY',
     request:async (url,args)=>{
       payload=JSON.parse(args.body);
       return {ok:true,json:async()=>({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]})};
     }}),
   /status=incomplete reason=max_output_tokens/);
 assert.ok(payload.max_output_tokens>=1600);
});

test('missing publisher date is a controlled rejection, not a runtime crash',()=>{
 const html='<meta property="og:description" content="A relevant business announcement with enough contextual information to audit the publication.">';
 assert.throws(()=>articlePage(html,'https://www.reuters.com/a','2026-10-14','2026-09-14'),/Publisher date metadata missing/);
});

test('publisher date variants are accepted only when source page supplies them',()=>{
 const description='Verified source text describing a company development with enough information to justify evidence handling.';
 for(const property of ['publication_date','dc.date.issued','parsely-pub-date','sailthru.date']){
   const html='<meta name="'+property+'" content="2026-10-12T10:30:00Z">'+
      '<meta name="description" content="'+description+'">';
   const r=articlePage(html,'https://www.reuters.com/test','2026-10-14','2026-09-14');
   assert.equal(r.publishedDate,'2026-10-12');
 }
});
