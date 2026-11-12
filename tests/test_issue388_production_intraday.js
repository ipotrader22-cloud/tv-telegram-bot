'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const valuation=require('../lib/swing-intraday-valuation');
const core=require('../lib/swing-leaders-core');
const swing=require('../lib/swing-leaders');
const page=require('../website_swing_active_model_pnl');
const at=new Date('2026-11-11T17:00:00Z'); // 12:00 ET, regular NYSE.
const feed=()=>({snapshot_date:'2026-11-11',snapshot_time_et:'10:01 ET',
 market_posture:'Research model review',active_count:2,intern_count:0,cash_pct:'80%',
 quote_source:'GOOGLEFINANCE',quote_delay_notice:'Indicative delayed quotes',
 research_disclaimer:'Research only',active_portfolio:[
 {ticker:'AIZ',exchange:'NYSE',score:80,entry_date:'2026-11-11',entry_price:'$322.02',current_price:'$322.02',return_pct:'0.00%',last_review_date:'2026-11-11',brief_note:'Decision frozen'},
 {ticker:'VTRS',exchange:'NASDAQ',score:80,entry_date:'2026-11-11',entry_price:'$20.82',current_price:'$20.82',return_pct:'0.00%',last_review_date:'2026-11-11',brief_note:'Decision frozen'}],
 interns:[],closed_trades:[],equity_history:[]});
