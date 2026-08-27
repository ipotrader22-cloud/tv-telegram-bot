from pathlib import Path

APP = Path('app.js')
HANDBOOK = Path('docs/VECO_DEVELOPER_HANDBOOK.md')

source = APP.read_text(encoding='utf-8')
start = source.find('function renderTradingSystemsHtml()')
if start < 0:
    raise SystemExit('renderTradingSystemsHtml() not found')
end = source.find('\nfunction ', start + len('function renderTradingSystemsHtml()'))
if end < 0:
    raise SystemExit('Unable to locate end of renderTradingSystemsHtml()')
block = source[start:end]

if 'id="swing-trading"' in block:
    raise SystemExit('Swing Trading hierarchy already appears to be applied')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

block = replace_once(
    block,
    '<meta name="description" content="Explore Vixale systems for stocks, futures, and options, including Vixale Prime, Vixale Edge, Vixale Pairs, Vixale Futures, and the live Vixale Options Desk." />',
    '<meta name="description" content="Explore Vixale Day Trading and Swing Trading systems, with detailed market coverage for stocks, futures, and options." />',
    'Trading Systems meta description',
)

old_hero_panel = '''        <div class="hero-panel">
          <h3>System map</h3>
          <div class="system-map">
            <a class="system-map-row" href="#stocks" aria-label="View Vixale stock systems"><span>Stocks</span><div>Prime and Edge are live. Vixale Pairs is in development.</div><span class="status-pill">2 Live</span></a>
            <a class="system-map-row" href="#futures" aria-label="View Vixale futures systems"><span>Futures</span><div>Contract-specific systematic workflows are being developed separately.</div><span class="status-pill soon">Coming Soon</span></a>
            <a class="system-map-row" href="#options" aria-label="View Vixale Options Desk"><span>Options</span><div>Human-directed swing and intraday signals with a structured journal.</div><span class="status-pill options">Live</span></a>
          </div>
          <div class="small-note">Each market uses its own execution, tracking, and risk framework rather than forcing every strategy into one model.</div>
        </div>'''

new_hero_panel = '''        <div class="hero-panel">
          <h3>Choose your trading horizon</h3>
          <div class="system-map">
            <a class="system-map-row" href="#day-trading" aria-label="View Vixale Day Trading systems"><span>Day Trading</span><div>Prime, Edge, and Straddles are grouped as intraday systems.</div><span class="status-pill">Intraday</span></a>
            <a class="system-map-row" href="#swing-trading" aria-label="View Vixale Swing Trading systems"><span>Swing Trading</span><div>Multi-session strategies with ATR or percentage targets and daily-close risk management.</div><span class="status-pill swing">Multi-session</span></a>
          </div>
          <div class="small-note">Swing Trading stays in one clear product section. Daily and weekly timeframes can be part of a strategy without becoming separate navigation categories.</div>
        </div>'''
block = replace_once(block, old_hero_panel, new_hero_panel, 'Trading Systems hero panel')

css_marker = '''    .market-nav-shell {
'''
css_insert = '''    .status-pill.swing {
      border-color: var(--blue-line);
      background: var(--blue-soft);
      color: var(--blue-ink);
    }

    .horizon-section {
      position: relative;
      border-top: 1px solid rgba(215,225,219,.72);
      padding-top: 34px;
    }
    .horizon-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .horizon-card {
      display: flex;
      min-height: 214px;
      flex-direction: column;
      padding: 22px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(255,255,255,.82);
      box-shadow: var(--shadow-soft);
      transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
    }
    .horizon-card:hover {
      transform: translateY(-2px);
      border-color: #bfead5;
      box-shadow: 0 18px 44px rgba(16,20,19,.08);
    }
    .horizon-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 22px;
    }
    .horizon-kicker {
      color: var(--muted-2);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .horizon-card h3 { margin-bottom: 10px; font-size: 27px; }
    .horizon-card p { margin: 0; color: var(--muted); font-size: 14.5px; line-height: 1.6; }
    .horizon-link { margin-top: auto; padding-top: 22px; color: var(--green-dark); font-size: 13px; font-weight: 500; }

    .swing-intro {
      display: grid;
      grid-template-columns: 1.04fr .96fr;
      gap: 22px;
      align-items: end;
    }
    .swing-traits {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .swing-trait {
      min-height: 74px;
      display: flex;
      align-items: center;
      padding: 14px;
      border: 1px solid var(--blue-line);
      border-radius: 18px;
      background: rgba(238,244,255,.72);
      color: #31435f;
      font-size: 13.5px;
      line-height: 1.4;
    }
    .swing-placeholder {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1.08fr .92fr;
      gap: 20px;
      padding: 26px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: linear-gradient(135deg, rgba(255,255,255,.92), rgba(238,244,255,.72));
      box-shadow: var(--shadow-soft);
    }
    .swing-placeholder h3 { margin-top: 8px; font-size: 25px; }
    .swing-placeholder p { margin: 0; color: var(--muted); font-size: 14.5px; line-height: 1.62; }
    .swing-rule-grid { display: grid; gap: 10px; }
    .swing-rule {
      padding: 13px 14px;
      border: 1px solid rgba(213,225,255,.92);
      border-radius: 17px;
      background: rgba(255,255,255,.72);
    }
    .swing-rule strong { display: block; margin-bottom: 4px; color: var(--ink); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .055em; }
    .swing-rule span { color: var(--muted); font-size: 13.5px; line-height: 1.45; }

'''
block = replace_once(block, css_marker, css_insert + css_marker, 'Swing Trading CSS insertion')

