from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return out

# 1) Options: bare canonical path becomes public; protected content moves to a viewer sub-route.
path = Path("website_options_canonical_refinement.js")
text = path.read_text()
text = replace_once(
    text,
    'const OPTIONS_PATH = "/trading-systems/options";\nconst DASHBOARD_PATH = "/dashboard";',
    'const OPTIONS_PATH = "/trading-systems/options";\nconst OPTIONS_VIEWER_PATH = `${OPTIONS_PATH}/viewer`;\nconst DASHBOARD_PATH = "/dashboard";',
    "options viewer constant",
)
text = replace_once(
    text,
    'if (!isRead || (originalPath !== OPTIONS_PATH && originalPath !== DASHBOARD_PATH)) return next();',
    'if (!isRead || (originalPath !== OPTIONS_VIEWER_PATH && originalPath !== DASHBOARD_PATH)) return next();',
    "options middleware scope",
)
text = replace_once(
    text,
    'if (originalPath === OPTIONS_PATH) {',
    'if (originalPath === OPTIONS_VIEWER_PATH) {',
    "options protected rewrite",
)
text = replace_once(
    text,
    'module.exports = { OPTIONS_PATH, DASHBOARD_PATH, OPTIONS_CANONICAL_URL, OPTION_JOURNAL_RANGE, OPTIONS_PAGE_MARKER,',
    'module.exports = { OPTIONS_PATH, OPTIONS_VIEWER_PATH, DASHBOARD_PATH, OPTIONS_CANONICAL_URL, OPTION_JOURNAL_RANGE, OPTIONS_PAGE_MARKER,',
    "options exports",
)
path.write_text(text)

# 2) Trading Systems: make the canonical Options page a useful public explainer.
path = Path("website_trading_systems_product_refinement.js")
text = path.read_text()
text = replace_once(
    text,
    'const OPTIONS_PATH = `${SYSTEMS_PATH}/options`;\nconst STYLE_ID',
    'const OPTIONS_PATH = `${SYSTEMS_PATH}/options`;\nconst OPTIONS_VIEWER_PATH = `${OPTIONS_PATH}/viewer`;\nconst STYLE_ID',
    "product viewer constant",
)
text = replace_once(
    text,
    '["Access","Viewer access required for journal details"]',
    '["Access","Public overview; viewer access required for journal details"]',
    "hub options access copy",
)
new_options_function = '''function renderOptionsPage(){const actions=`<a class="vx-systems-btn primary" href="/#password-access">Request Free Access</a><a class="vx-systems-btn" href="${OPTIONS_VIEWER_PATH}">Already have access? Open Options</a>`;return `<section class="vx-systems-page" ${PAGE_MARKER}="${OPTIONS_PATH}"><div class="wrap">${hero(true,"Options","Review the Options record before opening the viewer.","Vixale Options is a read-only evidence page built from the owner-entered Option Journal. Journal details remain protected behind the existing viewer access.",actions)}<section class="vx-detail-single">${card("Options · Viewer evidence","What you can review after access","Options records are entered and updated manually by the owner and stay separate from the Day Trading and Swing Trading records.",["Owner-entered open and closed Option Journal records","Closed-only realized P&L equity grouped by Exit Date","Protected owner-provided brokerage screenshots when available","The same viewer session used by the Day Trading dashboard"],OPTIONS_VIEWER_PATH,"Open protected Options viewer",true)}</section>${performanceStrip()}${footer()}</div></section>`;}'''
text = regex_once(
    text,
    r'function renderOptionsPage\(\)\{.*?\}\nfunction renderFor',
    new_options_function + '\nfunction renderFor',
    "public options renderer",
)
text = replace_once(
    text,
    'module.exports={SYSTEMS_PATH,DAY_PATH,SWING_PATH,OPTIONS_PATH,STYLE_ID,',
    'module.exports={SYSTEMS_PATH,DAY_PATH,SWING_PATH,OPTIONS_PATH,OPTIONS_VIEWER_PATH,STYLE_ID,',
    "product exports",
)
path.write_text(text)

