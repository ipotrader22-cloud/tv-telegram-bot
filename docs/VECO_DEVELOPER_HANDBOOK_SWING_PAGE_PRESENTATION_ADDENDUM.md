# VECO Developer Handbook — Swing Page Presentation Addendum

Date: 2026-09-18  
Scope: public Swing Trading page presentation only

## Purpose

This addendum records the owner-approved public presentation for `/trading-systems/swing-trading`.

It does **not** change Swing Leaders / Trading Lab selection, scoring, portfolio membership, entry or exit rules, target/stop behavior, Google Sheets feeds, model P&L calculations, Equity History, quote sourcing, Telegram, authentication, TWS/IBKR, Pine, or any other trading/execution behavior.

## Presentation contract

The final public Swing page should:

- use the same restrained headline scale as the main conversion homepage for `Follow a portfolio reviewed every day.`: responsive `30–42px` rather than the older oversized Swing hero scale;
- remove the public `Swing evidence context` panel entirely;
- place a beginner-friendly `How Swing Leaders Works` card in the summary position previously occupied by `Market Posture`;
- move `Market Posture` into the larger page block previously occupied by `How Swing Leaders Works`;
- make the beginner `How Swing Leaders Works` text materially easier to read: 33px heading, approximately 19.5px item labels, and 18px body copy on desktop, with modest mobile reductions;
- explain Active Portfolio, Potential Candidates, Closed Trades, position size, targets, morning stop review, and Trading Lab removals in plain language without changing their underlying meaning;
- render model allocation with an explicit separator as `$10K / position`, avoiding the visually merged `$10Kper position` presentation.

## Implementation boundary

`website_swing_ui_refinement.js` is a route-scoped final HTML presentation refinement for the canonical Swing route. It is loaded immediately after the two established outer presentation preloads so it receives the fully composed Swing HTML after later Swing/evidence layers and can enforce the owner-approved final layout without modifying the Trading Lab renderer or data contract.

The refinement must remain idempotent and must not invent, recompute, replace, or suppress Swing feed values other than removing the owner-rejected explanatory evidence panel from public display.

## Verification

Regression coverage should confirm:

- `Swing evidence context` and its Swing evidence marker are absent from final Swing HTML;
- the How card appears where Market Posture previously appeared;
- Market Posture appears in the former How-section location;
- `$10K / position` is emitted;
- the hero and beginner-copy font rules are present;
- the transform is idempotent;
- existing Swing data/model tests remain unchanged and passing.

## Rollback

Rollback is presentation-only: remove the Swing UI preload and revert `website_swing_ui_refinement.js` plus its tests/docs. No Trading Lab, Sheet, model-P&L, broker, Telegram, or authentication rollback is required.
