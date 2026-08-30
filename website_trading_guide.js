"use strict";

const Module = require("module");
const path = require("path");

const PDF_PATH = path.join(__dirname, "Vixale_Trading_Guide.pdf");
const GUIDE_PATH = "/trading-guide";
const PDF_ROUTE = "/download/trading-guide.pdf";
const SYSTEMS_PATH = "/trading-systems";

const sharedStyles = `
  .vx-guide-shell{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17211d}
  .vx-guide-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .vx-guide-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 16px;border:1px solid #cfe7da;border-radius:999px;background:#fff;color:#18372a;text-decoration:none;font-size:13px;font-weight:650;line-height:1;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
  .vx-guide-btn:hover{transform:translateY(-1px);border-color:#8fd5b3;box-shadow:0 8px 22px rgba(16,20,19,.08)}
  .vx-guide-btn.primary{background:#103f2d;border-color:#103f2d;color:#fff}
  .vx-guide-btn.primary:hover{border-color:#103f2d;box-shadow:0 10px 24px rgba(16,63,45,.18)}
  .vx-guide-card{border:1px solid #dbe5df;border-radius:24px;background:rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(16,20,19,.055)}
  .vx-guide-kicker{margin:0 0 8px;color:#508269;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
  .vx-guide-title{margin:0;color:#101614;font-size:24px;line-height:1.1;letter-spacing:-.02em}
  .vx-guide-copy{margin:10px 0 0;color:#64716b;font-size:14px;line-height:1.62}
  .vx-guide-steps{display:grid;gap:10px;margin-top:18px}
  .vx-guide-step{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start}
  .vx-guide-num{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#eef8f3;color:#176442;font-size:12px;font-weight:800}
  .vx-guide-step strong{display:block;margin:2px 0 3px;color:#18211e;font-size:13px}
  .vx-guide-step span{display:block;color:#68756f;font-size:13px;line-height:1.48}
  .vx-guide-example{margin-top:18px;padding:15px 16px;border:1px solid #e0e8e3;border-radius:18px;background:#f8fbf9}
  .vx-guide-example strong{display:block;margin-bottom:7px;color:#16211d;font-size:12px;letter-spacing:.02em}
  .vx-guide-example code{display:block;white-space:normal;color:#23322c;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55}
  .vx-guide-pnl{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .vx-guide-chip{padding:5px 9px;border-radius:999px;background:#edf8f1;color:#176442;font-size:11px;font-weight:700}
  .vx-guide-chip.loss{background:#fff0f0;color:#a63d3d}
  @media(max-width:720px){.vx-guide-title{font-size:21px}.vx-guide-actions{width:100%}.vx-guide-btn{flex:1 1 auto}}
`;