# 3) Services: add a no-price commercial overview while preserving existing forms.
path = Path("website_public_ia_refinement.js")
text = path.read_text()
text = replace_once(
    text,
    'const SERVICES_INTRO_MARKER = "vx-services-intro";\n',
    'const SERVICES_INTRO_MARKER = "vx-services-intro";\nconst SERVICES_OFFER_MARKER = "vx-services-offer";\nconst SERVICES_OFFER_STYLE_ID = "vx-services-offer-style";\n',
    "services constants",
)
insert_after = '''function renderServicesIntro() {
  return `<section class="wrap section ${SERVICES_INTRO_MARKER}" aria-labelledby="vx-services-title"><div class="section-head"><div class="section-kicker">Services</div><h1 id="vx-services-title">Vixale Services</h1><p class="lead">Explore Vixale research, automation, TradingView, and custom development services.</p></div></section>`;
}
'''
services_block = '''
const servicesOfferStyles = `
<style id="${SERVICES_OFFER_STYLE_ID}">
  .${SERVICES_OFFER_MARKER}{max-width:1180px;margin:0 auto;padding:0 24px 44px;box-sizing:border-box}.vx-services-offer-head{max-width:760px}.vx-services-offer-head h2{margin:0;color:#17211d;font-size:clamp(28px,3.4vw,40px);font-weight:520;letter-spacing:-.035em}.vx-services-offer-head p{margin:12px 0 0;color:#56645e;font-size:15px;line-height:1.6}.vx-services-offer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:24px}.vx-services-offer-card{display:flex;min-height:238px;flex-direction:column;padding:24px;border:1px solid #dbe7e0;border-radius:23px;background:#fff;box-shadow:0 14px 38px rgba(24,54,42,.045)}.vx-services-offer-card>span{color:#287153;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.vx-services-offer-card h3{margin:10px 0 0;color:#17211d;font-size:24px;font-weight:550;letter-spacing:-.025em}.vx-services-offer-card p{margin:9px 0 0;color:#56645e;font-size:13.5px;line-height:1.55}.vx-services-offer-card a{display:inline-flex;align-items:center;margin-top:auto;padding-top:18px;color:#176442;font-size:12.5px;font-weight:700;text-decoration:none}.vx-services-boundary{margin-top:16px;padding:16px 18px;border:1px solid #dce8e1;border-radius:17px;background:#f6faf8;color:#4d5c55;font-size:12.8px;line-height:1.55}.vx-services-boundary strong{color:#17211d}@media(max-width:760px){.${SERVICES_OFFER_MARKER}{padding:0 16px 36px}.vx-services-offer-grid{grid-template-columns:1fr}.vx-services-offer-card{min-height:0;padding:21px}}
</style>`;

function injectServicesOfferStyles(html) {
  if (html.includes(`id="${SERVICES_OFFER_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", () => `${servicesOfferStyles}\n</head>`) : `${servicesOfferStyles}${html}`;
}

function renderServicesOffer() {
  return `<section class="${SERVICES_OFFER_MARKER}" aria-labelledby="vx-services-offer-title"><div class="vx-services-offer-head"><h2 id="vx-services-offer-title">Choose the kind of help you need.</h2><p>Start with free read-only access, or use a consultation to define research access, automation setup, or custom development. Custom work is scoped and quoted before it starts.</p></div><div class="vx-services-offer-grid">
    <article class="vx-services-offer-card"><span>Observe</span><h3>Viewer Access</h3><p>Review the public performance evidence and, if approved, use read-only viewer access for the Day Trading and Options evidence pages.</p><a href="/#password-access">Request Free Access →</a></article>
    <article class="vx-services-offer-card"><span>Research</span><h3>Signals &amp; Research Access</h3><p>Discuss the signals and research access currently available for your use case. The consultation clarifies supported scope, delivery/access method, and onboarding next steps.</p><a href="#setup-call">Discuss research access →</a></article>
    <article class="vx-services-offer-card"><span>Setup</span><h3>Automation Setup</h3><p>Get help planning supported TradingView alert, webhook, and automation setup. A setup consultation produces an implementation checklist and identifies any custom work that needs a quote before it starts.</p><a href="#setup-call">Book setup consultation →</a></article>
    <article class="vx-services-offer-card"><span>Build</span><h3>Custom Development</h3><p>Scope a bot, dashboard, or integration around documented requirements. The scoping conversation produces assumptions, deliverables, dependencies, and a quote before development begins.</p><a href="#bot-builder">Request a quote →</a></article>
  </div><div class="vx-services-boundary"><strong>Important boundary:</strong> Vixale does not trade or manage customer brokerage accounts. Services cover read-only access, research, setup assistance, and scoped development.</div></section>`;
}
'''
text = replace_once(text, insert_after, insert_after + services_block, "services offer functions")
text = replace_once(
    text,
    'if (sections.length) result = replaceMainContents(result, [renderServicesIntro(), ...sections].join("\\n\\n"));',
    'if (sections.length) result = replaceMainContents(result, [renderServicesIntro(), renderServicesOffer(), ...sections].join("\\n\\n"));',
    "services offer placement",
)
text = replace_once(
    text,
    'result = normalizeAccessLinksToHome(result);\n  result = replaceAllLiteral(result, "Request Dashboard Access", "Request Free Access");',
    'result = normalizeAccessLinksToHome(result);\n  result = injectServicesOfferStyles(result);\n  result = replaceAllLiteral(result, "Request Dashboard Access", "Request Free Access");',
    "services style injection",
)
text = replace_once(
    text,
    'SERVICES_INTRO_MARKER,\n  refineHomeAccessCopy,',
    'SERVICES_INTRO_MARKER,\n  SERVICES_OFFER_MARKER,\n  SERVICES_OFFER_STYLE_ID,\n  renderServicesOffer,\n  injectServicesOfferStyles,\n  refineHomeAccessCopy,',
    "services exports",
)
path.write_text(text)

