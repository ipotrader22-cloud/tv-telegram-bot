# VECO Developer Handbook — Issue #123 PR 3 System Pages

**Applies to:** public Day Trading, Swing Trading, and Options system-page recomposition.  
**Approved direction:** 2026-09-18 owner conversion brief.  
**Handbook update required:** YES.

## Product-page order

Each direct system page should answer the buying/following question before implementation detail:

```text
benefit-led system intro
-> working system screen / truthful product state
-> system-specific results or history
-> short how-to-follow guidance
-> pricing / access next action
```

The redesign must not create a new trading/data owner merely to make the page look live.

## Day Trading

The public Day page uses the existing public Day sources:

- `/public-performance.json` for open count, closed P&L today, realized equity/history, and source freshness;
- `/public-live-open-pnl.json` for current open P&L.

PR 3 performs one page-load request to those existing endpoints and renders their already-derived values. It does not add another interval poller, does not change formulas, and does not synthesize unavailable values. Open P&L and realized P&L remain distinct.

The primary commercial action is the existing verified **30-day free Day Trading Telegram signals trial**. The page may show the approved **$49/month Single System** price for comparison but must not invent checkout or billing behavior.

## Swing Trading

The existing public Swing Leaders page remains the working product screen and remains the source of truth for the public Swing portfolio.

PR 3 may recompose the sales framing around it, but must preserve:

- Active Portfolio;
- Potential Candidates;
- Closed Trades;
- Equity History / model P&L;
- existing Trading Lab data values and refresh/cached behavior;
- research/model-portfolio disclosure.

The prior explanation/primer wall above the portfolio is removed from the conversion path. Customer-facing status uses **Reviewed each trading morning** / **latest published update** language while the underlying source/disclosure semantics remain unchanged. The page must not convert model results into brokerage-account performance.

## Options

There is no separate public Options trade/results JSON feed in the current implementation. PR 3 therefore does not invent public trade values.

The public Options page shows a truthful workflow preview — new positions, position updates, completed trades — and explicitly states that journal rows, closed-only realized P&L, and available brokerage proof remain protected behind the existing viewer.

No sample P&L, fictitious trade, synthetic timestamp, or Swing/Options Telegram promise is permitted.

## Commercial presentation

The system pages reuse `lib/website-commercial-offer.js`:

- Single System: **$49/month**;
- Day trial: **30 days**, Day Trading Telegram signals only;
- Pricing remains the comparison/request destination until a real checkout/billing system is separately verified.

## Preload ownership

`website_conversion_system_pages_refinement.js` is first in the preload order for PR 3. It handles only GET/HEAD responses for the three direct public system routes and therefore receives the fully composed output after older system-page refinements unwind.

Order begins:

```text
website_conversion_system_pages_refinement.js
website_conversion_home_refinement.js
website_conversion_navigation_refinement.js
website_public_qa_refinement.js
...
```

Broad preload/HTML-rewrite consolidation remains owned by Issue #89.

## Safety boundary

PR 3 must not modify:

- `app.js`;
- VECO strategy logic, entries/exits, filters, stops, targets, risk, or signal timing;
- Pine;
- bridge / TWS / IBKR execution;
- Telegram trade lifecycle publication;
- Google Sheet schemas/calculations;
- Swing Trading Lab scoring/selection/writer behavior;
- Option Journal owner writes or P&L calculation;
- viewer authentication/authorization.

## Validation

Before merge:

- Node syntax-check the new refinement;
- run the focused PR 3 regression;
- verify Day uses only the existing public Day endpoints and adds no second polling interval;
- verify Swing retains the real portfolio HTML/data while removing the old primer wall;
- verify Options contains no fabricated financial values and keeps the protected viewer boundary;
- verify direct Results/Pricing/access destinations;
- verify narrow responsive rules;
- compare against fresh `main` and inspect the complete changed-file list.

After merge, Render must check out the exact merge SHA, build successfully, start with the PR 3 refinement first, bind port 10000, and reach LIVE before the next PR proceeds.

## Rollback

Revert the PR 3 merge and restore the prior `package.json` preload order. No trading, broker, Sheet, auth, or customer-data rollback is required.
