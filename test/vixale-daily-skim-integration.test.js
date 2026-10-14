'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBrief,timestampNY}=require('../scripts/vixale-daily-skim');
const {renderMarketPulse,refineSwingHtml}=require('../website_swing_ui_refinement');
function series(id,changePct,date='2026-10-13'){
 return {date,level:100,previousDate:'2026-10-12',previousLevel:99,changePct,
 sourceUrl:'https://fred.stlouisfed.org/series/'+id};
}
const sample={sp500:series('SP500',0.25),nasdaq:series('NASDAQCOM',-0.3),
 vix:series('VIXCLS',1.5),treasury10y:series('DGS10',0.1)};
test('NY timestamp uses daylight saving correctly',()=>{
 assert.equal(timestampNY(new Date('2026-10-14T14:40:00Z')),'2026-10-14T10:40:00-04:00');
 assert.equal(timestampNY(new Date('2026-12-14T15:40:00Z')),'2026-12-14T10:40:00-05:00');
});
test('bilingual broad-market original commentary uses dated closes, no company press recap',()=>{
 const b=createBrief(sample,{dateET:'2026-10-14',reviewedAtET:'2026-10-14T10:40:00-04:00'});
 assert.equal(b.scope,'broad-us-equities');assert.match(b.summaryEn,/S&P 500/);
 assert.match(b.summaryEn,/Nasdaq Composite/);assert.match(b.summaryEn,/VIX/);
 assert.doesNotMatch(b.summaryEn,/NVIDIA published/);
 assert.match(renderMarketPulse(b,'ru'),/Последнее подтверждённое закрытие/);
 assert.match(renderMarketPulse(b,'en'),/last verified close/);
 assert.doesNotMatch(renderMarketPulse(b,'en'),/Treasury|bond|yield/i);
});
test('mixed-date or missing VIX fails closed',()=>{
 assert.throws(()=>createBrief({...sample,nasdaq:series('NASDAQCOM',0.1,'2026-10-10')},{dateET:'2026-10-14',reviewedAtET:'2026-10-14T10:40:00-04:00'}),/date/);
 assert.throws(()=>createBrief({...sample,vix:null},{dateET:'2026-10-14',reviewedAtET:'2026-10-14T10:40:00-04:00'}),/date/);
});
test('pending placeholder not falsely marked current',()=>{
 assert.equal(renderMarketPulse(null,'en'),'');
});
test('HTML transformation retains portfolio and uses one market update without a duplicate card',()=>{
 const html='<html><body><main><section class="summary" aria-label="Swing Leaders summary"><div class="summary-card posture"><small>Market Posture</small><strong>Neutral</strong></div></section><section class="how" aria-label="How Swing Leaders works"><h2>How</h2></section><table><tbody><tr><td>PLTR</td></tr></tbody></table></main></body></html>';
 const x=refineSwingHtml(html,'en');
 assert.ok(x.includes('data-vx-swing-market-update="1"'));
 assert.ok(!x.includes('id="vx-daily-market-skim"'));
 assert.equal((x.match(/data-vx-swing-market-update="1"/g)||[]).length,1);
 assert.match(x,/<td>PLTR<\/td>/);
});
