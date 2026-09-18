# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #145 — `Polish Swing horizontal hierarchy and labels`
- **PR #145 merge SHA:** `1f2712e2cdd956134d09fb522b8760b1becb966f`
- **Observed PR #145 state:** MERGED
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #145:** `dep-damrrs4s728c739r1qt0`
- **Render deployed website-changing SHA:** `1f2712e2cdd956134d09fb522b8760b1becb966f`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #145 merge SHA was checked out by the `tv-telegram-bot` service and Render reported the deployment LIVE on 2026-09-18 at `2026-09-18T22:41:39.623507Z`.
- **Fresh public-origin browser/content verification after PR #145:** UNVERIFIED in this maintenance pass; do not infer user-visible rendering from deployment status alone.

A later documentation-only commit/deploy may advance `main` without changing website runtime behavior. Such a docs-only deploy does not replace PR #145 as the latest website-changing code reference.

## PR #145 — Swing page layout polish

PR #145 changes only the public Swing Trading presentation layer:

- `How Swing Leaders Works` is a full-width section above the Swing summary metrics instead of occupying one metric-card slot;
- its four beginner explanations render horizontally on desktop, with responsive two-column and one-column fallbacks;
- the summary row beneath it contains `Active Portfolio`, `Candidates`, `Cash`, and `Model Allocation`;
- the visible compact label `Potential Candidates` is shortened to `Candidates` without changing the Trading Lab feed field or candidate-selection logic;
- `Market Posture` remains in the lower page block with typography reduced by 50% relative to PR #143: 16.5px heading and 12px body on desktop, with proportional mobile reductions;
- `$10K / position` remains the model-allocation presentation;
- the previously removed `Swing evidence context` block remains absent.

Focused pre-merge verification recorded on PR #145: GitHub Actions run `35402321865` — SUCCESS for syntax, focused Swing presentation regression, existing Swing regressions, final-QA guard, and `git diff --check`. The final branch head differed from the tested head only by removal of the temporary verification workflow.

## Prior website-changing state

Immediately preceding website changes remain recorded in:

- PR #143 — Swing beginner presentation and evidence-context removal;
- PR #141 — dedicated Day Trading inline runtime-script fix;
- PR #139 — homepage/Results empty-chart fix with fresh production browser verification.

The prior full manifest is:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-18-PR143.md`

Those contracts remain in force except where explicitly superseded above by PR #145.

## Safety boundary

PR #145 does **not** change Trading Lab scoring/selection, Active Portfolio membership, candidate data, Closed Trades, Equity History, P&L calculations, Google Sheets, quote sources, Telegram, Pine, signal timing, entries/exits/targets/stops, authentication, bridge, TWS, or IBKR behavior. It is a website presentation-only change.
