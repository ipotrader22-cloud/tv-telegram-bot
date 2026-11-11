# VIXALE Website — November 11, 2026 — same-day news + clean quote display

## Verified production deployment

At owner's request, PR #397 changed the Swing Active Portfolio Research Note
to prioritize the live November 11 NYSE trading-session company news and,
only if there is no verified article for that session, show the most recently
available relevant Google Finance-linked company news. Older stories retain
their source and genuine publication date/time or an explicitly approximate
Google Finance date and are visibly labelled "Earlier news." This avoids
the previous false impression that no company news could be shown while
today's session was active.

The Active Portfolio Current-price cells no longer expose
`FRESH_MINUTE_BAR · GOOGLE_FINANCE_CHART_1M · completed 1-minute close · ...`
or other technical quote labels. The existing authenticated API retains
source, exact quote timestamp, freshness and delay; page still shows
`—` and null P&L on missing/stale quotes. Intraday valuation logic is
unchanged.

- PR: #397, merged to `main` as
  `f54d09831656be8b7fc11e636591e5d92ecfa337`.
- Render production service `srv-d86vh7j7uimc73ao479g`, deployment
  `dep-dbqc4a1srm7s738a7330`, exact same commit SHA.
- Render status **LIVE** at 2026-11-11T19:30:46.613831Z.
  Logs confirm successful build, `npm start`, app listening on port 10000.
- GitHub CI Swing Source Rollout run `43087581940`: SUCCESS.
- GitHub CI Production EN/RU Browser QA run `43087581919`: SUCCESS.
- Previous CI attempt failed only because an older HTML test expected
  verbose quote-provenance text to remain displayed; its assertion was
  updated to verify intentional hiding while retaining stale quote handling.
- No Render tier, environment variables, credentials, databases, writer,
  trading algorithm, strategy, signal, broker, or execution logic changed.

## Implementation and boundary

Changed application files:
- `lib/swing-company-news.js`: select today's NYSE session once 09:30 ET
  is reached; before open/holidays/weekends select last completed session.
  Prefer matching articles dated to that selected session. If none,
  choose the latest available relevant Google Finance cards with verified
  publisher timestamp where available; otherwise approximate, explicitly
  dated relative age. Older articles carry `news_is_older`.
- `lib/swing-leaders-core.js`: show "Earlier news" labels for prior dates
  and render invisible `vx-valuation-evidence` marker rather than verbose
  quote/source strings under Current.
- `website_swing_active_model_pnl.js`: keep marker hidden after 60-second
  auto-refresh, and show news fallback labels consistently.
- `tests/test_swing_company_news.js`, `tests/test_issue388_production_intraday.js`
  add/adjust same-day date, holiday, older-news, provider hiding, and
  stale-price/immutable-model regression coverage.
- `docs/VECO_DEVELOPER_HANDBOOK.md` documents contract and rollback.

All 518 research tickers, nine-factor rankings, immutable 10:00 ET
decisions, entry prices, portfolio model sizing, risk/trading logic,
historical ledgers, broker/TWS, Telegram, emails and authorization/access
middleware remain untouched.

## Verification limit

A supplied authenticated screenshot at 14:20 ET before PR #397 demonstrated
that AIZ quote was temporarily UNAVAILABLE; independent Render valuation
logs at 14:20:26 ET then showed all four open tickers fresh, including AIZ
valuation $321.74 and normalized P&L -$8.70. That incident did not require
changing valuation calculations.

Production deployment is verified by exact Render SHA and health; signed-in
postdeploy English/Russian page and API news readback remain **UNVERIFIED** in
this session because the attached browser tab cannot be navigated or
reloaded from Chat mode. The initial Google Finance page may provide only
a limited number of recent cards, and publisher timestamps are sometimes
approximate. It is not truthful to claim exhaustive news coverage or exact
publish times when the publisher date could not be obtained.

Rollback: narrowly revert PR #397 through a new PR and normal Render
deployment. Do not roll back Issue #388's valuation logic or select a
different trading model/source to undo these UI changes. Documentation-only
`[skip render]` merge after this release may leave GitHub main one
documentation commit ahead of the exact live application SHA.