const quote=(ticker,price,ts,kind='DELAYED_LAST_QUOTE')=>({ticker,price,timestamp:ts,source:kind==='DELAYED_LAST_QUOTE'?'GOOGLEFINANCE':valuation.CHART_SOURCE,kind,delayMinutes:kind==='DELAYED_LAST_QUOTE'?0:null});
function grid(){
 const str=x=>({effectiveValue:{stringValue:x}}),num=x=>({effectiveValue:{numberValue:x}});
 const make=(row,symbol,price,time)=>[
 str(symbol),
 {...num(price),userEnteredValue:{formulaValue:'=IFERROR(GOOGLEFINANCE(A'+row+',"price"),"")'}},
 {...str(time),userEnteredValue:{formulaValue:'=IFERROR(TEXT(GOOGLEFINANCE(A'+row+',"tradetime"),"yyyy-mm-dd hh:mm:ss"),"")'}},
 {...num(0),userEnteredValue:{formulaValue:'=IFERROR(GOOGLEFINANCE(A'+row+',"datadelay"),"")'}},
 {...num(10000),userEnteredValue:{formulaValue:'=IFERROR(GOOGLEFINANCE(A'+row+',"volume"),"")'}}
 ];
 return {data:{spreadsheetId:valuation.ENGINE2_ID,properties:{timeZone:'America/New_York'},
 sheets:[{properties:{sheetId:valuation.GRID_ID,title:'Engine 2 Quotes'},
 data:[{startRow:0,startColumn:0,rowData:[{}, {values:make(2,'NYSE:AIZ',320.41,'2026-11-11 11:59:00')},
 {values:make(3,'NASDAQ:VTRS',20.94,'2026-11-11 11:59:30')}]}]}]}};
}
test('read-only strict Sheet quote identities, formula provenance and timestamps',async()=>{
 const d=grid(),requests=[];
 const sheets={spreadsheets:{get:async req=>{requests.push(req);return d}}};
 const q=await valuation.readGoogleSheet({sheets,positions:feed().active_portfolio,now:at});
 assert.equal(requests.length,1);
 assert.equal(requests[0].spreadsheetId,valuation.ENGINE2_ID);
 assert.equal(q.length,2);
 assert.equal(q[0].timestamp,'2026-11-11T16:59:00.000Z');
 assert.equal(q[0].price,320.41);
 assert.equal(q[1].timestamp,'2026-11-11T16:59:30.000Z');
 const invalid=grid();
 invalid.data.sheets[0].data[0].rowData[1].values[1].userEnteredValue.formulaValue='=320.41';
 await assert.rejects(()=>valuation.readGoogleSheet({sheets:{spreadsheets:{get:async()=>invalid}},positions:feed().active_portfolio,now:at}),/FORMULA_MISMATCH/);
});
test('source ET conversion is DST-aware and rejects malformed/future dates',()=>{
 assert.equal(valuation.sourceTime('2026-11-11 12:00:00'),'2026-11-11T17:00:00.000Z');
 assert.equal(valuation.sourceTime('2026-06-11 12:00:00'),'2026-06-11T16:00:00.000Z');
 assert.throws(()=>valuation.sourceTime('2026-11-11 12:99:00'));
 assert.equal(valuation.market(new Date('2026-11-14T17:00:00Z')).open,false);
});
test('AIZ and VTRS valuation PnL use $10k normalized, without changing morning reference',()=>{
 const original=feed();
 const valued=valuation.project(original,[
 quote('AIZ',320.41,'2026-11-11T16:59:00Z'),
 quote('VTRS',20.94,'2026-11-11T16:59:30Z','COMPLETED_MINUTE_BAR_CLOSE')],at);
 assert.deepEqual(original,feed());
 assert.equal(valued.active_portfolio[0].current_price,'$322.02');
 assert.equal(valued.active_portfolio[0].morning_reference_price,'$322.02');
 assert.equal(valued.active_portfolio[1].valuation_status,'FRESH_MINUTE_BAR');
 assert.ok(Math.abs(valued.active_portfolio[0].unrealized_model_pnl-10000*(320.41/322.02-1))<1e-8);
 assert.ok(Math.abs(valued.active_portfolio[1].unrealized_model_pnl-10000*(20.94/20.82-1))<1e-8);
 assert.equal(core.addDisplayMetrics(valued).active_unrealized_model_pnl,valued.active_unrealized_model_pnl);
 const html=core.renderSwingLeadersHtml(valued);
 assert.doesNotMatch(html,/FRESH_MINUTE_BAR|GOOGLE_FINANCE_CHART_1M|completed 1-minute close/);
 assert.match(html,/vx-valuation-evidence" hidden/);
 assert.match(html,/Morning|morning/);
 assert.match(html,/20\.94/);
});
test('stale/missing quote never presents morning zero PnL as fresh',()=>{
 const projected=valuation.project(feed(),[quote('AIZ',320.41,'2026-11-11T16:59:00Z')],at);
 assert.equal(projected.active_portfolio[1].current_valuation_price,null);
 assert.equal(projected.active_unrealized_model_pnl,null);
 assert.equal(projected.valuation_status,'PARTIAL');
 assert.equal(core.addDisplayMetrics(projected).active_unrealized_model_pnl,null);
 const html=core.renderSwingLeadersHtml(projected);
 assert.match(html,/Some quotes are unavailable/);
 assert.doesNotMatch(html,/UNAVAILABLE ·|FRESH_MINUTE_BAR/);
 assert.match(html,/data-label="Current">—/);
 assert.match(html,/Unrealized Model P&amp;L<\/small><strong class="flat">—<\/strong>/);
 const enhanced=page.enhanceActivePortfolioTable(html);
 assert.match(enhanced,/data-label="Quantity"/);
 assert.match(enhanced,/data-label="P&L, \$" class="vx-model-open-pnl flat">—<\/td>/);
 assert.doesNotMatch(enhanced,/\$0\.00<\/td><td data-label="Return"/);
});
test('chart parser validates exact exchange, ignores future candle, uses completed minute only',async()=>{
 const series=[];
 series[0]=['VTRS','NASDAQ'];series[8]=60;
 series[3]=[[null,null,[
 [20.8,20.9,21.0,20.7,'2026-11-11T16:58:00Z',1000],
 [20.9,999,999,20.8,'2026-11-11T17:00:00Z',1000]
 ]]];
 const raw=JSON.stringify([['wrb.fr',null,JSON.stringify([[series]])]]);
 const fetcher=async()=>({ok:true,status:200,text:async()=>raw});
 const q=await valuation.chartMinuteQuote({ticker:'VTRS',exchange:'NASDAQ',now:at,fetcher});
 assert.equal(q.price,20.9);
 assert.equal(q.timestamp,'2026-11-11T16:59:00.000Z');
 assert.equal(q.kind,'COMPLETED_MINUTE_BAR_CLOSE');
 assert.equal(q.delayMinutes,null);
 assert.match(q.sourceHash,/^[a-f0-9]{64}$/);
 await assert.rejects(()=>valuation.chartMinuteQuote({ticker:'VTRS',exchange:'NYSE',now:at,fetcher}),/SERIES_UNVERIFIED/);
});
test('reader batches quotes and caches bounded access; unknown/failing evidence stays unavailable',async()=>{
 let reads=0,clock=new Date(at),fail=false;
 const sheets={spreadsheets:{get:async()=>{reads++;if(fail)throw Error('429');return grid()}}};
 const deco=valuation.createIntradayValuation({getSheetsClient:async()=>sheets,clock:()=>clock,chart:async()=>null});
 const base={available:true,stale:false,data:feed()};
 const one=await deco(base),two=await deco(base);
 assert.equal(reads,1);assert.equal(one.data.valuation_coverage,2);
 assert.deepEqual(one.data.active_portfolio,two.data.active_portfolio);
 fail=true;clock=new Date('2026-11-11T17:21:00Z');
 const after=await deco(base);
 assert.equal(after.data.valuation_coverage,0);
 assert.equal(after.data.active_unrealized_model_pnl,null);
 assert.equal(base.data.active_portfolio[0].current_price,'$322.02');
});
test('legacy/explicit different source stays unchanged',()=>{
 const legacy=swing.createSwingLeadersService({getSheetsClient:async()=>({}),spreadsheetId:core.SWING_LEADERS_SPREADSHEET_ID,serviceClock:()=>at});
 assert.equal(typeof legacy.getSnapshot,'function');
 assert.equal(swing.selectedSpreadsheet({VIXALE_SWING_SOURCE:'LEGACY'}),core.SWING_LEADERS_SPREADSHEET_ID);
 assert.equal(swing.selectedSpreadsheet({VIXALE_SWING_SOURCE:'ENGINE2'}),valuation.ENGINE2_ID);
});

test('stale cached Google quote retains original evidence but never supplies current valuation or profit',async()=>{
 let clock=new Date('2026-11-11T17:00:00Z'),reads=0;
 const sheets={spreadsheets:{get:async()=>{reads++;if(reads>1)throw Error('429');return grid()}}};
 const base={available:true,stale:false,data:feed()};
 const decorate=valuation.createIntradayValuation({getSheetsClient:async()=>sheets,clock:()=>clock,chart:async()=>null});
 const first=await decorate(base);assert.equal(first.data.valuation_coverage,2);
 clock=new Date('2026-11-11T17:25:00Z');
 const stale=await decorate(base);
 assert.equal(stale.data.valuation_coverage,0);
 assert.equal(stale.data.valuation_status,'UNAVAILABLE_OR_STALE');
 assert.equal(stale.data.active_unrealized_model_pnl,null);
 assert.equal(stale.data.active_portfolio[0].valuation_status,'STALE');
 assert.equal(stale.data.active_portfolio[0].current_valuation_price,null);
 assert.equal(stale.data.active_portfolio[0].last_known_valuation_price,320.41);
 assert.equal(stale.data.active_portfolio[0].quote_timestamp_et,'2026-11-11 11:59:00 ET');
 const html=page.enhanceActivePortfolioTable(core.renderSwingLeadersHtml(stale.data));
 assert.doesNotMatch(html,/STALE ·/);
 assert.match(html,/data-label="Current">—/);
 assert.match(html,/data-label="P&L, \$" class="vx-model-open-pnl flat">—/);
 assert.equal(base.data.active_portfolio[0].current_price,'$322.02');
});

test('closed-session reader recovers final quotes on cold start without sheet writes',async()=>{
 const evening=new Date('2026-11-12T00:10:00Z'),d=grid();
 const rows=d.data.sheets[0].data[0].rowData;
 rows[1].values[2].effectiveValue.stringValue='2026-11-11 16:00:00';
 rows[2].values[2].effectiveValue.stringValue='2026-11-11 15:59:30';
 let reads=0;
 const sheets={spreadsheets:{get:async()=>{reads++;return d}}};
 const decorate=valuation.createIntradayValuation({getSheetsClient:async()=>sheets,clock:()=>evening,
  chart:async()=>{throw Error('unexpected chart call')},logger:{info(){}}});
 const base={available:true,data:feed()},original=JSON.stringify(base);
 const out=(await decorate(base)).data;
 assert.equal(out.valuation_status,'LAST_SESSION_VALUATION');
 assert.equal(out.valuation_coverage,2);
 assert.equal(out.active_unrealized_model_pnl,7.64);
 assert.equal(out.active_portfolio[0].valuation_status,'LAST_SESSION_QUOTE');
 assert.equal(out.active_portfolio[0].quote_timestamp_et,'2026-11-11 16:00:00 ET');
 assert.equal(core.addDisplayMetrics(out).active_unrealized_model_pnl,7.64);
 const html=page.enhanceActivePortfolioTable(core.renderSwingLeadersHtml(out));
 assert.match(html,/Market closed\. Last regular-session valuation:/);
 assert.match(html,/2026-11-11 16:00:00 ET/);
 assert.match(html,/data-label="Current">\$320\.41/);
 assert.match(html,/\+\$7\.64/);
 const ru=require('../website_russian_localization').localizeRussianHtml(html,'/trading-systems/swing-trading');
 assert.match(ru,/Рынок закрыт\. Последняя оценка основной сессии:/);
 await decorate(base);assert.equal(reads,1);
 assert.equal(JSON.stringify(base),original);
});
test('closed-session admission rejects old, midday, future and extended-hours marks',()=>{
 const evening=new Date('2026-11-12T00:10:00Z');
 for(const ts of ['2026-11-10T21:00:00Z','2026-11-11T18:00:00Z','2026-11-11T21:01:00Z','2026-11-12T21:00:00Z']){
  assert.equal(valuation.quoteUsable(quote('AIZ',323,ts),evening),false,ts);
 }
 assert.equal(valuation.quoteUsable(quote('AIZ',323,'2026-11-11T21:00:00Z'),evening),true);
 assert.equal(valuation.quoteUsable(quote('AIZ',323,'2026-11-11T20:40:00Z'),evening),true);
 assert.equal(valuation.quoteUsable(quote('AIZ',323,'2026-11-11T20:39:59Z'),evening),false);
 const partial=valuation.project(feed(),[quote('AIZ',323,'2026-11-11T21:00:00Z')],evening);
 assert.equal(partial.valuation_coverage,1);assert.equal(partial.active_unrealized_model_pnl,null);
 const newerLot=feed();newerLot.active_portfolio[0].entry_date='2026-11-12';
 assert.equal(valuation.project(newerLot,[quote('AIZ',323,'2026-11-11T21:00:00Z')],evening).valuation_coverage,0);
});
test('previous session handles overnight, weekends, holidays, DST and early close',()=>{
 for(const [now,day,close] of [
  ['2026-11-12T13:00:00Z','2026-11-11',960],
  ['2026-11-14T17:00:00Z','2026-11-13',960],
  ['2026-11-26T17:00:00Z','2026-11-25',960],
  ['2026-11-27T18:00:00Z','2026-11-27',780],
  ['2026-11-30T13:00:00Z','2026-11-27',780],
  ['2026-11-01T17:00:00Z','2026-10-30',960]]){
  const context=valuation.valuationSession(new Date(now));
  assert.equal(context.day,day);assert.equal(context.close,close);assert.equal(context.open,false);
 }
 assert.equal(new Date(valuation.valuationSession(new Date('2026-11-01T17:00:00Z')).closeTime).toISOString(),'2026-10-30T20:00:00.000Z');
 const final=quote('AIZ',323,'2026-11-11T21:00:00Z');
 assert.equal(valuation.quoteUsable(final,new Date('2026-11-12T14:29:59Z')),true);
 assert.equal(valuation.quoteUsable(final,new Date('2026-11-12T14:30:00Z')),false);
});
test('chart recovery selects final completed RTH minute, excludes after hours and earlier session',async()=>{
 const series=[];series[0]=['AIZ','NYSE'];series[8]=60;
 series[3]=[[null,null,[
  [320,321,322,319,'2026-11-10T20:59:00Z',100],
  [320,323,324,319,'2026-11-11T20:59:00Z',100],
  [320,999,999,319,'2026-11-11T21:00:00Z',100]
 ]]];
 const raw=JSON.stringify([['wrb.fr',null,JSON.stringify([[series]])]]);
 let requestBody;
 const fetcher=async(_url,options)=>{requestBody=options.body.toString();return {ok:true,status:200,text:async()=>raw}};
 const q=await valuation.chartMinuteQuote({ticker:'AIZ',exchange:'NYSE',now:new Date('2026-11-12T00:10:00Z'),fetcher});
 assert.equal(q.price,323);assert.equal(q.timestamp,'2026-11-11T21:00:00.000Z');
 assert.match(decodeURIComponent(requestBody),/2026,11,11/);
 const early=structuredClone(series);early[3][0][2]=[
  [320,325,326,319,'2026-11-27T17:59:00Z',100],
  [320,999,999,319,'2026-11-27T18:00:00Z',100]];
 const q2=await valuation.chartMinuteQuote({ticker:'AIZ',exchange:'NYSE',now:new Date('2026-11-27T23:00:00Z'),
  fetcher:async()=>({ok:true,status:200,text:async()=>JSON.stringify([['wrb.fr',null,JSON.stringify([[early]])]])})});
 assert.equal(q2.price,325);assert.equal(q2.timestamp,'2026-11-27T18:00:00.000Z');
});
test('cold restart uses chart when Sheets fails; next opening never reuses prior close',async()=>{
 let now=new Date('2026-11-12T00:10:00Z'),calls=0;
 const decorate=valuation.createIntradayValuation({getSheetsClient:async()=>{throw Error('Sheets unavailable')},
  clock:()=>now,logger:{info(){}},chart:async({ticker})=>{calls++;return quote(ticker,330,'2026-11-11T21:00:00Z','COMPLETED_MINUTE_BAR_CLOSE')}});
 const base={available:true,data:feed()};
 const out=(await decorate(base)).data;
 assert.equal(out.valuation_coverage,2);assert.equal(calls,2);
 now=new Date('2026-11-12T14:30:00Z');
 const reopened=(await decorate(base)).data;
 assert.equal(reopened.valuation_coverage,0);assert.equal(reopened.active_unrealized_model_pnl,null);
 assert.equal(reopened.valuation_market_open,true);
});
test('server row dollars keep sub-cent source precision and equal API after refresh',()=>{
 const valued=valuation.project(feed(),[quote('AIZ',323.265,'2026-11-11T21:00:00Z')],new Date('2026-11-12T00:10:00Z'));
 const html=page.enhanceActivePortfolioTable(core.renderSwingLeadersHtml(valued));
 const expected=(10000*(323.265/322.02-1)).toFixed(2);
 assert.match(html,new RegExp('class="vx-model-open-pnl gain">\\+\\$'+expected.replace('.','\\.')+'<'));
});
test('closing bell retains eligible confirmed marks if both providers temporarily fail',async()=>{
 let now=new Date('2026-11-11T20:59:30Z'),fail=false;
 const d=grid();for(const row of d.data.sheets[0].data[0].rowData.slice(1))
  row.values[2].effectiveValue.stringValue='2026-11-11 15:59:00';
 const decorate=valuation.createIntradayValuation({clock:()=>now,logger:{info(){}},
  getSheetsClient:async()=>{if(fail)throw Error('temporary');return {spreadsheets:{get:async()=>d}}},
  chart:async()=>null});
 const base={available:true,data:feed()};
 assert.equal((await decorate(base)).data.valuation_coverage,2);
 fail=true;now=new Date('2026-11-11T21:00:00Z');
 const out=(await decorate(base)).data;
 assert.equal(out.valuation_coverage,2);assert.equal(out.valuation_status,'LAST_SESSION_VALUATION');
 assert.equal(out.active_unrealized_model_pnl,7.64);
 now=new Date('2026-11-12T14:30:00Z');
 assert.equal((await decorate(base)).data.valuation_coverage,0);
});
