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
 assert.match(html,/FRESH_MINUTE_BAR/);
 assert.match(html,/completed 1-minute close/);
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
 assert.match(html,/UNAVAILABLE/);
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