function renderCompactGuidePanel() {
  return `
  <section class="vx-guide-shell vx-guide-compact" aria-labelledby="vx-how-to-trade-title">
    <style>
      ${sharedStyles}
      .vx-guide-compact{max-width:1180px;margin:0 auto 74px;padding:0 24px}
      .vx-guide-compact-head{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:18px;padding-top:8px}
      .vx-guide-compact-head>div:first-child{max-width:700px}
      .vx-guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .vx-guide-grid .vx-guide-card{padding:22px}
      .vx-guide-route{display:inline-flex;margin-top:18px;color:#176442;text-decoration:none;font-size:12px;font-weight:750}
      .vx-guide-route:hover{text-decoration:underline}
      @media(max-width:960px){.vx-guide-grid{grid-template-columns:1fr}.vx-guide-compact-head{align-items:flex-start;flex-direction:column}}
      @media(max-width:560px){.vx-guide-compact{padding:0 16px;margin-bottom:54px}.vx-guide-grid .vx-guide-card{padding:19px;border-radius:20px}}
    </style>
    <div class="vx-guide-compact-head">
      <div><p class="vx-guide-kicker">Beginner guide</p><h2 class="vx-guide-title" id="vx-how-to-trade-title">How to Trade Vixale</h2><p class="vx-guide-copy">Vixale delivers the signal or portfolio instruction. You execute and manage the order in your own broker platform.</p></div>
      <div class="vx-guide-actions"><a class="vx-guide-btn primary" href="${GUIDE_PATH}">Open Trading Guide</a><a class="vx-guide-btn" href="${PDF_ROUTE}" download>Download Trading Guide (PDF)</a></div>
    </div>
    <div class="vx-guide-grid">
      <article class="vx-guide-card">
        <p class="vx-guide-kicker">Prime / Edge · Day Trading</p><h3 class="vx-guide-title">Signal → Broker → Target → Stop Ref</h3>
        <div class="vx-guide-steps">
          <div class="vx-guide-step"><span class="vx-guide-num">1</span><div><strong>Receive</strong><span>Watch Telegram and/or the Vixale website for a new signal.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">2</span><div><strong>Execute</strong><span>Enter the published symbol and entry in your broker platform.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">3</span><div><strong>Target</strong><span>Place the published profit-taking limit order.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">4</span><div><strong>Monitor Stop Ref</strong><span>Use the applicable candle close instruction, not a simple intrabar touch.</span></div></div>
        </div>
        <div class="vx-guide-example"><strong>Example</strong><code>BUY 100 AAPL @ $300 · TGT $302 · STOP REF $299</code><div class="vx-guide-pnl"><span class="vx-guide-chip">Target: +$200</span><span class="vx-guide-chip loss">$299 exit: -$100</span></div></div>
        <a class="vx-guide-route" href="${GUIDE_PATH}#day-trading">Full Day Trading workflow →</a>
      </article>
      <article class="vx-guide-card">
        <p class="vx-guide-kicker">Swing Trading</p><h3 class="vx-guide-title">Check → Enter → +10% / -5% → Review</h3>
        <div class="vx-guide-steps">
          <div class="vx-guide-step"><span class="vx-guide-num">1</span><div><strong>Check 9:45–10:00 AM ET</strong><span>Review Active Portfolio each trading day for updates.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">2</span><div><strong>New addition</strong><span>When a new symbol appears, enter at the current market price.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">3</span><div><strong>Risk framework</strong><span>Use a +10% target and a -5% stop from your actual entry price.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">4</span><div><strong>Removal</strong><span>If the symbol drops off Active Portfolio, close at market as soon as practical.</span></div></div>
        </div>
        <div class="vx-guide-example"><strong>Example</strong><code>100 MSFT @ $50.00 · TGT $55.00 · STOP $47.50</code><div class="vx-guide-pnl"><span class="vx-guide-chip">Target: +$500</span><span class="vx-guide-chip loss">Stop: -$250</span><span class="vx-guide-chip">Removed @ $51.20: +$120</span></div></div>
        <a class="vx-guide-route" href="${GUIDE_PATH}#swing-trading">Full Swing workflow →</a>
      </article>
      <article class="vx-guide-card">
        <p class="vx-guide-kicker">Options · Straddles</p><h3 class="vx-guide-title">Watch → Straddle → +10% → Follow Updates</h3>
        <div class="vx-guide-steps">
          <div class="vx-guide-step"><span class="vx-guide-num">1</span><div><strong>Watch 6:00–8:30 PM ET</strong><span>Monitor Telegram and the Options section for a new straddle signal.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">2</span><div><strong>Open</strong><span>Enter the specified call + put combination in your broker platform.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">3</span><div><strong>Target</strong><span>Place the profit-taking limit at +10% above total straddle debit.</span></div></div>
          <div class="vx-guide-step"><span class="vx-guide-num">4</span><div><strong>Follow updates</strong><span>Use Telegram / Options instructions for any hedge, adjustment, or exit.</span></div></div>
        </div>
        <div class="vx-guide-example"><strong>Example</strong><code>1 SPY straddle @ $10.00 debit = $1,000 · TGT $11.00</code><div class="vx-guide-pnl"><span class="vx-guide-chip">Target: +$100</span></div></div>
        <a class="vx-guide-route" href="${GUIDE_PATH}#options">Full Options workflow →</a>
      </article>
    </div>
  </section>`;
}

function injectTradingSystemsGuide(html) {
  if (typeof html !== "string" || html.includes('id="vx-how-to-trade-title"')) return html;
  const panel = renderCompactGuidePanel();
  const anchor = '<section class="wrap section horizon-section" id="market-coverage">';
  if (html.includes(anchor)) return html.replace(anchor, `${panel}\n${anchor}`);
  if (html.includes("</body>")) return html.replace("</body>", `${panel}\n</body>`);
  return `${html}${panel}`;
}

