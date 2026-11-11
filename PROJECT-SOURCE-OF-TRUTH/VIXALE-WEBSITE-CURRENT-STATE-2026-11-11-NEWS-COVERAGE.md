# VIXALE Website — November 11, 2026 — Swing News Coverage Repair

## Verified production deployment

GitHub PR #399 merged to `main` at
`679dc99203d00f3793f5828f1705ded1057dd093`.
The normal Render auto-deploy for `tv-telegram-bot`
(service `srv-d86vh7j7uimc73ao479g`, Trader's workspace)
was `dep-dbqci61srm7s738b18vg` and reached **LIVE**
at `2026-11-11T20:00:10.634191Z`, with the exact same commit SHA.
Build succeeded. No Render plan, secrets, environment or broker changes.

## Why this release was required

A customer-facing, authenticated Swing Active Portfolio screenshot
showed AIZ news present but EXR and PSA reporting no matching news and
VTRS still checking. Isolated GitHub-hosted real-public-source
diagnostics established:
- EXR Google Finance returned only unrelated broad-market news;
  these must not be passed off as EXR articles.
- PSA Google Finance contained a matching PSA headline but its page
  can have news cards outside the old 40,000-character parsing window.
- VTRS Google Finance contained relevant cards, but serial publisher
  requests could leave the UI on PENDING during refresh.
- AIZ Google Finance returned the expected company-specific Zacks news.

## Scope of change

Only `lib/swing-company-news.js`, its test file,
`.github/workflows/production-locale-browser-qa.yml`
and `docs/VECO_DEVELOPER_HANDBOOK.md` changed in PR #399.

- News parsing window expanded to a bounded 160,000 characters
  within the verified Finance News stories section.
- Publisher metadata reads bounded to 4 concurrent calls with
  1.2-second limits and a 2.9-second initial website observation.
- When Finance has no verified article for the selected session,
  derive company identity from its scoped quote page and use
  Google News RSS by company name and ticker as a secondary source.
- Every RSS article requires a source/publisher, relevant headline,
  safe Google News HTTPS URL, valid nonfuture Google News publication
  timestamp, and <=90-day age.
- Google News syndication time is explicitly marked `(Google News)`
  rather than falsely claiming the original publisher's exact posting
  time. If no session-day article exists, show the latest available
  properly dated article with `Earlier news`. Do not manufacture
  content or display unrelated market headlines.
- No writer, Google pricing source, model logic, execution, P&L,
  strategy, score, 10:00 ET decision or immutable entry changed.
- Existing authenticated EN/RU routes and 60-second browser
  refresh remain unchanged.

## Verification

GitHub PR #399 exact head
`045a4b37903c977aeca0d00837afdb6e51cdf95e`:
- Swing Source Rollout CI run `43092091171`: SUCCESS.
- Production EN/RU Browser QA run `43092090949`: SUCCESS.
- Temporary live-source probe run `43091687321`: SUCCESS,
  tested actual public Google Finance and Google News sources,
  not mocked provider data. Temporary probe files removed before merge.
- EXR: 2 relevant older Google News stories (Nov 6 and Nov 5).
- PSA: one relevant same-day Google News story with syndication
  timestamp 2026-11-11 06:02 ET.
- VTRS: two same-day Google Finance company headlines (Business
  Day and Gulf Daily News), marked approximate times.
- AIZ: one same-day Google Finance Zacks company headline.

These are point-in-time real-provider observations, not proof that
every later refresh will show the same stories. The live authenticated
EN/RU Swing page/API has **not** been independently reloaded in this
Chat context after the deployment. Do not infer signed-in production
runtime news parity from provider probes or Render LIVE alone.

## Rollback

Revert PR #399 alone and redeploy through the normal main pipeline,
then verify the exact Render SHA. Keep independently verified Issue
#388 valuation and approved Engine 2 trading decisions intact.

The preceding state manifest
`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-11-TODAY-NEWS.md`
remains historical evidence for the earlier release. A docs-only
`[skip render]` commit to update this index can move GitHub main ahead
of the last deployed application without changing deployed code.
