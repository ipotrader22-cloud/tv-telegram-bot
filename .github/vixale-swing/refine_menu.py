from pathlib import Path

path = Path('app.js')
source = path.read_text(encoding='utf-8')
start = source.find('function renderTradingSystemsHtml()')
if start < 0:
    raise SystemExit('renderTradingSystemsHtml() not found')
end = source.find('\nfunction ', start + 32)
if end < 0:
    raise SystemExit('Unable to locate end of renderTradingSystemsHtml()')
block = source[start:end]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

# Place the horizon category menu immediately after the hero so it acts as the
# Trading Systems sub-navigation rather than a market-only menu.
hero_to_day = '''    </section>

    <section class="wrap section horizon-section" id="day-trading">'''
horizon_menu = '''    </section>

    <div class="market-nav-shell">
      <div class="wrap">
        <nav class="market-nav" aria-label="Trading system categories">
          <a class="market-link" href="#day-trading"><strong>Day Trading</strong><em>Prime · Edge · Straddles</em></a>
          <a class="market-link" href="#swing-trading"><strong>Swing Trading</strong><em>Multi-session</em></a>
          <a class="market-link options" href="#market-coverage"><strong>Market Coverage</strong><em>Stocks · Futures · Options</em></a>
        </nav>
      </div>
    </div>

    <section class="wrap section horizon-section" id="day-trading">'''
block = replace_once(block, hero_to_day, horizon_menu, 'Horizon navigation insertion')

old_market_nav = '''    <div class="market-nav-shell">
      <div class="wrap">
        <nav class="market-nav" aria-label="Market coverage">
          <a class="market-link" href="#stocks"><strong>Stocks</strong><em>2 Live · 1 Soon</em></a>
          <a class="market-link" href="#futures"><strong>Futures</strong><em>In Development</em></a>
          <a class="market-link options" href="#options"><strong>Options</strong><em>Live Desk</em></a>
        </nav>
      </div>
    </div>

    <section class="wrap section market-section" id="stocks">'''
new_market_nav = '''    <section class="wrap section horizon-section" id="market-coverage">
      <div class="section-head">
        <div class="market-kicker"><span class="market-label">Market Coverage</span></div>
        <h2>System details by market.</h2>
        <p class="lead">The product hierarchy above is organized by trading horizon. The detailed sections below keep the existing market-specific execution, tracking, and transparency information.</p>
      </div>
      <nav class="market-nav" aria-label="Market coverage">
        <a class="market-link" href="#stocks"><strong>Stocks</strong><em>2 Live · 1 Soon</em></a>
        <a class="market-link" href="#futures"><strong>Futures</strong><em>In Development</em></a>
        <a class="market-link options" href="#options"><strong>Options</strong><em>Live Desk</em></a>
      </nav>
    </section>

    <section class="wrap section market-section" id="stocks">'''
block = replace_once(block, old_market_nav, new_market_nav, 'Market coverage navigation move')

source = source[:start] + block + source[end:]
path.write_text(source, encoding='utf-8')
print('Refined Trading Systems category menu placement.')
