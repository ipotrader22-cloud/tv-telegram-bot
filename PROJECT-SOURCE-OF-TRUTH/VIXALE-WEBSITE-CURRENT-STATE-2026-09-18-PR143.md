# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #143 — `Refine Swing page hierarchy and beginner presentation`
- **PR #143 merge SHA:** `e64f2205c222c06ab4c6e82244960b7d230721bd`
- **Observed PR #143 state:** MERGED
- **Immediately preceding website-changing merge:** PR #141 — `Fix Day Trading live overview script injection`
- **PR #141 merge SHA:** `716611b81b490bb58cb4240dbf58ab7526b92bf5`
- **Observed PR #141 state:** MERGED
- **GitHub `main` directly verified after both merges:** `e64f2205c222c06ab4c6e82244960b7d230721bd`
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #141:** `dep-damrjrajnfac73ddik10` — LIVE before the later PR #143 deploy superseded it
- **Render deploy for PR #143:** `dep-damrklijnfac73ddjfo0`
- **Render deployed website-changing SHA:** `e64f2205c222c06ab4c6e82244960b7d230721bd`
- **Render deployment status:** LIVE
- **Render verification:** the exact PR #143 merge SHA was checked out by the `tv-telegram-bot` service and Render reported the deployment LIVE on 2026-09-18.
- **Fresh public-origin browser/content verification after PR #143:** UNVERIFIED in this maintenance pass; production-origin retrieval available to this session returned cached/pre-deploy content, so no claim is made that a fresh browser rendering was independently observed here.

A later documentation-only commit/deploy may advance `main` without changing website runtime behavior. Such a docs-only deploy does not replace PR #143 as the latest website-changing code reference.

## PR #141 — Day Trading inline runtime-script fix

PR #141 fixes the dedicated `/trading-systems/day-trading` inline runtime-script injection so currency literals containing `$'` are not corrupted by JavaScript replacement-string semantics.

Production contract:

- use a callback replacer when injecting the Day Trading runtime script;
- preserve the emitted JavaScript bytes literally;
- keep `/public-performance.json` and `/public-live-open-pnl.json` as the existing data sources;
- do not change P&L formulas, Google Sheets, authentication, Telegram, Pine, strategy rules, risk, entries/exits/stops/targets, bridge, TWS, or IBKR behavior.

Focused pre-merge verification recorded on PR #141: GitHub Actions run `35399919394` — SUCCESS, including syntax, emitted-inline-script regression for the dedicated Day Trading page, and `git diff --check`.

## PR #143 — Swing Trading presentation refinement

PR #143 changes public Swing presentation only:

- reduces `Follow a portfolio reviewed every day.` to the restrained responsive `30–42px` range;
- removes the public `Swing evidence context` block entirely;
- places beginner-friendly `How Swing Leaders Works` content in the prior Market Posture summary position;
- moves `Market Posture` into the larger former How block position;
- increases How-block readability;
- renders model allocation as `$10K / position`.

No Trading Lab scoring/selection, Active Portfolio membership, candidates, Closed Trades, Equity History, P&L calculations, Google Sheets, quote source, Telegram, Pine, signal timing, entries/exits, target/stop behavior, authentication, bridge, TWS, or IBKR behavior is changed.

Focused pre-merge verification recorded on PR #143: GitHub Actions run `35401199114` — SUCCESS for syntax, focused Swing presentation regression, `tests/test_swing_leaders.js`, `tests/test_swing_instructional_refinement.js`, `tests/test_issue123_pr7_final_qa.js`, and `git diff --check` on the tested PR head. After PR #141 merged first, `main` was merged into the PR #143 branch without force-push; the final PR #143 diff remained the same four intended Swing presentation files before merge.

## Prior verified baseline

The immediately prior full production/browser-verified website baseline is recorded in:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-18.md`

That prior manifest documents PR #139, Issue #123, the product/navigation contract, data ownership, and broader website safety boundaries. Those contracts remain in force except where explicitly superseded above by PR #141 and PR #143.

## Safety boundary

These website changes do **not** authorize or alter VECO strategy/Pine logic, signal timing, entries/exits/filters/stops/targets/risk, bridge/TWS/IBKR execution, Telegram trade lifecycle publication, Swing Trading Lab scoring/selection/writer behavior, Option Journal writes/P&L calculation, Google Sheet trading schemas/calculations, or protected viewer authentication behavior.