function renderTradingGuideHtml() {
  const steps = (items) => items.map((item, index) => `<div class="guide-step"><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></div>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Vixale | Trading Guide</title><meta name="description" content="Beginner-friendly Vixale execution guide for Prime, Edge, Swing Trading, and Options Straddles." />
<style>
:root{--bg:#fbfcfb;--ink:#101614;--muted:#64716b;--line:#dbe5df;--green:#103f2d;--green2:#176442;--soft:#eef8f3;--red:#a63d3d}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#fbfcfb 0%,#f6faf7 100%);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.wrap{width:min(1120px,calc(100% - 48px));margin:0 auto}.topbar{position:sticky;top:0;z-index:10;border-bottom:1px solid rgba(219,229,223,.9);background:rgba(251,252,251,.9);backdrop-filter:blur(14px)}.nav{height:68px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{font-weight:850;letter-spacing:.16em;text-decoration:none;font-size:14px}.navlinks{display:flex;align-items:center;gap:12px}.navlinks>a:not(.vx-guide-btn){text-decoration:none;font-size:13px;color:#53615b}.hero{padding:72px 0 48px}.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:30px;align-items:end}.kicker{color:#508269;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.hero h1{margin:10px 0 14px;font-size:clamp(42px,6vw,74px);line-height:.98;letter-spacing:-.055em}.hero p{max-width:720px;margin:0;color:var(--muted);font-size:17px;line-height:1.65}.flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:10px;align-items:center;margin-top:28px;padding:16px;border:1px solid var(--line);border-radius:20px;background:#fff}.flow b{display:grid;place-items:center;min-height:54px;padding:8px;border-radius:14px;background:#f7faf8;text-align:center;font-size:12px;letter-spacing:.03em}.flow i{font-style:normal;color:#80a291}.hero-card{padding:24px;border:1px solid var(--line);border-radius:26px;background:#fff;box-shadow:0 15px 45px rgba(16,20,19,.06)}${sharedStyles}.toc{display:grid;gap:9px;margin-top:16px}.toc a{display:flex;justify-content:space-between;padding:12px 13px;border:1px solid var(--line);border-radius:14px;text-decoration:none;color:#425049;font-size:13px}.section{padding:32px 0 64px;scroll-margin-top:88px}.section-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.section-head h2{margin:4px 0 0;font-size:34px;letter-spacing:-.035em}.section-head p{max-width:560px;margin:0;color:var(--muted);line-height:1.55;font-size:14px}.guide-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.guide-card{padding:26px;border:1px solid var(--line);border-radius:26px;background:#fff;box-shadow:0 10px 30px rgba(16,20,19,.045)}.guide-steps{display:grid;gap:12px}.guide-step{display:grid;grid-template-columns:34px 1fr;gap:12px}.guide-step>span{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--soft);color:var(--green2);font-weight:850;font-size:12px}.guide-step strong{display:block;margin:2px 0 4px;font-size:14px}.guide-step p{margin:0;color:var(--muted);font-size:13.5px;line-height:1.52}.example{padding:22px;border:1px solid var(--line);border-radius:26px;background:linear-gradient(145deg,#fff,#f7faf8)}.example h3{margin:0 0 14px;font-size:20px}.quote{padding:13px 14px;border-radius:16px;background:#101614;color:#eaf3ee;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55}.rows{display:grid;gap:9px;margin-top:14px}.row{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid #e8eeea;font-size:13px}.row span{color:var(--muted)}.positive{color:var(--green2);font-weight:800}.negative{color:var(--red);font-weight:800}.note{margin-top:14px;padding:13px 14px;border-radius:15px;background:#fff8ea;color:#6c5b37;font-size:12px;line-height:1.5}.quick{margin:0 auto 80px;padding:28px;border-radius:28px;background:#0f1d17;color:#f5faf7}.quick h2{margin:0 0 12px;font-size:28px}.quick p{margin:0;color:#b9c9c0;line-height:1.6}.quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px}.quick-item{padding:16px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.04)}.quick-item strong{display:block;margin-bottom:6px;font-size:13px}.quick-item span{color:#b9c9c0;font-size:12px;line-height:1.5}.footer{padding:24px 0 40px;border-top:1px solid var(--line);color:#75817b;font-size:12px}@media(max-width:820px){.hero-grid,.guide-grid,.quick-grid{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}.navlinks>a:not(.vx-guide-btn){display:none}.flow{grid-template-columns:1fr}.flow i{transform:rotate(90deg);text-align:center}.wrap{width:min(100% - 32px,1120px)}.hero{padding-top:48px}.section{padding-bottom:52px}}
</style></head><body>
<header class="topbar"><div class="wrap nav"><a class="brand" href="/">VIXALE</a><div class="navlinks"><a href="/trading-systems">Trading Systems</a><a class="vx-guide-btn" href="${PDF_ROUTE}" download>Download PDF</a></div></div></header>
<main><section class="hero"><div class="wrap hero-grid"><div><div class="kicker">Beginner execution guide</div><h1>How to Trade Vixale</h1><p>Use this guide to understand where each instruction appears, what you execute in your broker platform, and what you monitor afterward — without exposing the proprietary rules that generate Vixale signals.</p><div class="flow"><b>VIXALE SIGNAL</b><i>→</i><b>YOUR BROKER</b><i>→</i><b>POSITION MANAGEMENT</b></div></div><aside class="hero-card"><div class="kicker">Trading Guide</div><div class="toc"><a href="#day-trading"><span>Prime / Edge</span><b>Day Trading</b></a><a href="#swing-trading"><span>Active Portfolio</span><b>Swing</b></a><a href="#options"><span>Straddles</span><b>Options</b></a></div><div class="vx-guide-actions" style="margin-top:16px"><a class="vx-guide-btn primary" href="${PDF_ROUTE}" download>Download Trading Guide (PDF)</a></div></aside></div></section>
<section class="section" id="day-trading"><div class="wrap"><div class="section-head"><div><div class="kicker">Prime / Edge · Day Trading</div><h2>Receive. Execute. Manage.</h2></div><p>Signals can be seen in Telegram and/or on the Vixale website. Order execution happens in your own broker platform.</p></div><div class="guide-grid"><article class="guide-card"><div class="guide-steps">${steps([["Receive the signal","Watch Telegram and/or the Vixale website for a new Prime or Edge signal."],["Read the levels","Confirm symbol, entry, profit target, quantity, and Stop Ref before sending an order."],["Execute in your broker","Enter at the instructed entry. After the fill, place a sell limit at the published profit target."],["Monitor Stop Ref","The Stop Ref is a close-based reference when specified by the signal — not a simple intrabar touch. Exit according to the published close instruction."]])}</div></article><aside class="example"><h3>AAPL example</h3><div class="quote">BUY 100 AAPL @ $300<br>TGT $302 · STOP REF $299</div><div class="rows"><div class="row"><span>Entry</span><b>100 × $300</b></div><div class="row"><span>Sell limit</span><b>$302</b></div><div class="row"><span>If target fills</span><b class="positive">+$200</b></div><div class="row"><span>If exit fills exactly at $299</span><b class="negative">-$100</b></div></div><div class="note">A close-based exit may fill above or below the reference price. The exact $299 loss example is illustrative only.</div></aside></div></div></section>
<section class="section" id="swing-trading"><div class="wrap"><div class="section-head"><div><div class="kicker">Swing Trading · Active Portfolio</div><h2>Check the portfolio each morning.</h2></div><p>Review the Swing Trading Active Portfolio around 9:45–10:00 AM ET on each trading day.</p></div><div class="guide-grid"><article class="guide-card"><div class="guide-steps">${steps([["Check 9:45–10:00 AM ET","Open the Swing Trading section and review Active Portfolio for additions or removals."],["Enter a new addition","When a new symbol appears in Active Portfolio, enter it at the current market price."],["Apply the risk framework","From your actual entry price, use a +10% profit target and a -5% stop."],["Close removals","If the symbol drops off Active Portfolio on a later day, close it at market as soon as practical rather than waiting for the original target."]])}</div></article><aside class="example"><h3>MSFT example</h3><div class="quote">BUY 100 MSFT @ $50.00<br>TGT $55.00 · STOP $47.50</div><div class="rows"><div class="row"><span>+10% target</span><b class="positive">+$500</b></div><div class="row"><span>-5% stop</span><b class="negative">-$250</b></div><div class="row"><span>Removed, sold @ $51.20</span><b class="positive">+$120</b></div></div><div class="note">A portfolio removal is an exit instruction. Actual market fills can differ from the example price.</div></aside></div></div></section>
<section class="section" id="options"><div class="wrap"><div class="section-head"><div><div class="kicker">Options · Straddles</div><h2>Evening signal. Defined target. Follow updates.</h2></div><p>Watch Telegram and the Vixale Options section between 6:00–8:30 PM ET for a new straddle instruction.</p></div><div class="guide-grid"><article class="guide-card"><div class="guide-steps">${steps([["Watch 6:00–8:30 PM ET","Monitor Telegram and the Options section for a new straddle signal."],["Open the straddle","Use your broker platform to open the specified call and put combination from the published instruction."],["Place a +10% target","Set the profit-taking limit 10% above the total debit paid for the straddle."],["Follow hedge / exit updates","Continue monitoring Telegram and the Options section. Follow any later hedge, adjustment, or exit instruction; the proprietary decision rules remain internal to Vixale."]])}</div></article><aside class="example"><h3>SPY straddle example</h3><div class="quote">1 SPY STRADDLE @ $10.00 TOTAL DEBIT<br>100× multiplier = $1,000 cost</div><div class="rows"><div class="row"><span>+10% target value</span><b>$11.00</b></div><div class="row"><span>Target proceeds</span><b>$1,100</b></div><div class="row"><span>If target fills</span><b class="positive">+$100</b></div></div><div class="note">Options results depend on actual fills, bid/ask spreads, commissions, and the exact contracts specified in the signal.</div></aside></div></div></section>
<section class="wrap quick"><h2>One rule across all Vixale systems</h2><p>Vixale provides the signal or portfolio instruction. You submit and manage the order in your own broker platform. Before submitting, verify symbol, quantity, price, and order type.</p><div class="quick-grid"><div class="quick-item"><strong>Prime / Edge</strong><span>Telegram + website → broker → target → close-based Stop Ref monitoring.</span></div><div class="quick-item"><strong>Swing</strong><span>Active Portfolio at 9:45–10:00 AM ET → new additions → +10% / -5% → close removals.</span></div><div class="quick-item"><strong>Straddles</strong><span>6:00–8:30 PM ET → open straddle → +10% target → follow hedge/exit updates.</span></div></div></section></main>
<footer class="footer"><div class="wrap">Examples are educational and illustrative. Actual fills and P&amp;L can differ because of market movement, slippage, spreads, commissions, and position size.</div></footer></body></html>`;
}

function installGuideMiddleware(app) {
  app.use((req, res, next) => {
    const requestPath = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (isRead && requestPath === GUIDE_PATH) { res.status(200).type("html").send(renderTradingGuideHtml()); return; }
    if (isRead && requestPath === PDF_ROUTE) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="Vixale_Trading_Guide.pdf"');
      res.sendFile(PDF_PATH, (error) => { if (error && !res.headersSent) next(error); });
      return;
    }
    if (isRead && requestPath === SYSTEMS_PATH) {
      const originalSend = res.send.bind(res);
      res.send = function sendWithGuide(body) {
        const contentType = String(res.getHeader("Content-Type") || "");
        if (typeof body === "string" && (!contentType || contentType.includes("html"))) body = injectTradingSystemsGuide(body);
        return originalSend(body);
      };
    }
    next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length","name","prototype","arguments","caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;
    try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(expressFactory) {
  if (typeof expressFactory !== "function" || expressFactory.__vixaleGuideWrapped) return expressFactory;
  function wrappedExpress(...args) { const app = expressFactory(...args); installGuideMiddleware(app); return app; }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleGuideWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleGuideModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = { GUIDE_PATH, PDF_ROUTE, SYSTEMS_PATH, injectTradingSystemsGuide, renderCompactGuidePanel, renderTradingGuideHtml, installGuideMiddleware, wrapExpress };
