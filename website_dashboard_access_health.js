"use strict";

const Module = require("module");

const PANEL_ID = "vx-dashboard-access-health";
const ADMIN_PATH = "/admin/live";

function dashboardAccessHealthPanelHtml() {
  return `<section id="${PANEL_ID}" class="vx-access-health" aria-labelledby="vx-access-health-title">
    <div class="vx-access-health-head">
      <div>
        <div class="vx-access-health-eyebrow">SYSTEM CONTROL</div>
        <h2 id="vx-access-health-title">Dashboard Access Health</h2>
        <p>Live configuration and Google Sheets probe. Email test is manual and creates no customer request.</p>
      </div>
      <div class="vx-access-health-status" data-health-overall="checking"><span class="vx-access-health-dot"></span><span data-health-overall-label>Checking…</span></div>
    </div>
    <div class="vx-access-health-grid">
      <div><span>Access form</span><strong data-health-request>Waiting for activity</strong></div>
      <div><span>Turnstile</span><strong data-health-turnstile>Checking…</strong></div>
      <div><span>Google Sheets</span><strong data-health-sheets>Checking…</strong></div>
      <div><span>Resend</span><strong data-health-resend>Checking…</strong></div>
      <div><span>Verification email</span><strong data-health-verification>Waiting for activity</strong></div>
      <div><span>Owner notification</span><strong data-health-owner>Waiting for activity</strong></div>
      <div><span>Synthetic email</span><strong data-health-synthetic>Not run yet</strong></div>
      <div><span>Last checked</span><strong data-health-checked>—</strong></div>
    </div>
    <div class="vx-access-health-footer">
      <button type="button" class="vx-access-health-test" data-health-test>Run Test Email</button>
      <span data-health-note>Refreshes every 30 seconds while this page is open.</span>
    </div>
    <div class="vx-access-health-error" data-health-error hidden></div>
  </section>`;
}

function dashboardAccessHealthStyle() {
  return `<style id="vx-dashboard-access-health-style">
    .vx-access-health{margin:0 0 22px;padding:20px;border:1px solid #d8e1e8;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(20,42,60,.06);color:#162532}
    .vx-access-health-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}
    .vx-access-health-eyebrow{font-size:11px;font-weight:800;letter-spacing:.11em;color:#607383;margin-bottom:4px}
    .vx-access-health h2{margin:0;font-size:20px;line-height:1.2}.vx-access-health p{margin:7px 0 0;color:#607383;font-size:13px;max-width:680px}
    .vx-access-health-status{display:inline-flex;align-items:center;gap:8px;border:1px solid #d8e1e8;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:800;white-space:nowrap;background:#f7fafc}
    .vx-access-health-dot{width:9px;height:9px;border-radius:50%;background:#91a0ac}.vx-access-health-status[data-health-overall="operational"] .vx-access-health-dot{background:#1f9d66}.vx-access-health-status[data-health-overall="needs_attention"] .vx-access-health-dot{background:#c83e4d}
    .vx-access-health-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.vx-access-health-grid>div{border:1px solid #e4eaef;border-radius:12px;padding:11px 12px;background:#fafcfd;min-height:62px}.vx-access-health-grid span{display:block;color:#6d7e8c;font-size:11px;margin-bottom:6px}.vx-access-health-grid strong{display:block;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
    .vx-access-health-footer{display:flex;align-items:center;gap:12px;margin-top:14px;color:#6d7e8c;font-size:12px}.vx-access-health-test{appearance:none;border:1px solid #1d6fd8;border-radius:9px;background:#1d6fd8;color:#fff;padding:9px 13px;font-weight:800;cursor:pointer}.vx-access-health-test:disabled{opacity:.55;cursor:wait}.vx-access-health-error{margin-top:12px;border:1px solid #efc8cc;border-radius:10px;background:#fff5f6;color:#9e2634;padding:10px 12px;font-size:12px}
    @media(max-width:920px){.vx-access-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.vx-access-health{padding:16px}.vx-access-health-head{display:block}.vx-access-health-status{margin-top:12px}.vx-access-health-grid{grid-template-columns:1fr}.vx-access-health-footer{align-items:flex-start;flex-direction:column}}
  </style>`;
}