# 4) Closed Trades archive: normalize customer-facing event labels only.
path = Path("website_closed_trades_archive.js")
text = path.read_text()
old_pretty = '''function prettyEvent(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\\b\\w/g, letter => letter.toUpperCase())
    .replace(/\\bEod\\b/g, "EOD");
}
'''
new_pretty = '''function prettyEvent(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  const key = text.toUpperCase().replace(/\\s+/g, "_");
  const labels = {
    TP: "Take Profit",
    TARGET: "Take Profit",
    TAKE_PROFIT: "Take Profit",
    CLOSE_STOP: "Stop Loss",
    FLIP_CLOSE: "Stop Loss",
    SL: "Stop Loss",
    STOP_LOSS: "Stop Loss",
    EOD: "End-of-Day Close",
    EOD_CLOSE: "End-of-Day Close",
    END_OF_DAY_CLOSE: "End-of-Day Close",
    EXTERNAL_CLOSE: "Manual Close",
    MANUAL_CLOSE: "Manual Close",
  };
  if (labels[key]) return labels[key];
  return text.replace(/_/g, " ").toLowerCase().replace(/\\b\\w/g, letter => letter.toUpperCase());
}
'''
text = replace_once(text, old_pretty, new_pretty, "archive event labels")
path.write_text(text)

# 5) Options regression: public intro must pass through, protected viewer keeps dashboard auth reuse.
path = Path("tests/test_options_canonical_refinement.js")
text = path.read_text()
text = replace_once(text, '  OPTIONS_PATH,\n  DASHBOARD_PATH,', '  OPTIONS_PATH,\n  OPTIONS_VIEWER_PATH,\n  DASHBOARD_PATH,', "options test import")
text = replace_once(text, 'assert.strictEqual(OPTION_JOURNAL_RANGE, "\'Option Journal\'!A:S");', 'assert.strictEqual(OPTION_JOURNAL_RANGE, "\'Option Journal\'!A:S");\nassert.strictEqual(OPTIONS_VIEWER_PATH, `${OPTIONS_PATH}/viewer`);', "options viewer assertion")
text = replace_once(
    text,
    '  const req = { method: "GET", path: OPTIONS_PATH, url: `${OPTIONS_PATH}?key=test`, _parsedUrl: {} };',
    '  const publicReq = { method: "GET", path: OPTIONS_PATH, url: OPTIONS_PATH, _parsedUrl: {} };\n  const publicRes = responseHarness();\n  let publicNextCalls = 0;\n  middleware(publicReq, publicRes, () => { publicNextCalls += 1; });\n  assert.strictEqual(publicNextCalls, 1);\n  assert.strictEqual(publicReq.url, OPTIONS_PATH, "public Options overview must not be rewritten through dashboard auth");\n  publicRes.send("<p>public Options overview shell</p>");\n  assert.strictEqual(publicRes.sent, "<p>public Options overview shell</p>");\n  assert.strictEqual(loadCalls, 0, "public Options overview must not read protected Option Journal equity");\n\n  const req = { method: "GET", path: OPTIONS_VIEWER_PATH, url: `${OPTIONS_VIEWER_PATH}?key=test`, _parsedUrl: {} };',
    "options public/viewer route test",
)
text = replace_once(text, '  const redirectReq = { method: "GET", path: OPTIONS_PATH, url: OPTIONS_PATH };', '  const redirectReq = { method: "GET", path: OPTIONS_VIEWER_PATH, url: OPTIONS_VIEWER_PATH };', "options unauthorized viewer test")
path.write_text(text)

