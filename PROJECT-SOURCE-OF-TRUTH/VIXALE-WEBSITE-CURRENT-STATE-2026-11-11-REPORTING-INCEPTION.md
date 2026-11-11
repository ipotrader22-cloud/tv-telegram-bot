# VIXALE Website — November 11, 2026 — Swing reporting inception rollout

## Live application and Git source identity

Owner approved making **November 11, 2026 at 10:01 ET** the first public
reporting date for Engine 2 Swing Leaders, with reporting-model P&L **$0**
at that verified point. This is a presentation-only rebase, not a new
Trading Lab trade, new funding, change in the $10K-per-position model or
rewrite of historical results.

GitHub application PR **#401** merged to `main` as
`15ef62aae0466565cbb40753c465f7f7644529f4`.
Production Render service `tv-telegram-bot`
(`srv-d86vh7j7uimc73ao479g`, Trader's workspace) deployed this
exact application SHA as `dep-dbqee32vcj2c73eqrcng`; Render reports
**LIVE**, finished **2026-11-11T22:08:00.681434Z**.

The subsequent workflow-only PRs #402, #403, #404 and #405 were merged
with `[skip render]`; they do **not** alter website application code
or change the active Render application SHA.
After PR #405, GitHub `main` was
`d4a2473f85e29d3b2a37aa1aa020d7ad3d774b19`.
If a newer documentation-only commit advances `main`, the live Render
application must still be established independently by exact deployed SHA.

## Trading Lab data contract (verified live native Google Sheet)

Engine 2 spreadsheet
`1Ii20kcegWWhQfz_RUrDe0OhfFG1y9TNjrEI1Xy6mqyA`,
`Equity History` range `A1:G100` read in-place:

- Original research inception: `2026-10-19 | INCEPTION`,
  cumulative model P&L $0, model equity $100,000.
- `2026-11-05 | 10:02 ET`: cumulative total model P&L
  **-$1,011.37**.
- Verified new public reporting anchor:
  `2026-11-11 | 10:01 ET | realized -$1,011.37 |
  unrealized blank | total -$1,011.37 | model equity $98,988.63 |
  active_count 4`.

All original source rows and their calculation remain immutable.
`lib/swing-reporting-equity.js` produces a separate, read-only
`reporting_equity_history` starting at this real 11/11 source row.
Reported P&L equals original cumulative total P&L minus the fixed
-$1,011.37 source baseline. The first 11/11 source row is displayed at $0
with `Since Nov 11, 2026` and `Reporting inception (10:01 ET)`.
No synthetic trade, interpolation, backfill, model-equity overwrite, or
source sheet update. A missing, duplicate or changed anchor fails closed
with a visible baseline-unavailable chart. The authenticated JSON retains
original `equity_history` separately. Legacy source unaffected.

## Verification and failure follow-ups

- PR #401 final candidate `7274bfde0c19657a2f5c9b491be5a8c7d449334b`:
  Swing Source Rollout run `43108814957` **SUCCESS**;
  Production EN/RU PR locale-contract run `43108814456` **SUCCESS**.
  The latter's browser-qa job is intentionally skipped for PR events.
- Earlier PR #401 runs `43095433156` and `43095433081` remained
  queued without jobs during the November 11 GitHub Actions incident;
  new exact-head checks ran successfully after workflow update.
- PR #402: pinned production Playwright browser job to `ubuntu-24.04`
  (Playwright 1.55 does not install Chromium on newly selected
  `ubuntu26.04`). No site change.
- PR #403: fixed production EN/RU navigation QA to correctly require
  redirect to login, not public nav, for logged-out Swing Trading.
- PR #404: replaced invalid unauthenticated Swing API 200/parity
  assumption with strict anonymous auth-gate verification and explicit
  `AUTH_GATE_VERIFIED_PARITY_NOT_CHECKED` status. Authenticated
  HTML/JSON parity remains **UNVERIFIED** without signed-in credentials;
  never call the anonymous check parity PASS.
- PR #405: corrected owner-copy/PDF QA's assumption that an anonymous
  user sees the protected Swing hero. Preserved its authenticated hero
  assertions and all public Home/PDF checks.
- Final live production EN/RU Browser QA push run `43112955948`
  (main SHA `d4a2473f85e29d3b2a37aa1aa020d7ad3d774b19`)
  **COMPLETED SUCCESS**; locale-contract and browser-qa jobs both PASS.
  Browser checked 13 public routes on desktop/mobile, logged-out Swing
  auth, public favicon, Home/copy/Trading Guide PDF and RU Services
  controls. Anonymous Swing page returned HTTP 302 to the login,
  Swing API HTTP 401, with no private portfolio data served.

## Limits and rollback

The new graphical reporting contract passed local/chart regressions,
repository CI and exact Render deployment verification. The connected
Chat browser cannot reload its preexisting authenticated session, so a
**fresh signed-in browser/API comparison of reporting_equity_history and
the first plotted $0 point remains UNVERIFIED**, though the release is LIVE.
A user loading the Swing dashboard after deployment should see the
reporting period label and first $0 point at 11/11; no claim of
independently observed signed-in visual acceptance is made here.

No 518-stock nine-factor research, approved trading entries/exits,
stop/target, TWS/IBKR, Telegram, price-provider, 10:00 decision,
daily Equity History writer, historical ledger, security/session
middleware or authentication code was modified by this release.

Rollback the application by reverting PR #401 in a narrowly scoped PR
and deploying normally; do not delete or edit the source Equity History.
PRs #402–#405 can be reverted independently if their test assumptions
need revision. Docs-only source-of-truth changes use `[skip render]`
to preserve the verified application deployment.

The previous source manifest
`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-11-NEWS-COVERAGE.md`
remains historical evidence for the earlier Google Finance company-news
rollout.
