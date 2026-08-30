# VECO Developer Handbook — Website Trading Guide Addendum

**Applies to:** Vixale public website / Trading Systems presentation only  
**Added:** 2026-08-30  
**Related route:** `/trading-systems`

## Beginner Trading Guide presentation

The public website includes a beginner-facing execution guide without exposing strategy-generation rules.

Public presentation routes:

```text
/trading-systems
/trading-guide
/download/trading-guide.pdf
```

`/trading-systems` keeps its existing rendering and data flow. The presentation preload in `/website_trading_guide.js` adds a compact **How to Trade Vixale** panel to the generated Trading Systems HTML and serves the dedicated Trading Guide page and PDF download route.

The Node start command preloads the presentation module before `/app.js`:

```text
node -r ./website_trading_guide.js app.js
```

This layer is website-only. It must not modify:

- TradingView strategy logic or payloads;
- signal generation or lifecycle classification;
- bridge / TWS execution;
- Telegram publishing logic;
- Google Sheets trade lifecycle;
- Swing Leaders public JSON schema or feed selection.

## Swing copy contract

Beginner instructions must use the current Active Portfolio model. Do not invent a public `NEW` or `READY NOW` status.

Approved beginner wording:

```text
When a new symbol appears in Active Portfolio, enter it at the current market price.
```

The guide may explain the user execution framework (`+10%` target, `-5%` stop, and close-at-market on portfolio removal) but must not change or recalculate the research feed.

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

`/Vixale_Trading_Guide.pdf` is the downloadable five-page public guide served by `/download/trading-guide.pdf`. Website copy and PDF copy must remain aligned with the same public contracts above.

## Rollback

Rollback is presentation-only:

1. restore the previous `package.json` start command (`node app.js`);
2. remove `/website_trading_guide.js` and the guide PDF asset;
3. remove the related presentation test.

No trading-engine, bridge, TWS, Sheets, Telegram, or Swing feed rollback is required.
