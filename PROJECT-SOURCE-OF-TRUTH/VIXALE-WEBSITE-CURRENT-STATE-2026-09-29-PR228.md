# VIXALE Website — Current-State Manifest

**Project:** VIXALE Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-29 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Swing feed incident and root cause

On 2026-09-29 the public Swing Trading page entered its fail-closed unavailable state after the Trading Lab Public Feed contained a newly added Active row for `DELL` with an empty `brief_note` field.

Render application logs repeatedly reported:

```text
Swing Leaders Public Feed refresh failed: Missing DELL brief_note
```

The core parser intentionally rejects incomplete Active rows. Because a deployment restart had also cleared the in-memory `lastValidSnapshot`, the service had no previously validated snapshot to serve and returned the documented unavailable/503 presentation instead of reconstructing a partial portfolio.

The Trading Lab workbook was repaired directly: the DELL Public Feed row now contains a non-empty sanitized research note. A post-write re-read confirmed all ten Active rows have populated `brief_note` fields.

## Runtime resilience fix

Website PR #228 — `Keep Swing page available when an Active research note is blank` — was merged as commit:

```text
5430bf94a28c1682a6c8e9ba70ab86df2995fdbb
```

The fix is intentionally narrow:

- the compatibility layer in `lib/swing-leaders.js` treats only an empty Active `brief_note` as presentation-recoverable;
- an empty note is normalized to `Research note pending.` before the existing strict core parser runs;
- critical model/trading fields such as ticker, exchange, score, entry date/price, current price, return, and review date remain fail-closed;
- source worksheet rows are not mutated;
- candidate alias normalization remains unchanged;
- no scoring, entry/exit, stop/target, sizing, fixed-$10K P&L, broker, VECO, TWS/IBKR, or signal logic changed.

Regression coverage was added in `tests/test_swing_leaders_candidate_feed_compat.js`. The post-merge `locale-contract` job for PR228 succeeded, including syntax checks and Swing portfolio display regressions.

## Deployment state

PR228's own Render deploy:

- deploy: `dep-dau4ge3bc2fs73c895o0`
- commit: `5430bf94a28c1682a6c8e9ba70ab86df2995fdbb`
- reached `live` at `2026-09-29T23:23:31.460032Z`
- later deactivated normally by a newer main deployment.

At the time this manifest was prepared, the latest directly verified production deployment was:

- commit: `fa06c0eda8152ac31325863837c3fb58217f08bf`
- Render deploy: `dep-dau4i98u01pc7382long`
- status: `live`
- finished: `2026-09-29T23:27:25.462885Z`

That newer main commit still contains the PR228 `lib/swing-leaders.js` resilience code, directly re-verified from `main` after deployment. The newer commit also contains unrelated website work and does not remove the Swing fix.

## Verification status

- Trading Lab Public Feed repair: **VERIFIED** by direct spreadsheet re-read.
- PR228 merge: **VERIFIED**.
- PR228 regression/locale-contract checks: **VERIFIED SUCCESS**.
- Render deployment of PR228: **VERIFIED LIVE**, then superseded by newer main deployment.
- PR228 resilience code present in latest checked `main`: **VERIFIED**.
- Latest checked Render deployment containing that code: **VERIFIED LIVE**.
- Full EN/RU browser QA for PR228 was cancelled/skipped because newer website commits deployed while the QA workflow was waiting for production to settle. Therefore an independent end-to-end browser assertion for the Swing route remains **UNVERIFIED** in this manifest; do not infer it from deployment status alone.

## Operational prevention

The Trading Lab 10:00 primary workflow and 10:20 fallback workflow were hardened so a successful morning publication now requires every Active Public Feed row to contain all required fields, including a non-empty `brief_note`. A blank required Active field is a fail-closed publishing failure and must be repaired before success is reported.

This operational guard complements, rather than replaces, the website resilience behavior above.

## Prior state

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-29-PR224.md` for the Swing Public Feed availability incident and resilience fix. PR224 remains the historical baseline for the equity-chart live-refresh change; PR221 remains the historical baseline for TP/SL display behavior.

## Rollback

To roll back only the website resilience behavior, revert PR228 / merge commit `5430bf94a28c1682a6c8e9ba70ab86df2995fdbb` while preserving the repaired Trading Lab Public Feed. No data migration, trading-state rollback, broker action, or worksheet schema change is required.