html_marker = '''    <div class="market-nav-shell">
'''
new_sections = '''    <section class="wrap section horizon-section" id="day-trading">
      <div class="section-head">
        <div class="market-kicker"><span class="market-label">Day Trading</span><span class="status-pill">Intraday Systems</span></div>
        <h2>Day Trading Systems</h2>
        <p class="lead">Prime, Edge, and Straddles sit under one intraday family. The detailed market sections below remain available for execution, tracking, and product-specific context.</p>
      </div>

      <div class="horizon-grid">
        <a class="horizon-card" href="#stocks" aria-label="View Prime details">
          <div class="horizon-card-top"><span class="horizon-kicker">Day Trading</span><span class="status-pill">Prime</span></div>
          <h3>Prime</h3>
          <p>Confirmation-first intraday trading with the existing stock-system detail and live tracking preserved below.</p>
          <span class="horizon-link">View Prime details →</span>
        </a>
        <a class="horizon-card" href="#stocks" aria-label="View Edge details">
          <div class="horizon-card-top"><span class="horizon-kicker">Day Trading</span><span class="status-pill options">Edge</span></div>
          <h3>Edge</h3>
          <p>Pullback-oriented intraday trading with the existing stock-system detail and working-order workflow preserved below.</p>
          <span class="horizon-link">View Edge details →</span>
        </a>
        <a class="horizon-card" href="#options" aria-label="View Straddles and Options Desk details">
          <div class="horizon-card-top"><span class="horizon-kicker">Day Trading</span><span class="status-pill soon">Options</span></div>
          <h3>Straddles</h3>
          <p>Options-based intraday strategies grouped under Day Trading, with the existing Options Desk retained as the detailed market view.</p>
          <span class="horizon-link">View Options Desk →</span>
        </a>
      </div>
    </section>

    <section class="wrap section horizon-section" id="swing-trading">
      <div class="swing-intro">
        <div class="section-head" style="margin-bottom:0;">
          <div class="market-kicker"><span class="market-label">Swing Trading</span><span class="status-pill swing">Multi-session</span></div>
          <h2>Capture larger moves across multiple sessions.</h2>
          <p class="lead">Systematic strategies designed to capture larger market moves over multiple sessions, with targets and risk managed using end-of-day rules.</p>
        </div>
        <div class="swing-traits" aria-label="Swing Trading characteristics">
          <div class="swing-trait">Multi-session positions</div>
          <div class="swing-trait">ATR / % based targets</div>
          <div class="swing-trait">Defined risk</div>
          <div class="swing-trait">Daily-close management</div>
        </div>
      </div>

      <div class="swing-placeholder">
        <div>
          <span class="horizon-kicker">Strategy profiles</span>
          <h3>One Swing Trading section. No Daily / Weekly split.</h3>
          <p>Each strategy will appear here by its own system name and rules. Daily or weekly inputs can remain part of the strategy logic without becoming separate public product categories.</p>
          <p class="small-note">The first strategy profile can be added here once its public specification is finalized.</p>
        </div>
        <div class="swing-rule-grid">
          <div class="swing-rule"><strong>Targets</strong><span>ATR or percentage based. Evaluated on daily close.</span></div>
          <div class="swing-rule"><strong>Stop loss</strong><span>Evaluated on daily close.</span></div>
          <div class="swing-rule"><strong>Holding period</strong><span>Designed for positions that can remain open across multiple sessions.</span></div>
        </div>
      </div>
    </section>

'''
block = replace_once(block, html_marker, new_sections + html_marker, 'Trading horizon sections')
block = replace_once(block, 'aria-label="Trading system categories"', 'aria-label="Market coverage"', 'Market navigation aria label')

block = replace_once(
    block,
    '      .page-hero-inner, .system-grid, .product-card, .validation-box, .access { grid-template-columns: 1fr; }',
    '      .page-hero-inner, .system-grid, .product-card, .validation-box, .access, .horizon-grid, .swing-intro, .swing-placeholder { grid-template-columns: 1fr; }',
    'Responsive grid rule',
)
block = replace_once(
    block,
    '      .page-hero-inner, .system-card, .product-card, .validation-box, .access { padding: 22px; border-radius: 26px; }',
    '      .page-hero-inner, .system-card, .product-card, .validation-box, .access, .swing-placeholder { padding: 22px; border-radius: 26px; }',
    'Mobile padding rule',
)

source = source[:start] + block + source[end:]
APP.write_text(source, encoding='utf-8')

handbook = HANDBOOK.read_text(encoding='utf-8')
handbook_marker = '## Public Trading Systems information architecture (2026-08-27)'
if handbook_marker not in handbook:
    handbook = handbook.rstrip() + f'''\n\n{handbook_marker}\n\n- `/trading-systems` is presented horizon-first at the public product level: **Day Trading** and **Swing Trading**.\n- **Day Trading** groups the public system families **Prime**, **Edge**, and **Straddles**. Existing Stocks / Futures / Options sections remain below as detailed market coverage and should keep their established deep links.\n- **Swing Trading** is a single public category. Do not split the navigation into Daily and Weekly products; timeframe inputs belong inside each strategy profile.\n- Swing strategy presentation can show multi-session holding, ATR / percentage targets, defined risk, and daily-close target / stop evaluation when those rules are part of the approved public strategy specification.\n- This information-architecture change is website-only. It does not change signal generation, strategy logic, order routing, TWS / IBKR execution, risk-engine behavior, or live data sources.\n'''
    HANDBOOK.write_text(handbook, encoding='utf-8')

print('Applied Swing Trading public information architecture.')
