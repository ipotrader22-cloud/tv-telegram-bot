"use strict";

// Owner-defined model policy (2026-10-12), shared by public copy only.
// Research/ledger writers remain outside the website runtime.
module.exports = Object.freeze({
  opening: "If the regular-session 9:30 AM ET opening price is at least 5% below entry, close the model position at the market price immediately after confirmation.",
  score: "If a holding falls below the minimum required research score, close at the market price immediately after the new rankings are established.",
  risk: "Each model position starts with a $10,000 allocation. The profit target is +10% from entry and may trigger intraday. If the regular-session 9:30 AM ET opening price is at least 5% below entry, the model position closes at the market price immediately after confirmation. A holding that falls below the minimum required research score closes at the market price immediately after the new rankings are established. Market exit prices may differ from the opening price or stop reference.",
  guideStop: "At the regular-session 9:30 AM ET open, a price at least 5% below your entry calls for a market exit immediately after confirmation; this is not a continuous intraday stop order.",
});

