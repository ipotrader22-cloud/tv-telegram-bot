'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {injectQuoteRefreshScript}=require('../website_swing_active_model_pnl');
const {localizeRussianHtml}=require('../website_russian_localization');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function node(text='') {return {textContent:text,hidden:false,classList:{add(){},remove(){}},appendChild(){}}}
for(const lang of ['en','ru'])test(lang+' rendered script executes startup, interval, close/open transitions and failure clearing',async()=>{
 let payload={valuation_read_only:true,valuation_market_open:true,valuation_coverage:1,active_count:1,
  active_unrealized_model_pnl:100,closed_realized_model_pnl:20,active_portfolio:[{
   ticker:'AIZ',entry_price:'$100.00',current_valuation_price:101,valuation_return_pct:1,
   unrealized_model_pnl:100,valuation_status:'FRESH_DELAYED',quote_timestamp_et:'2026-11-11 15:59:00 ET'}]};
 const current=node(),pnl=node(),ret=node(),metric=node(),notice=node(),total=node();
 const row={dataset:{vxModelEntryPrice:'100'},querySelector(s){return {
  'td[data-label="Ticker"] strong':node('AIZ'),'td[data-label="Current"]':current,
  'td[data-label="P&L, $"]':pnl,'td[data-label="Return"]':ret}[s]||null}};
 const section={dataset:{},querySelectorAll(){return [row]},querySelector(s){return {
  '.vx-valuation-evidence':node(),'.section-metric strong':metric,'.vx-valuation-notice':notice}[s]||null}};
 const document={documentElement:{lang},visibilityState:'visible',readyState:'complete',
  getElementById(){return {closest(){return section}}},
  querySelector(s){return s==='.vx-current-model-pnl'?total:null},createElement:()=>node(),addEventListener(){}};
 let tick,requests=0,failed=false;
 const html=injectQuoteRefreshScript('<html><head></head><body></body></html>');
 const localized=lang==='ru'?localizeRussianHtml(html,'/trading-systems/swing-trading'):html;
 const script=localized.match(/<script id="vx-swing-active-quote-refresh-script">([\s\S]*?)<\/script>/)[1];
 // These regex/string literals were previously corrupted by the outer template.
 assert.match(script,/match\(\/\^\(\\d\{4\}/);
 assert.ok(script.includes('.split(/\\s+/)'));
 assert.ok(script.includes('.split("\\n")'));
 const context={document,window:{setInterval(fn,ms){assert.equal(ms,60000);tick=fn;return 1}},URL,
  fetch:async(url,opts)=>{requests++;assert.equal(url,'/api/swing-leaders');assert.equal(opts.cache,'no-store');
   return {ok:!failed,json:async()=>payload}}};
 new vm.Script(script).runInNewContext(context);await flush();
 assert.equal(requests,1);assert.equal(typeof tick,'function');
 assert.equal(current.textContent,'$101.00');assert.equal(pnl.textContent,'+$100.00');assert.equal(metric.textContent,'+$100.00');
 payload={...payload,valuation_market_open:false,valuation_session_date:'2026-11-11',active_unrealized_model_pnl:200,
  active_portfolio:[{...payload.active_portfolio[0],current_valuation_price:102,valuation_return_pct:2,
   unrealized_model_pnl:200,valuation_status:'LAST_SESSION_QUOTE'}]};
 tick();await flush();assert.equal(requests,2);
 assert.equal(current.textContent,'$102.00');assert.equal(pnl.textContent,'+$200.00');assert.equal(total.textContent,'+$220.00');
 assert.match(notice.textContent,lang==='ru'?/Рынок закрыт/:/Market closed/);
 assert.match(notice.textContent,/2026-11-11 15:59:00 ET/);
 // Next regular-session opening cannot keep the previous close as a live price.
 payload={...payload,valuation_market_open:true,valuation_coverage:0,active_unrealized_model_pnl:null,
  active_portfolio:[{...payload.active_portfolio[0],valuation_status:'UNAVAILABLE',current_valuation_price:null,
   valuation_return_pct:null,unrealized_model_pnl:null}]};
 tick();await flush();assert.equal(current.textContent,'—');assert.equal(metric.textContent,'—');assert.equal(total.textContent,'—');
 assert.doesNotMatch(notice.textContent,/Market closed|Рынок закрыт/);
 failed=true;tick();await flush();assert.equal(pnl.textContent,'—');
 assert.match(notice.textContent,lang==='ru'?/временно недоступны/:/temporarily unavailable/);
 document.visibilityState='hidden';const before=requests;tick();await flush();assert.equal(requests,before);
});
