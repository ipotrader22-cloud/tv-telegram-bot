'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const empty={version:2,epoch:'2026-10-19',status:'INCEPTION_ONLY_NOT_REVIEWED',snapshot_date:null,active_portfolio:[],closed_trades:[],active_count:0};
test('matches current Swing page section hierarchy without inventing holdings',()=>{
 const html=renderShadowSwing(empty);
 for(const x of ['Swing Leaders','Active Portfolio','Potential Candidates','Closed Trades','Equity History'])assert.ok(html.includes(x));
 assert.match(html,/INCEPTION ONLY/);assert.match(html,/\$100,000.00/);
 assert.ok(!html.includes('Reviewed 2026-10-22'));
});
test('private notes and HTML injection never leak into shadow page',()=>{
 const f={...empty,status:'SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED',snapshot_date:'2026-10-22',
  current_model_equity:100200,realized_model_pnl:0,unrealized_model_pnl:200,
  active_count:1,active_portfolio:[{ticker:'AMD',entry_date:'2026-10-22',entry_price:100,current_model_reference_price:102,
  score:80,last_full_review_date:'2026-10-22',privateFactorNotes:'secret <script>'}]};
 const html=renderShadowSwing(f);
 assert.match(html,/AMD/);assert.ok(html.includes('+$200.00'));assert.ok(!html.includes('privateFactorNotes'));
});
test('old epoch or invalid feed fails closed',()=>assert.throws(()=>renderShadowSwing({...empty,epoch:'2026-08-21'})));

test('verified equity series draws SVG and certified research candidates',()=>{
 const sample={...empty,status:'SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED',
  snapshot_date:'2026-10-22',current_model_equity:100500,realized_model_pnl:500,
  unrealized_model_pnl:0,candidate_count:1,
  candidates:[{ticker:'MU',score:82,brief_reason:'Documented sector leadership',review_date:'2026-10-22'}],
  equity_history:[{date:'2026-10-19',equity:100000},
                  {date:'2026-10-22',equity:100500}]};
 const html=renderShadowSwing(sample);
 assert.ok(html.includes('<polyline'));
 assert.ok(html.includes('Documented sector leadership'));
 assert.ok(html.includes('How Swing Leaders Works'));
 assert.ok(html.includes('Market Update'));
});
