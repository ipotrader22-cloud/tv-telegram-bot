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

The Node start command preloads both website presentation modules before `/app.js`:

```text
node -r ./website_trading_guide.js -r ./website_trading_systems_refinement.js app.js
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

Straddle instructions explain the user workflow only:

```text
watch 6:00-8:30 PM ET -> open instructed straddle -> +10% profit limit -> follow later hedge / adjustment / exit instructions
```

The proprietary hedge / adjustment / exit decision rules remain internal.

## PDF

`/Vixale_Trading_Guide.pdf` is the downloadable five-page public guide served by `/download/trading-guide.pdf`. Website copy and PDF copy must remain aligned with the same public execution contracts.

## Rollback

For only the Trading Systems refinement:

1. restore the start command to `node -r ./website_trading_guide.js app.js`;
2. remove `/website_trading_systems_refinement.js` and its focused test.

For the complete Beginner Trading Guide feature:

1. restore the original application start command (`node app.js`);
2. remove both website presentation preload modules and the guide PDF asset;
3. remove the related presentation tests.

No trading-engine, bridge, TWS, Sheets, Telegram, or Swing feed rollback is required.
