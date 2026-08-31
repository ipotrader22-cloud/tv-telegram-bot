# VECO Developer Handbook — Website Trading Guide Addendum

**Applies to:** Vixale public website / Trading Systems presentation only  
**Added:** 2026-08-30  
**Updated:** 2026-08-30  
**Related routes:** `/trading-systems`, `/trading-guide`, `/swing-leaders`

## Beginner Trading Guide presentation

The public website includes a beginner-facing execution guide without exposing strategy-generation rules.

Public presentation routes:

```text
/trading-systems
/trading-guide
/download/trading-guide.pdf
```

`/website_trading_guide.js` adds the compact **How to Trade Vixale** panel to the generated Trading Systems HTML and serves the dedicated Trading Guide page and PDF download route.

`/website_trading_systems_refinement.js` is a website-only presentation refinement for `/trading-systems`. It adds a visible **Beginner Guide** link to the upper navigation and replaces the older generic Swing placeholder with the approved single-system Swing card.

`/website_options_straddle_refinement.js` is a website-only presentation correction applied to `/trading-systems` and `/trading-guide`. It changes the beginner Options workflow from a long/debit example to the approved ES short-straddle credit workflow. It does not calculate or place any live order.

The Node start command preloads the presentation refinements before `/app.js`:

```text
node -r ./website_options_straddle_refinement.js -r ./website_trading_guide.js -r ./website_trading_systems_refinement.js app.js
```

These presentation layers must not modify:

- TradingView strategy logic or payloads;
- signal generation or lifecycle classification;
- bridge / TWS execution;
- Telegram publishing logic;
- Google Sheets trade lifecycle;
- Swing Leaders public JSON schema or feed selection.

## Trading Systems navigation contract

The `/trading-systems` upper navigation includes a visible **Beginner Guide** link to `/trading-guide`. The link is intended to remain immediately discoverable without requiring the user to scroll to the lower guide panel.

## Swing Trading public card contract

The public Trading Systems page currently presents one Swing product card:

```text
Vixale Swing System
```

The card links to:

```text
/swing-leaders
/trading-guide#swing-trading
```

Do not present the older generic `ATR / % based targets` or `No Daily / Weekly split` placeholder copy in this card.

The approved user-facing Swing execution framework is:

```text
Profit target: +10% from the user's actual entry price.
Defined risk: 5% stop level, evaluated on the daily close.
Portfolio review: each trading morning, 9:45–10:00 AM ET.
Additions: new positions may be added when the scanner identifies symbols that meet the system's selection criteria.
Removals: holdings that no longer meet the selection criteria may be removed from Active Portfolio and should be closed according to the published portfolio update.
```

This wording explains user actions and portfolio maintenance only. It must not expose the proprietary selection/scoring rules used to decide why a symbol qualifies or stops qualifying.

Beginner instructions must use the current Active Portfolio model. Do not invent a public `NEW` or `READY NOW` status. A new addition is communicated by the symbol appearing in Active Portfolio.

## Day Trading copy contract

Prime / Edge beginner instructions explain the user workflow only:

```text
signal -> broker execution -> published target -> Stop Ref monitoring
```

`Stop Ref` is presented as the applicable close-based reference when the signal specifies it, not as a native broker stop order or a simple intrabar touch.

## Options copy contract

The beginner Options workflow is the ES **short straddle** credit workflow. Public copy must not describe it as a long/debit straddle.

Approved workflow:

```text
watch 6:00-8:30 PM ET
-> SELL the instructed ES straddle for credit
-> place a BUY TO CLOSE profit limit about 10% below entry credit
-> round the buyback target to the nearest 0.25 ES option price increment
-> follow later hedge / adjustment / exit instructions
```

Approved illustrative example:

```text
SELL 1 ES straddle @ 33.00 credit
ES multiplier = 50
10% calculation: 33.00 x 0.90 = 29.70
Rounded BUY TO CLOSE target: 29.75
Credit received: 33.00 x 50 = $1,650.00
Buyback cost: 29.75 x 50 = $1,487.50
Illustrative profit if filled: (33.00 - 29.75) x 50 = $162.50
```

The proprietary hedge / adjustment / exit decision rules remain internal. This website copy is explanatory only and does not alter Options strategy, order, margin, or execution logic.

## PDF

`/Vixale_Trading_Guide.pdf` is the downloadable five-page public guide served by `/download/trading-guide.pdf`. Website copy and PDF copy must remain aligned with the same public execution contracts.

## Rollback

For only the ES short-straddle copy correction:

1. restore the prior start command without `/website_options_straddle_refinement.js`;
2. restore the prior guide PDF;
3. remove the focused ES short-straddle presentation test.

For only the Trading Systems refinement:

1. restore the start command to `node -r ./website_trading_guide.js app.js`;
2. remove `/website_trading_systems_refinement.js` and its focused test.

For the complete Beginner Trading Guide feature:

1. restore the original application start command (`node app.js`);
2. remove the website presentation preload modules and the guide PDF asset;
3. remove the related presentation tests.

No trading-engine, bridge, TWS, Sheets, Telegram, or Swing feed rollback is required.
