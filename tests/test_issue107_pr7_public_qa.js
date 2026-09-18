"use strict";

const assert = require("assert");
const pkg = require("../package.json");
const {
  CANONICAL_HOST,
  PUBLIC_META,
  SITEMAP_PATHS,
  canonicalUrl,
  canonicalRedirectTarget,
  refinePublicQaHtml,
  renderRobotsTxt,
  renderSitemapXml,
  installPublicQaRefinement,
} = require("../website_public_qa_refinement");

assert(pkg.scripts.start.startsWith("node -r ./website_public_qa_refinement.js -r ./website_evidence_credibility_refinement.js "), "public QA must be the first preload and evidence credibility must remain second");
assert.strictEqual(CANONICAL_HOST, "www.vixale.com");
assert.strictEqual(canonicalRedirectTarget("vixale.com", "/results?from=apex"), "https://www.vixale.com/results?from=apex");
assert.strictEqual(canonicalRedirectTarget("vixale.com:443", "/"), "https://www.vixale.com/");
assert.strictEqual(canonicalRedirectTarget("www.vixale.com", "/results"), null);
assert.strictEqual(canonicalRedirectTarget("ru.vixale.com", "/results"), null);
assert.strictEqual(canonicalRedirectTarget("tv-telegram-bot-a7t0.onrender.com", "/results"), null);

const fixture = `<!doctype html><html><head><title>Old</title><meta name="description" content="old"><link rel="canonical" href="https://vixale.com/old"><meta property="og:title" content="old"></head><body><nav><a href="/trading-systems">Trading Systems</a><a href="/results">Results</a><a href="/access">Request Free Access</a></nav><main class="wrap"><h1>Page</h1><svg class="vx-watch-chart-svg"><text fill="#87918d">Axis</text></svg><script>const label={fill:'#87918d'};</script><form><input required name="email"></form></main></body></html>`;

for (const [pathname, meta] of Object.entries(PUBLIC_META)) {
  const out = refinePublicQaHtml(fixture, pathname);
  assert(out.includes(`<title>${meta[0]}</title>`), `${pathname}: title`);
  assert(out.includes(`<meta name="description" content="${meta[1]}">`), `${pathname}: description`);
  assert(out.includes(`<link rel="canonical" href="${canonicalUrl(pathname)}">`), `${pathname}: canonical`);
  assert(out.includes(`<meta property="og:title" content="${meta[0]}">`), `${pathname}: og:title`);
  assert(out.includes(`<meta property="og:description" content="${meta[1]}">`), `${pathname}: og:description`);
  assert(out.includes(`<meta property="og:url" content="${canonicalUrl(pathname)}">`), `${pathname}: og:url`);
  assert(out.includes('<meta property="og:type" content="website">'), `${pathname}: og:type`);
  assert(out.includes('<meta name="twitter:card" content="summary">'), `${pathname}: twitter card`);
  assert(out.includes('<meta name="robots" content="index,follow,max-image-preview:large">'), `${pathname}: robots`);
  assert.strictEqual((out.match(/rel="canonical"/g) || []).length, 1, `${pathname}: one canonical`);
  assert(out.includes('<a class="vx-skip-link" href="#main-content">Skip to content</a>'), `${pathname}: skip link`);
  assert(out.includes('<main id="main-content" tabindex="-1" class="wrap">'), `${pathname}: main target`);
  assert(out.includes(':focus-visible{outline:3px solid #087a48'), `${pathname}: visible focus`);
  assert(out.includes('@media(prefers-reduced-motion:reduce)'), `${pathname}: reduced motion`);
  assert(out.includes('@media(max-width:768px)'), `${pathname}: tablet/200% zoom reflow support`);
  assert(out.includes('@media(max-width:390px)'), `${pathname}: phone reflow support`);
  assert(out.includes('fill="#5f6d67"'), `${pathname}: static chart contrast`);
  assert(out.includes("fill:'#5f6d67'"), `${pathname}: scripted chart contrast`);
  assert(!out.includes("#87918d"), `${pathname}: low-contrast token removed from final public HTML`);
  assert(out.includes('input:invalid:focus'), `${pathname}: form-error focus treatment`);
  assert(out.includes('href="/trading-systems"') && out.includes('href="/results"') && out.includes('href="/access"'), `${pathname}: existing journey links preserved`);
}

assert.strictEqual(refinePublicQaHtml("<html>unchanged</html>", "/dashboard"), "<html>unchanged</html>");

const sitemap = renderSitemapXml();
for (const path of SITEMAP_PATHS) assert(sitemap.includes(`<loc>${canonicalUrl(path)}</loc>`), `sitemap missing ${path}`);
for (const forbidden of ["/dashboard", "/admin/", "/trading-systems/options/viewer", "/pricing"]) assert(!sitemap.includes(`www.vixale.com${forbidden}`), `sitemap must omit ${forbidden}`);

const robots = renderRobotsTxt();
assert(robots.includes("User-agent: *"));
assert(robots.includes("Allow: /"));
assert(robots.includes("Disallow: /admin/"));
assert(robots.includes("Disallow: /dashboard"));
assert(robots.includes("Disallow: /trading-systems/options/viewer"));
assert(robots.includes("Sitemap: https://www.vixale.com/sitemap.xml"));

function exerciseMiddleware({ method="GET", host="www.vixale.com", url="/" } = {}) {
  let middleware;
  installPublicQaRefinement({ use(fn){ middleware=fn; } });
  const state = { next:false, status:null, redirect:null, body:null, headers:{} };
  const req = { method, originalUrl:url, url, headers:{host}, get(name){ return String(name).toLowerCase()==="host" ? host : ""; } };
  const res = {
    status(code){ state.status=code; return this; },
    setHeader(name,value){ state.headers[name]=value; },
    getHeader(){ return state.headers["Content-Type"] || "text/html"; },
    redirect(code,target){ state.redirect={code,target}; return this; },
    send(body){ state.body=body; return this; },
    end(){ state.body=""; return this; },
  };
  middleware(req,res,()=>{state.next=true;});
  return state;
}

const apexGet = exerciseMiddleware({ method:"GET", host:"vixale.com", url:"/results?x=1" });
assert.deepStrictEqual(apexGet.redirect, { code:308, target:"https://www.vixale.com/results?x=1" });
assert.strictEqual(apexGet.next, false);
const apexPost = exerciseMiddleware({ method:"POST", host:"vixale.com", url:"/webhook" });
assert.strictEqual(apexPost.redirect, null, "non-read traffic must never be host-redirected by the QA middleware");
assert.strictEqual(apexPost.next, true, "non-read traffic must continue to existing app handlers");
const robotsGet = exerciseMiddleware({ method:"GET", host:"www.vixale.com", url:"/robots.txt" });
assert.strictEqual(robotsGet.status, 200); assert(robotsGet.body.includes("Sitemap:"));
const sitemapGet = exerciseMiddleware({ method:"GET", host:"www.vixale.com", url:"/sitemap.xml" });
assert.strictEqual(sitemapGet.status, 200); assert(sitemapGet.body.includes("<urlset"));

console.log("Issue #107 PR7 public QA: PASS");
