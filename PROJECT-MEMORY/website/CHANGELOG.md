## 2026-11-04 — Daily Trading Summaries archive heading/copy (PR #368)

- Merged UI PR #368: archive h1 30% smaller; subtitle now instructs users to click a day to see that day's trades.
- No change to ledger, links, calculations, or individual day pages. Regression assertions added; Node/browser tests not run during edit.
- Render deploy for a196504c observed building at first check; final status/visual check not yet verified. Docs exporter/upload not performed.

## 2026-11-04 — Dashboard daily-history links (PR #366)

- Merged presentation-only PR #366 (81e536ca): added compact white/light-purple daily trade history card beneath Prime/Edge and pointed Full Trade History to `/daily-trading-summary`.
- Added responsive/card/link regression assertions; full Node tests and authenticated visual QA not run.
- Render deploy dep-dblii3k9v7es73d6hgl0 observed building; final visual verification unverified at documentation time. Updated source-of-truth index and dated manifest. Central export/upload not performed.

# VIXALE website — Documentation change log

## 2026-11-04 — PR361 private dashboard correction (follow-up to PR359)

- Fixed missed subtitle replacement by matching actual live pre-refined text as well as the raw source version.
- Compact Prime/Edge cards: moved subtitle and two cards into a common desktop grid row, content-height padding and mobile stack.
- Expanded renderer tests to cover the observed defect; isolated JS rendering checks and Chromium mock responsive checks passed.
- PR #361 merged to main as `453a9cf2`; Render `dep-dbli4fqvcj2c738p8dng` finished Live with successful app startup.
- Connected browser tab showed transient restart-window 502, so post-deploy authenticated screenshot/text remain UNVERIFIED; no CI test run was observed.
- Updated index and selected dated source-of-truth; no engine, broker, data or auth changes. Documentation export/upload not performed.

## 2026-11-04 — PR359 dashboard text and deployment

- Replaced private Day Trading Dashboard subtitle and both system-card explanations with owner-requested copy; no trade logic or data modifications.
- Updated desktop one-line card styling, retaining mobile wrapping; extended dashboard copy regression assertions.
- PR #359 merged as `ce1a0d1`; Render deploy `dep-dblhsinavr4c73cstf20` reported Live, with successful build and application startup.
- Fresh authenticated browser post-deploy and real responsive overflow checks remain UNVERIFIED; no PR CI runs observed. Recorded restart-window 502 separately.
- Set VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR359.md as the indexed website source-of-truth manifest; prior Issue #337 manifest retained historically. No docs exporter or ChatGPT upload performed.

## 2026-09-28 — Current column emphasis

- Set Active Portfolio Current values to font-weight 700 using scoped CSS.
- Preserved quote refresh, TP/SL, mobile layout and all trading/data contracts.
- Owner authorized merge/deployment of PR222 and this presentation follow-up.

## 2026-09-28 — Proposed Active Portfolio TP/SL display

- Added Entry-derived TP (+10%) and SL (-5%) price columns after Quantity,
  preserving daily-close rule copy and EN/RU mobile labels.
- Updated the website handbook and source/test record; prior runtime evidence
  remains historical. No trading/data-source/schema/lifecycle changes.
- Six relevant regression suites and ten offline browser cases passed; two
  unrelated pre-existing Swing assertions remain failing (see CURRENT-STATE).
- Feature branch only; merge, deployment and snapshot upload not performed.

## 2026-09-28T02:01:47+00:00

- Installed evidence-based documentation maintenance rule and initial source/path inventory.
- Preserved prior instructions and recorded validation limits.
- Prepared ChatGPT mapping; no upload, scheduling, merge, deployment or trading action performed.

## 2026-09-28 — PR221 deployment verified

- Merged PR #221 and deployed bdaa42a to Render; verified Live and startup logs.
- Checked eight Entry-derived TP/SL pairs on EN/RU, desktop/mobile, with HTTP 200.
- Recorded separate upper-navigation mobile overflow and initial QA/deploy overlap.
- Updated the selected source-of-truth manifest to PR221; older evidence preserved.
- Production QA run 36420523488 attempt 2 passed all browser, favicon, owner-copy/PDF and RU Services checks after deployment.
