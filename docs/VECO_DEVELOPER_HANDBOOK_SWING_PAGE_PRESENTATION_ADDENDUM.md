# VECO Developer Handbook — Swing Page Presentation Addendum

Date: 2026-09-18
Scope: public Swing Trading page presentation only

## Purpose

This addendum records the owner-approved public presentation for `/trading-systems/swing-trading`.

It does **not** change Swing Leaders / Trading Lab selection, scoring, portfolio membership, entry or exit rules, target/stop behavior, Google Sheets feeds, model P&L calculations, Equity History, quote sourcing, Telegram, authentication, TWS/IBKR, Pine, or any other trading/execution behavior.

## Presentation contract

The final public Swing page should:

- use the same restrained headline scale as the main conversion homepage for `Follow a portfolio reviewed every day.`: responsive `30–42px` rather than the older oversized Swing hero scale;
- present the hero research/model-portfolio explanatory copy as a rounded card with a subtle light-green-to-white gradient, light green border, and restrained shadow; preserve the existing copy exactly;
- remove the public `Swing evidence context` panel entirely;
- render `How Swing Leaders Works` as a full-width block above the Swing summary metrics rather than occupying one metric-card slot;
- lay out the four beginner explanations horizontally on desktop, with responsive two-column and one-column fallbacks on narrower screens;
- render each of the four beginner explanations as its own rounded card with the same light-green-to-white gradient treatment, light green border, and restrained shadow;
- keep the summary metrics in their own horizontal row beneath the How block: `Active Portfolio`, `Candidates`, `Cash`, and `Model Allocation`;
- use `Candidates` as the visible compact label instead of `Potential Candidates`, without changing the Trading Lab feed field or candidate-selection logic;
- render the former public `Market Posture` block as **`Market Update`**;
- keep the Market Update heading compact at 16.5px desktop / 15px mobile while rendering the Trading Lab update copy at the same body size as the Active Portfolio beginner description: 18px desktop / 17px mobile;
- always show the Trading Lab release date and time directly below Market Update using the existing Public Feed `snapshot_date` and `snapshot_time_et` values; do not substitute browser time, server time, fetch time, or a newly generated timestamp;
- keep the beginner `How Swing Leaders Works` text materially easy to read: 33px heading, approximately 19.5px item labels, and 18px body copy on desktop, with modest mobile reductions;
- explain Active Portfolio, Candidates, Closed Trades, position size, targets, morning stop review, and Trading Lab removals in plain language without changing their underlying meaning;
- render model allocation with an explicit separator as `$10K / position`, avoiding the visually merged `$10Kper position` presentation.

### Gradient-card details

The gradient-card treatment is presentation-only and applies to the two owner-marked areas:

- the hero explanatory paragraph shown under `Follow a portfolio reviewed every day.`;
- the four `How Swing Leaders Works` explanation cards.

Desktop cards use approximately 24px corner radius, a pale green-to-white gradient, and subtle shadow. Mobile cards reduce to approximately 21px corner radius with slightly tighter padding. These are informational cards, not new interactive controls, and no copy, destination, data source, or calculation changes are implied.

## Release-stamp data contract

The public Swing renderer already validates and exposes these Trading Lab fields:

```text
snapshot_date
snapshot_time_et
market_posture
```

`website_swing_ui_refinement.js` may reuse the already-rendered snapshot stamp to label the Market Update release. The displayed update text remains the exact existing `market_posture` value from Trading Lab; Engineering does not rewrite, summarize, infer, or independently generate market commentary.

The release stamp means **when the Trading Lab snapshot/update was released**, not when the browser loaded the page. The primary extraction source is the existing hero `Snapshot YYYY-MM-DD · <time> ET` pill, with the existing `Last Updated` footer as a presentation fallback. Both are rendered from the same validated Public Feed snapshot fields.

## Implementation boundary

`website_swing_ui_refinement.js` is a route-scoped final HTML presentation refinement for the canonical Swing route. It is loaded immediately after the two established outer presentation preloads so it receives the fully composed Swing HTML after later Swing/evidence layers and can enforce the owner-approved final layout without modifying the Trading Lab renderer or data contract.

The refinement must remain idempotent and must not invent, recompute, replace, or suppress Swing feed values other than removing the owner-rejected explanatory evidence panel from public display. Renaming the visible `Potential Candidates` label to `Candidates` and `Market Posture` to `Market Update` are presentation-only; the underlying feed fields and semantics remain unchanged. Gradient-card styling is CSS-only and must not alter text, URLs, data values, or behavior.

## Verification

Regression coverage should confirm:

- the hero explanatory copy has the expected rounded light-green/white gradient-card styling;
- each How explanation has the expected rounded light-green/white gradient-card styling, including responsive mobile padding/radius rules;
- `Swing evidence context` and its Swing evidence marker are absent from final Swing HTML;
- the How block appears before the Swing summary row and is not inside a summary-card slot;
- the summary row remains horizontal on desktop and contains Active Portfolio, Candidates, Cash, and Model Allocation;
- the former Market Posture content renders under the public heading `Market Update` below the summary;
- Market Update body copy uses the same 18px desktop / 17px mobile size as the Active Portfolio description;
- Market Update always carries the exact snapshot date/time from the existing Trading Lab snapshot stamp;
- `$10K / position` is emitted;
- the hero and beginner-copy font rules are present;
- the transform is idempotent;
- existing Swing data/model tests remain unchanged and passing.

## Rollback

Rollback is presentation-only: revert the Swing UI refinement and its tests/docs. No Trading Lab, Sheet, model-P&L, broker, Telegram, or authentication rollback is required.
