# VECO Developer Handbook — Website Trading Guide Addendum

**Applies to:** Vixale public website / Trading Systems presentation only
**Added:** 2026-08-30
**Updated:** 2026-09-15
**Related routes:** `/trading-systems`, `/trading-systems/swing-trading`, `/trading-guide`, `/download/trading-guide.pdf`

## Beginner Trading Guide presentation

The public website includes beginner-facing execution education without exposing strategy-generation rules. Public presentation routes are:

```text
/trading-systems
/trading-systems/swing-trading
/trading-guide
/download/trading-guide.pdf
```

`/website_trading_guide.js` adds the compact **How to Trade Vixale** panel to the Trading Systems HTML and serves the dedicated Trading Guide page.

`/website_trading_systems_refinement.js` is a website-only presentation refinement for `/trading-systems`. It adds the visible **Beginner Guide** link and renders the public Swing summary card.

`/website_options_straddle_refinement.js` remains the authoritative PDF-serving layer. It serves `/download/trading-guide.pdf` from the verified base64 source `/Vixale_Trading_Guide.pdf.b64` after validating the `%PDF-` signature. It also preserves the approved ES short-straddle public copy correction. It does not calculate or place any live order.

`/website_trading_guide_style_refinement.js` is a presentation-only visual layer for `/trading-guide` and continues to align the guide with the Vixale visual system.

`/website_swing_instructional_refinement.js` remains a presentation-only preload for public Swing timing/copy alignment on `/trading-systems`, `/trading-systems/swing-trading`, and `/trading-guide`. It does **not** inject or serve an instructional video. `/website_swing_canonical_refinement.js` continues to own canonical routing.

These presentation layers must not modify TradingView strategy logic or payloads, signal generation, scoring, selection, Trading Lab automation, Google Sheets trading lifecycle, bridge/TWS/IBKR execution, VECO order/risk logic, or the Swing public JSON schema.

## Swing Trading public education contract — 2026-09-14

The approved public Swing timing is:

```text
Portfolio update: once per trading day.
Expected publication/update window: 10:00-11:00 AM ET.
After publication: review Active Portfolio for additions and removals.
Action timing: additions and removals should be acted upon as soon as practical.
```

This replaces the older public `9:45-10:00 AM ET` wording. Day Trading and Options timing is not changed by this update.

The public Swing sections mean:

```text
Potential Candidates = WATCH. Research review only; not trade entries.
Active Portfolio = ACT. A new symbol appearing there is the actionable addition.
Closed Trades = completed model positions with recorded exit reasons.
```

Do not invent a separate public `NEW`, `READY NOW`, or equivalent status. The relevant event is the symbol appearing in Active Portfolio.

The approved user-facing Swing risk and exit framework is:

```text
Profit target: +10% from the user's actual entry price.
Formula: Actual Entry Price x 1.10 = Profit Target.
Typical user action: GTC SELL LIMIT.
The +10% target may execute intraday.

Stop reference: 5% below the user's actual entry price.
Formula: Actual Entry Price x 0.95 = 5% Stop Reference.
The stop is evaluated during the scheduled morning review.
It is NOT an automatic intraday stop order, NOT an EOD stop, and NOT a daily-close stop.
If the current review price is more than 5% below entry, close at market as soon as practical.

Research removal: removal from Active Portfolio is an independent exit instruction.
Close at market as soon as practical; do not wait for target or stop.
```

Research Score may only be described publicly as:

```text
A proprietary Vixale research metric shown on a 0-100 scale.
```

Do not disclose, reverse-engineer, speculate about, or visually imply the Score formula, factors, weights, thresholds, indicators, or selection methodology.

## Swing instructional video status — 2026-09-15

The generated instructional video introduced with PR #102 has been removed from the website at the owner's request. The canonical Swing page currently has **no instructional video integration**.

The generated MP4 parts, generated poster, generated WebVTT captions, and `/generate_swing_media_assets.py` are not part of the maintained website implementation after this removal.

A future Swing instructional video may be added only from an owner-approved supplied media asset. When that happens, Engineering may implement the presentation/serving layer without altering Swing trading behavior, scoring, selection, or lifecycle rules.

Do not recreate, regenerate, or substitute a synthetic narration/video asset unless the owner explicitly requests it.

## Trading Guide HTML and PDF alignment

The Swing section on `/trading-guide` and the downloadable PDF must match the same public contract above. The PDF source served by the website remains `/Vixale_Trading_Guide.pdf.b64`.

The five-page PDF must preserve the approved Day Trading and ES short-straddle instructions while using the Swing 10:00-11:00 AM ET window and morning-review stop semantics. Focused regression coverage should verify both the HTML guide and decoded PDF source do not contain the obsolete Swing `9:45-10:00 AM ET` wording.

## Options copy contract

The beginner Options workflow remains the ES **short straddle** credit workflow:

```text
watch 6:00-8:30 PM ET
-> SELL the instructed ES straddle for credit
-> place a BUY TO CLOSE profit limit about 10% below entry credit
-> round the buyback target to the nearest 0.25 ES option price increment
-> follow later hedge / adjustment / exit instructions
```

The existing illustrative ES example remains 33.00 credit, 29.70 theoretical 10% buyback, 29.75 rounded target, multiplier 50, and +$162.50 illustrative profit if filled.

## Rollback / replacement boundary

For the Swing public timing/copy presentation layer only:

1. preserve the approved 10:00-11:00 AM ET timing and morning-review stop semantics unless the owner explicitly changes that contract;
2. do not reintroduce the removed generated instructional video or media routes;
3. a future owner-supplied MP4 may be integrated as a separate website-only change after the asset is provided and reviewed;
4. do not change Trading Lab, Swing feed generation, scoring/selection logic, bridge/TWS/IBKR, VECO, Pine, or Google Sheets lifecycle code as part of media presentation work.

The repository merge does not by itself prove production deployment. Update `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE.md` only after merge, Render deployment verification, and public verification of the canonical Swing page.
