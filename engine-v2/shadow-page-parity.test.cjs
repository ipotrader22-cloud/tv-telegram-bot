'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withSnapshotId}=require('./shadow-public-feed.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const {verifyShadowPageParity}=require('./shadow-page-parity.cjs');
const p=withSnapshotId({version:2,epoch:'2026-10-19',status:'INCEPTION_ONLY_NOT_REVIEWED',
 snapshot_date:null,starting_model_equity:100000,current_model_equity:null,
 active_count:0,active_portfolio:[],closed_trades:[]});
test('inception page matches isolated API by exact SHA without fabricated review',()=>{
 const x=verifyShadowPageParity({feed:p,html:renderShadowSwing(p)});
 assert.equal(x.status,'SHADOW_HTML_API_PARITY_PASS');assert.equal(x.reviewDate,null);
 assert.equal(x.publicLaunchVerified,false);
});
test('mismatched HTML/API sha cannot pass even when headings and tickers match',()=>{
 const html=renderShadowSwing(p).replace(p.snapshot_id,'0'.repeat(64));
 assert.equal(verifyShadowPageParity({feed:p,html}).reason,'HTML_API_FINGERPRINT_MISMATCH');
});
test('invalid duplicate model holdings cannot pass',()=>{
 const q=withSnapshotId({...p,active_count:2,active_portfolio:[{ticker:'AMD'},{ticker:'AMD'}]});
 assert.equal(verifyShadowPageParity({feed:q,html:renderShadowSwing(q)}).status,'BLOCKED');
});