# 6) Trading Systems regression: the public Options page explains evidence and points to the protected viewer.
path = Path("tests/test_trading_systems_product_refinement.js")
text = path.read_text()
text = replace_once(
    text,
    'const {SYSTEMS_PATH,DAY_PATH,SWING_PATH,OPTIONS_PATH,STYLE_ID,PAGE_MARKER,refineTradingSystemsProductPage}=require("../website_trading_systems_product_refinement");',
    'const {SYSTEMS_PATH,DAY_PATH,SWING_PATH,OPTIONS_PATH,OPTIONS_VIEWER_PATH,STYLE_ID,PAGE_MARKER,refineTradingSystemsProductPage}=require("../website_trading_systems_product_refinement");',
    "product test import",
)
text = replace_once(text, 'assert(hub.includes("Viewer access required for journal details"));', 'assert(hub.includes("Public overview; viewer access required for journal details"));', "hub access assertion")
text = replace_once(
    text,
    'assert(options.includes("Options Straddles")&&options.includes(\'href="/trading-systems/options">Open Options</a>\'));\nassert(!options.includes(\'href="/options"\')&&!options.includes("Vixale Prime")&&!options.includes("Vixale Swing System"));',
    'assert.strictEqual(OPTIONS_VIEWER_PATH, `${OPTIONS_PATH}/viewer`);\nassert(options.includes("owner-entered Option Journal"));\nassert(options.includes("Closed-only realized P&L equity grouped by Exit Date"));\nassert(options.includes("Protected owner-provided brokerage screenshots when available"));\nassert(options.includes(`href="${OPTIONS_VIEWER_PATH}">Already have access? Open Options</a>`));\nassert(options.includes(`href="${OPTIONS_VIEWER_PATH}">Open protected Options viewer →</a>`));\nassert(options.includes(\'href="/#password-access">Request Free Access</a>\'));\nassert(!options.includes("Options Straddles")&&!options.includes("Vixale Prime")&&!options.includes("Vixale Swing System"));',
    "public options assertions",
)
path.write_text(text)

# 7) Services regression: commercial paths are explicit, no prices invented.
path = Path("tests/test_public_ia_refinement.js")
text = path.read_text()
text = replace_once(text, '  SERVICES_INTRO_MARKER,\n  refineHomeAccessCopy,', '  SERVICES_INTRO_MARKER,\n  SERVICES_OFFER_MARKER,\n  refineHomeAccessCopy,', "services test import")
text = replace_once(
    text,
    'assert(services.includes(\'<h1 id="vx-services-title">Vixale Services</h1>\'));',
    'assert(services.includes(\'<h1 id="vx-services-title">Vixale Services</h1>\'));\nassert(services.includes(`class="${SERVICES_OFFER_MARKER}"`));\nfor (const heading of ["Viewer Access", "Signals &amp; Research Access", "Automation Setup", "Custom Development"]) assert(services.includes(heading));\nassert(services.includes(\'href="/#password-access">Request Free Access →</a>\'));\nassert(services.includes(\'href="#setup-call">Discuss research access →</a>\'));\nassert(services.includes(\'href="#setup-call">Book setup consultation →</a>\'));\nassert(services.includes(\'href="#bot-builder">Request a quote →</a>\'));\nassert(services.includes("scope, delivery/access method, and onboarding next steps"));\nassert(services.includes("assumptions, deliverables, dependencies, and a quote"));\nassert(services.includes("Vixale does not trade or manage customer brokerage accounts"));\nassert(!services.includes("$99") && !services.includes("per month") && !services.includes("monthly price"));',
    "services commercial assertions",
)
path.write_text(text)

# 8) Closed Trades regression: raw events stay raw in data; rendered labels are customer-facing.
path = Path("tests/test_closed_trades_archive.js")
text = path.read_text()
text = replace_once(
    text,
    'assert(markup.includes("EOD Close"));',
    'assert(markup.includes("Take Profit"));\nassert(markup.includes("Stop Loss"));\nassert(markup.includes("End-of-Day Close"));\nassert(!markup.includes(">Close Stop<"));\nassert(!markup.includes(">EOD Close<"));',
    "archive display label assertions",
)
path.write_text(text)

print("PR4 targeted patch applied")