function dashboardAccessHealthScript() {
  return `<script id="vx-dashboard-access-health-script">
  (()=>{
    const root=document.getElementById('${PANEL_ID}'); if(!root)return;
    const q=s=>root.querySelector(s); const fmt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString();};
    const component=(value,empty)=>{if(!value||value.ok===null)return empty||'Waiting for activity';return (value.ok?'OK · ':'ERROR · ')+fmt(value.at)+(value.message?' · '+value.message:'');};
    async function refresh(){
      try{const r=await fetch('/admin/dashboard-access-health',{credentials:'same-origin',headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Health endpoint returned '+r.status);const h=await r.json();
        const overall=h.overall||'checking';q('[data-health-overall]').dataset.healthOverall=overall;q('[data-health-overall-label]').textContent=overall==='operational'?'All systems operational':overall==='needs_attention'?'Needs attention':'Checking…';
        q('[data-health-request]').textContent=h.last_request_at?'Last request · '+fmt(h.last_request_at):'No request since restart';
        q('[data-health-turnstile]').textContent=h.config&&h.config.turnstile?'Configured':'NOT CONFIGURED';
        q('[data-health-sheets]').textContent=component(h.components&&h.components.google_sheets,'Checking…');
        q('[data-health-resend]').textContent=h.config&&h.config.resend?'Configured':'NOT CONFIGURED';
        q('[data-health-verification]').textContent=component(h.components&&h.components.verification_email,'Waiting for activity');
        q('[data-health-owner]').textContent=component(h.components&&h.components.owner_notification,'Waiting for activity');
        q('[data-health-synthetic]').textContent=component(h.components&&h.components.synthetic_email,'Not run yet');
        q('[data-health-checked]').textContent=fmt(h.last_checked_at);const e=q('[data-health-error]');if(h.last_failure_at){e.hidden=false;e.textContent='Last failure · '+fmt(h.last_failure_at)+' · '+(h.last_failure_component||'unknown')+(h.last_failure_message?' · '+h.last_failure_message:'');}else{e.hidden=true;}
      }catch(err){q('[data-health-overall]').dataset.healthOverall='needs_attention';q('[data-health-overall-label]').textContent='Health check unavailable';const e=q('[data-health-error]');e.hidden=false;e.textContent=String(err&&err.message?err.message:err);}
    }
    const btn=q('[data-health-test]');btn.addEventListener('click',async()=>{btn.disabled=true;const note=q('[data-health-note]');note.textContent='Running email test…';try{const r=await fetch('/admin/dashboard-access-health/test-email',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('Test failed with '+r.status));note.textContent='Provider accepted the test email. Check the owner inbox for [SYSTEM TEST].';await refresh();}catch(err){note.textContent=String(err&&err.message?err.message:err);await refresh();}finally{btn.disabled=false;}});
    refresh();setInterval(refresh,30000);
  })();
  </script>`;
}

function injectDashboardAccessHealth(html) {
  if (typeof html !== "string" || html.includes(`id="${PANEL_ID}"`)) return html;
  if (!/dashboard-access|Dashboard Access|Pending Requests/i.test(html)) return html;
  let out = html;
  if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, dashboardAccessHealthStyle() + "</head>");
  const accessSection = /<section\b[^>]*id=["']dashboard-access["'][^>]*>/i;
  if (accessSection.test(out)) out = out.replace(accessSection, dashboardAccessHealthPanelHtml() + "$&");
  else if (/<\/main>/i.test(out)) out = out.replace(/<\/main>/i, dashboardAccessHealthPanelHtml() + "</main>");
  else out = out.replace(/<\/body>/i, dashboardAccessHealthPanelHtml() + "</body>");
  return out.replace(/<\/body>/i, dashboardAccessHealthScript() + "</body>");
}

function installDashboardAccessHealthPanel(app) {
  app.use((req,res,next)=>{
    const requestPath=String(req.originalUrl||req.url||'').split('?')[0];
    if ((req.method!=="GET"&&req.method!=="HEAD")||requestPath!==ADMIN_PATH) return next();
    const originalSend=res.send.bind(res);
    res.send=function(body){const type=String(res.getHeader('Content-Type')||'');if(res.statusCode===200&&typeof body==='string'&&(!type||type.includes('html'))) body=injectDashboardAccessHealth(body);return originalSend(body);};
    next();
  });
}

function copyExpressStatics(target,source){for(const key of Reflect.ownKeys(source)){if(["length","name","prototype","arguments","caller"].includes(String(key)))continue;const d=Object.getOwnPropertyDescriptor(source,key);if(!d)continue;try{Object.defineProperty(target,key,d);}catch(_){}}Object.setPrototypeOf(target,Object.getPrototypeOf(source));}
function wrapExpress(expressFactory){if(typeof expressFactory!=="function"||expressFactory.__vixaleDashboardAccessHealthWrapped)return expressFactory;function wrappedExpress(...args){const app=expressFactory(...args);installDashboardAccessHealthPanel(app);return app;}copyExpressStatics(wrappedExpress,expressFactory);Object.defineProperty(wrappedExpress,"__vixaleDashboardAccessHealthWrapped",{value:true});return wrappedExpress;}
const originalLoad=Module._load;Module._load=function vixaleDashboardAccessHealthModuleLoad(request,parent,isMain){const loaded=originalLoad.call(this,request,parent,isMain);return request==="express"?wrapExpress(loaded):loaded;};

module.exports={PANEL_ID,ADMIN_PATH,dashboardAccessHealthPanelHtml,dashboardAccessHealthStyle,dashboardAccessHealthScript,injectDashboardAccessHealth,installDashboardAccessHealthPanel,wrapExpress};
