# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## October 6 user-friendliness and conversion audit — PR277

Website-facing PR #277, `Implement October 6 user-friendliness and conversion audit`, was squash-merged to `main` as implementation commit:

```text
9b75767e148543089ff862b0b2bfd46b58b9e36e
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2fr849v7es738goh10`.
Verified implementation deploy commit: `9b75767e148543089ff862b0b2bfd46b58b9e36e`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T13:55:33.65214Z`.

PR verification:
- workflow: **Production EN/RU Browser QA**
- PR run: **#155**
- result: **SUCCESS**
- syntax, unified navigation/homepage, October 6 audit/funnel, Options evidence, Swing, owner-copy/PDF, Services RU parity, and existing Russian-localization regressions all passed.

## Production source behavior

The task-focused primary public navigation contract is:

```text
Day Trading
Swing Trading
Options
Results
Pricing
```

Returning-user `Log In` remains available. The main public acquisition action is the Day Trading trial:

```text
Get 30 Days Free
```

The trial remains limited to **30 days of Day Trading Telegram signals**. Secondary/footer discovery retains How It Works, Trading Systems, Daily Recaps, Services, About, and Help.

The homepage now separates three customer paths:
- Day Trading trial / trading-system exploration;
- public Results;
- free read-only viewer access for protected detail.

The Day/Swing/Options product previews continue to use their existing authoritative data sources and do not synthesize replacement trading values.

## Options commercial / access boundary

Options remains `$49/month` as a Single System.

Paid Options intent uses the existing canonical Telegram plan-request flow and is presented as a paid subscription request. It does **not** route through the free viewer-access form.

The public Options evidence boundary is:
- performance chart: public;
- Option Journal: public;
- published closed-trade results: public;
- available brokerage proof files: protected by existing viewer authorization.

Free viewer access remains a separate read-only request path for protected detail. Existing authentication, email verification, manual approval, viewer-code creation/expiry, and protected proof authorization are unchanged.

Public Options copy is strategy-neutral and does not define the product as restricted to one structure or to 0DTE.

## Pricing and Results

Pricing preserves:
- Day Trading trial: 30 days free;
- Single System: `$49/month`;
- Three-System Bundle: `$99/month`;
- three separate systems: `$147/month`;
- bundle difference: `$48/month`.

Customer-facing onboarding copy explains the real manual flow: choose the plan, send the prepared Telegram request, then receive payment/access instructions. Internal implementation wording such as “fake checkout” is not part of the final audit contract.

Results remains system-specific. Day Trading, Swing Trading, and Options retain distinct evidence sources and may show system-specific next actions. No combined Vixale performance total is introduced.

## Funnel measurement

The existing privacy-preserving funnel metrics were extended with aggregate:
- `cta_click`;
- `pricing_plan_selected`.

Allowed aggregate dimensions are CTA kind, system, offer, and originating public path.

The funnel metrics file must not store names, email addresses, Telegram handles, viewer codes, tokens, IP addresses, user-agent strings, credentials, or other customer-identifying values.

## Verification notes

Render startup verification after the implementation deploy confirmed:
- the corrected preload order starts with general Russian localization, then the Services RU form-copy safety pass, then the October 6 audit refinement;
- `npm start` reached `Server running on port 10000`;
- Render reported the service live.

A generic external crawler queried immediately after deployment still returned older cached navigation/pricing HTML and could not reach the Render primary hostname. Therefore crawler-visible public HTML is **UNVERIFIED / STALE-CACHE OBSERVED** in this maintenance run. This is not evidence that the Render deployment failed; do not replace it with a crawler-success claim unless a fresh external fetch observes the PR277 elements.

## Files changed by PR277

```text
.github/workflows/production-locale-browser-qa.yml
docs/VECO_DEVELOPER_HANDBOOK.md
lib/website-commercial-offer.js
lib/website-funnel-metrics.js
lib/website-funnel-source-patch.js
package.json
tests/test_oct6_user_friendliness_refinement.js
tests/test_website_funnel_measurement.js
website_oct6_user_friendliness_refinement.js
```

## Safety boundary

PR277 does **not** change:
- Pine or TradingView strategy behavior;
- entry, exit, stop, target, sizing, timeframe, session, or risk logic;
- bridge/TWS/IBKR execution;
- Telegram trading lifecycle;
- Option Journal owner write behavior;
- Swing Trading Lab scoring/selection/writer behavior;
- Google Sheets trading schemas or trading write paths;
- production secrets or environment values;
- Turnstile, verification-token, manual viewer-approval, or viewer-code authorization policy.

## Handbook

**Handbook update required: YES — completed in PR277.**

The handbook now records the October 6 public conversion contract, the public Options chart/journal versus protected proof boundary, the paid subscription versus free viewer-access separation, and supersession notes for older presentation decisions where they conflict.

## Rollback

Revert PR277 / implementation commit:

```text
9b75767e148543089ff862b0b2bfd46b58b9e36e
```

then allow the normal Render deployment. No broker, Pine, Option Journal, Google Sheet trading-data, viewer-code, or customer-data rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR274.md`. The PR274 manifest remains historical.
