"use strict";

const FUNNEL_SCRIPT_ID = "vx-website-funnel-access";
const ACCESS_HREF = "/access";
const LEGACY_ACCESS_HREF = "/#password-access";

function renderFunnelAccessScript() {
  return `<script id="${FUNNEL_SCRIPT_ID}">(function(){
  if(window.__vxFunnelAccessBound)return;window.__vxFunnelAccessBound=true;
  function isAccessHref(href){
    href=String(href||'');
    return href==='${LEGACY_ACCESS_HREF}'||href==='${ACCESS_HREF}'||href.indexOf('${ACCESS_HREF}?')===0||href.indexOf('${ACCESS_HREF}#')===0;
  }
  document.addEventListener('click',function(event){
    var node=event.target&&event.target.closest?event.target.closest('a[href]'):null;
    if(!node||!isAccessHref(node.getAttribute('href')))return;
    try{
      if(navigator.sendBeacon){navigator.sendBeacon('/website-funnel/access-cta','');return;}
      fetch('/website-funnel/access-cta',{method:'POST',credentials:'same-origin',keepalive:true}).catch(function(){});
    }catch(_error){}
  },true);
})();</script>`;
}

function injectFunnelAccessScript(html) {
  if (typeof html !== "string") return html;
  if (html.includes(`id="${FUNNEL_SCRIPT_ID}"`)) return html;
  const hasAccessLink = html.includes(`href="${ACCESS_HREF}"`) ||
    html.includes(`href="${ACCESS_HREF}?`) ||
    html.includes(`href="${LEGACY_ACCESS_HREF}"`);
  if (!hasAccessLink) return html;
  const script = renderFunnelAccessScript();
  if (html.includes("</body>")) return html.replace("</body>", () => `${script}\n</body>`);
  return `${html}${script}`;
}

module.exports = {
  FUNNEL_SCRIPT_ID,
  ACCESS_HREF,
  LEGACY_ACCESS_HREF,
  renderFunnelAccessScript,
  injectFunnelAccessScript,
};
