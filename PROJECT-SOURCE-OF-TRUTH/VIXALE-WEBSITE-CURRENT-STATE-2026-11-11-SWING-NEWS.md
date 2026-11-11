# VIXALE Website — production status, November 11, 2026 — Swing Company News

## Source-of-truth and exact deployed code

This record supersedes the November 11 Issue #388 deployment manifest for website
release-status claims; that file remains the authoritative historical handoff
for the separate read-only intraday valuation rollout.

- GitHub PR #395 merged to main as
  `e97c123c2e7fe22a77c008e0d3321ec2cf695fc2`.
- Render production web service `tv-telegram-bot`
  (`srv-d86vh7j7uimc73ao479g`) automatically deployed that exact SHA as
  `dep-dbqbtc9srm7s7389nv4g`, reporting **LIVE** at
  `2026-11-11T19:16:10.597418Z`.
- Render logs confirm a successful build, `npm start`, port 10000 and
  the live-service announcement. No new Render tier, service, environment
  variable, secret or database was created or modified.
- Swing Source Rollout GitHub CI run `43085163256`: **SUCCESS** for
  PR #395 final head `30a3b1c96ee2e3afe91bf51da106b3365165f267`.
- Production EN/RU Browser QA run `43085163253`: **SUCCESS** on the
  same final head. Prior #388 valuation production CI remains recorded in
  the historical 2026-11-11 Issue #388 manifest.

## User-requested Research Note replacement

The user asked to remove nine-factor scoring, morning quote timestamps
and the `Reviewed` line from visible Active Portfolio Research Notes and
show **the company's latest news summarized for the previous trading day
with the news posting date/time** instead.

PR #395 adds an isolated read-only Google Finance news reader
(`lib/swing-company-news.js`) for Engine 2 Swing active positions.
The website's existing authenticated API and HTML now expose
`company_news`, `company_news_status` and
`company_news_session_date`; existing `brief_note` remains untouched as
immutable morning Public Feed evidence but is not rendered in the Research
Note column when the news overlay exists. News is also refreshed by the
existing 60-second authenticated browser poll without reloading the page.

For each exact ticker/exchange:
1. Compute the previous NYSE trading date in America/New_York using the
   existing session calendar.
2. Read the public Google Finance quote page's News stories cards and
   filter out headlines not naming that company or ticker.
3. For selected linked articles, use the publisher's ISO publication
   metadata if available. Where unavailable, accept a Google Finance
   "N hours ago" timestamp only if its whole uncertainty range falls on
   the prior NYSE trading date; visibly label its displayed ET time
   **approximate**.
4. Show at most two distinct relevant articles, with short descriptions
   grounded in the publisher's meta description or, when missing, its
   original headline, plus HTTPS article link, source and ET post time.
5. For unavailable/unverifiable news explicitly show that status rather
   than invent a summary, publication time, company event or price.

The Google Finance initial page exposes only a handful of newest news
cards: completeness of the previous day's entire news volume is
**not guaranteed**. Some publisher pages block metadata; approximate
Google Finance relative age is explicitly marked and is not a claimed
exact publication timestamp. The source text remains in the article's
original language; auth and Russian navigation/access protections are
unchanged.

## Changed files in PR #395

- `lib/swing-company-news.js` (new, read-only)
- `lib/swing-leaders.js` (ENGINE2-only news overlay)
- `lib/swing-leaders-core.js` (safe sourced rendering)
- `website_swing_active_model_pnl.js` (safe DOM news refresh)
- `tests/test_swing_company_news.js` (provenance/calendar/news regressions)
- `.github/workflows/swing-source-rollout.yml` (CI gate)
- `docs/VECO_DEVELOPER_HANDBOOK.md` (contract/rollback)

Temporary public-news probes were removed from the PR before merge.

## Scope and security

No change to 518 research tickers, nine-factor scoring, 10:00 ET freeze,
entries/exits/stops/targets, broker/TWS, Telegram, UAM, immutable
morning Public Feed source data, Sheet writer, historical Equity History,
daily staging cron or legacy Swing source logic. The existing
`VIXALE_SWING_SOURCE=ENGINE2` website source selection is unchanged.
The legacy `brief_note` remains displayed only on the LEGACY path.

## Verification boundaries

Verified: exact GitHub PR and SHA, CI tests, source-level news parsing of
the real public Google Finance page for AIZ/VTRS in GitHub-hosted
diagnostics, and exact Render LIVE production deployment SHA.

**Not verified in the authenticated live production browser/API:** This
connected Chat browser cannot reload or navigate the saved signed-in
tab. It still represents an older loaded document and cannot independently
confirm the new Research Note HTML, its live publisher timestamps or
news API fields. Do not infer successful browser refresh from GitHub CI
or Render LIVE alone. Production intraday valuation customer-page
parity, separately recorded in Issue #388, also remains explicitly
unverified unless a fresh authenticated request is observed.

Production acceptance procedure: reload the logged-in EN and RU Swing
pages, verify the Research Note displays sourced company news/posting
time or an honest no-verified-news status, compare authenticated
`/api/swing-leaders` for news fields and unchanged model marks, observe
a 60-second automatic refresh, and confirm no exposure to anonymous users.
Do not claim a passing live authenticated comparison without that evidence.

## Rollback

Revert PR #395 alone and deploy the resulting `main` commit, verifying the
exact Render deployment. This retains PR #393's independent intraday
valuation fix and leaves the trading model untouched. No data rollback or
environment change is required. Documentation-only commits may use
`[skip render]`; in that case GitHub main's tip differs from the actual
live application SHA by a docs-only commit.
