'use strict';
// Public-looking SHADOW PREVIEW of the existing Swing Leaders visual structure.
// All data comes from the isolated Engine2 read-only model feed. Incomplete
// review states are clearly labelled, never shown as an up-to-date portfolio.
const {createHash}=require('node:crypto');
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const money=n=>Number.isFinite(n)?'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const signed=n=>Number.isFinite(n)?(n<0?'-':n>0?'+':'')+money(Math.abs(n)):'—';
const percent=n=>Number.isFinite(n)?(n>0?'+':'')+(100*n).toFixed(2)+'%':'—';
function equityFirst(html){
 const start=html.indexOf('<section class="section equity-chart-card" id="equity-history">');
 if(start<0)throw Error('EQUITY_SECTION_MISSING');
 const stop=html.indexOf('</section>',start);
 if(stop<0)throw Error('EQUITY_SECTION_UNCLOSED');
 const end=stop+10,chart=html.slice(start,end),without=html.slice(0,start)+html.slice(end);
 const pos=without.indexOf('<div class="metrics">');
 if(pos<0)throw Error('METRIC_GRID_MISSING');
 return without.slice(0,pos)+chart+without.slice(pos);
}
function renderShadowSwing(feed){
 if(!feed||feed.version!==2||feed.epoch!=='2026-10-19'||!Array.isArray(feed.active_portfolio)||
    !Array.isArray(feed.closed_trades)||feed.active_portfolio.length>10)throw Error('INVALID_ENGINE2_FEED');
 const current=feed.snapshot_date,committed=feed.status==='SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED';
 const status=committed?'SHADOW REVIEW — NOT PUBLISHED':'INCEPTION ONLY — REVIEW NOT COMPLETE';
 const active=feed.active_portfolio.map(p=>{
  const entry=Number(p.entry_price),quote=Number(p.current_model_reference_price);
  const pnl=Number.isFinite(entry)&&entry>0&&Number.isFinite(quote)?10000*(quote/entry-1):NaN;
  return '<tr><td data-label="Ticker"><strong>'+esc(p.ticker)+'</strong></td>'+
   '<td data-label="Score">'+esc(p.score)+'</td>'+
   '<td data-label="Entry">'+money(entry)+'</td>'+
   '<td data-label="Current">'+money(quote)+'</td>'+
   '<td data-label="Quantity">'+(entry>0?Math.floor(10000/entry):'—')+'</td>'+
   '<td data-label="TP">'+money(entry*1.10)+'</td>'+
   '<td data-label="SL">'+money(entry*.95)+'</td>'+
   '<td data-label="Return" class="'+(pnl>=0?'gain':'loss')+'">'+percent(quote/entry-1)+'</td>'+
   '<td data-label="P&L, $">'+signed(pnl)+'</td>'+
   '<td data-label="Research Note">'+esc(p.note||('Reviewed '+(p.last_full_review_date||'Unverified')))+'</td></tr>';
 }).join('');
 const closed=feed.closed_trades.map(p=>'<tr><td>'+esc(p.ticker)+'</td><td>'+esc(p.entry_date)+'</td>'+
  '<td>'+esc(p.exit_date)+'</td><td>'+money(p.entry_price)+'</td><td>'+money(p.exit_price)+'</td>'+
  '<td class="'+(p.normalized_model_pnl>=0?'gain':'loss')+'">'+signed(p.normalized_model_pnl)+'</td>'+
  '<td>'+esc(p.reason)+'</td></tr>').join('');
 const candidates=(feed.candidates||[]).map(p=>'<tr><td><strong>'+esc(p.ticker)+'</strong></td>'+
  '<td>'+esc(p.score)+' / 100</td><td>'+esc(p.brief_reason)+'</td><td>'+esc(p.review_date)+'</td></tr>').join('');
 const history=Array.isArray(feed.equity_history)?feed.equity_history:[];
 const dated=history.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number.isFinite(x.equity)).slice(-120);
 let chartMarkup='<div class="chart" role="img" aria-label="Equity History pending first complete reviewed session">$100,000.00 inception — verified history starts with the first complete review.</div>';
 if(dated.length>=2){
  const vals=dated.map(x=>x.equity-100000),lo=Math.min(0,...vals),hi=Math.max(0,...vals);
  const span=Math.max(100,hi-lo),x=i=>50+(i/(dated.length-1))*590,y=v=>174-((v-lo)/span)*130;
  const points=vals.map((v,i)=>x(i).toFixed(2)+','+y(v).toFixed(2)).join(' ');
  const dots=vals.map((v,i)=>'<circle cx="'+x(i).toFixed(2)+'" cy="'+y(v).toFixed(2)+'" r="2.5" fill="#237b58"><title>'+esc(dated[i].date)+' · '+esc(signed(v))+'</title></circle>').join('');
  chartMarkup='<svg role="img" aria-label="Verified Engine 2 model equity history" class="equity-chart-svg" viewBox="0 0 680 215" width="100%" style="max-height:255px"><line x1="50" x2="650" y1="'+y(0).toFixed(2)+'" y2="'+y(0).toFixed(2)+'" stroke="#a4bfb3" stroke-dasharray="4 4"/><polyline fill="none" stroke="#237b58" stroke-width="3" points="'+points+'"/>'+dots+'<text x="50" y="208" fill="#647c70" font-size="11">'+esc(dated[0].date)+'</text><text x="650" y="208" text-anchor="end" fill="#647c70" font-size="11">'+esc(dated.at(-1).date)+'</text></svg>';
 }
 const modelPnl=committed?Number(feed.realized_model_pnl)+Number(feed.unrealized_model_pnl):NaN;
 const fingerprint=feed.snapshot_id||createHash('sha256').update(JSON.stringify(feed)).digest('hex');
 const table=(headers,rows,empty)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
  (rows||'<tr><td class="empty" colspan="'+headers.length+'">'+esc(empty)+'</td></tr>')+'</tbody></table></div>';
 const fullHtml='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>VIXALE Swing Leaders — Engine 2.0 Shadow Preview</title>'+
 '<style>:root{color-scheme:light;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}*{box-sizing:border-box}body{margin:0;background:#f4f7f6;color:#172923}header{background:#102c26;color:#f8fcfa;padding:18px max(24px,calc((100vw - 1110px)/2))}header b{letter-spacing:.13em;font-size:19px}header small{display:block;color:#c8dcd3;font-size:12px;margin-top:6px}main{max-width:1110px;margin:0 auto;padding:28px 20px 70px}.intro{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:15px;margin-bottom:22px}.eyebrow{color:#3f7560;text-transform:uppercase;letter-spacing:.13em;font-size:11px;font-weight:800}.intro h1{margin:4px 0 9px;font-size:34px}.intro p{margin:0;color:#547268;max-width:710px;line-height:1.5}.notice{background:#fff7e6;border:1px solid #f1d9a8;border-radius:9px;padding:13px 16px;font-weight:600;font-size:13px;margin-bottom:24px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.metric,.section{background:white;border:1px solid #e0e9e4;border-radius:12px;box-shadow:0 4px 22px #152f2310}.metric{padding:17px}.metric small{display:block;color:#6a8579;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.08em}.metric strong{display:block;margin-top:8px;font-size:23px}.section{padding:22px;margin:15px 0}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}.section h2{font-size:20px;margin:0 0 15px}.section-sub{color:#668276;font-size:13px;margin:-5px 0 16px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:650px}th{text-align:left;color:#708c81;font-size:11px;text-transform:uppercase;letter-spacing:.045em;background:#f7faf9}td,th{padding:12px 10px;border-bottom:1px solid #ecf0ee}td{font-size:13px}.gain{color:#087c50;font-weight:700}.loss{color:#bb4e45;font-weight:700}.empty{text-align:center;color:#688477;padding:26px 12px}.chart{background:#f8fbf9;border:1px solid #e5eee8;border-radius:8px;min-height:190px;display:flex;align-items:center;justify-content:center;color:#688477;text-align:center;padding:20px}footer{color:#728980;font-size:12px;line-height:1.65;margin-top:30px}@media(max-width:720px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.intro h1{font-size:27px}.metric strong{font-size:19px}.section{padding:15px}}</style></head><body>'+
 '<header><b>VIXALE.</b><small>Three Systems / Swing Trading</small></header><main>'+
 '<div class="intro"><div><div class="eyebrow">Swing trading / model portfolio</div><h1>Swing Leaders</h1>'+
 '<p>Active Portfolio based on Vixale\'s proprietary ranking system. Positions are added and closed daily. Updated every morning around 10:00 am after independent verification.</p></div>'+
 '<div>Epoch <strong>October 19, 2026</strong></div></div>'+
 '<div class="notice" id="engine2-state" data-engine2-status="'+esc(feed.status)+'">'+esc(status)+
 ' · No broker orders or live website publication. '+(current?'Latest certified review: '+esc(current):'No certified review date available.')+'</div>'+
 '<div class="metrics"><div class="metric"><small>Active Portfolio</small><strong>'+esc(feed.active_count)+'</strong></div>'+
 '<div class="metric"><small>Candidates</small><strong>'+esc((feed.candidates||[]).length)+'</strong></div>'+
 '<div class="metric"><small>Cash</small><strong>'+(committed?((10-feed.active_count)*10).toFixed(1)+'%':'100.0%')+'</strong></div>'+
 '<div class="metric"><small>Model Allocation</small><strong>$10K / position</strong></div></div>'+
 '<section class="section" id="how-swing-leaders-works"><h2>How Swing Leaders Works</h2>'+
 '<p class="section-sub"><strong>Active Portfolio:</strong> Open model positions monitored for targets, opening stops and daily research scores.</p>'+
 '<p class="section-sub"><strong>Candidates:</strong> Stocks being watched; they are not open positions and may never be added.</p>'+
 '<p class="section-sub"><strong>Closed Trades:</strong> Completed model positions after a documented target, stop or score exit.</p>'+
 '<p class="section-sub"><strong>Position size and exits:</strong> Fixed $10,000 per position · +10% target · 9:30 ET opening -5% stop · score dropout below 70.</p></section>'+
 '<section class="section" id="market-update"><h2>Market Update</h2>'+
 '<p class="section-sub">'+(committed?'Verified Engine 2.0 model review for '+esc(current)+'.':'Clean-slate inception. No independently verified morning ranking has been published.')+'</p></section>'+
 '<section class="section" id="active-portfolio"><div class="section-heading"><h2>Active Portfolio</h2></div>'+
 '<p class="section-sub">Open model positions. Target +10% · Opening -5% · Score exit below 70. Prices are indicative where noted.</p>'+
 table(['Ticker','Score','Entry','Current','Quantity','TP','SL','Return','P&L, $','Research Note'],active,'No independently verified new positions.')+'</section>'+
 '<section class="section" id="potential-candidates"><h2>Candidates</h2>'+
 '<p class="section-sub">Candidate rankings appear only after complete, dated nine-factor research.</p>'+
 table(['Ticker','Score','Why We’re Watching','Reviewed'],candidates,'No verified candidate review available.')+'</section>'+
 '<section class="section" id="closed-trades"><h2>Closed Trades</h2>'+
 table(['Ticker','Entry Date','Exit Date','Entry','Exit','Model P&L','Reason'],closed,'No new-epoch closed trades.')+'</section>'+
 '<section class="section equity-chart-card" id="equity-history"><div class="section-heading"><h2>Equity History</h2><span>'+esc(current||'Inception')+'</span></div>'+
 chartMarkup+'</section>'+
 '<footer>Research/model portfolio only. Prices are reference marks, not broker fills. Published VIXALE model performance is separate from this development preview.<br>'+
 'Preview snapshot SHA-256: <code id="model-snapshot-id">'+esc(fingerprint)+'</code></footer></main></body></html>';
 return equityFirst(fullHtml);
}
module.exports={renderShadowSwing};
