# VECO Developer Handbook — Website Trading Guide Addendum

**Applies to:** Vixale public website / Trading Systems presentation only
**Added:** 2026-08-30
**Updated:** 2026-09-14
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

`/website_swing_instructional_refinement.js` is a presentation-only preload that aligns the public Swing timing/copy, injects the beginner instructional-video card on the canonical Swing page, and serves the generated media routes. `/website_swing_canonical_refinement.js` continues to own canonical routing. The instructional-video integration does not read or write the Swing feed and does not implement any portfolio logic.

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

## Swing instructional video

The canonical Swing page includes **How to Follow Vixale Swing Trading** directly below the hero/summary block and before the detailed portfolio sections. The web asset contract is:

```text
MP4 / H.264 primary
960x540 encoded delivery, 16:9
English voice-over
native controls
no autoplay
preload="metadata"
playsinline
English WebVTT captions
poster image
responsive width within viewport
```

Media routes:

```text
/assets/swing-trading/how-to-follow-vixale-swing-trading.mp4
/assets/swing-trading/how-to-follow-vixale-swing-trading.en.vtt
/assets/swing-trading/how-to-follow-vixale-swing-trading-poster.jpg
```

The maintained generation source is `/generate_swing_media_assets.py`; it generates the video, captions, poster, and five-page Trading Guide PDF source from the reviewed public education contract. The educational examples use HOOD for the +10% target path, FCX for the scheduled morning-stop path, and MU for research removal. No exact trade price/date/return is shown unless sourced from authoritative Swing history; the 2026-09-14 video intentionally shows no fabricated exact market values.

## Trading Guide HTML and PDF alignment

The Swing section on `/trading-guide` and the downloadable PDF must match the same public contract above. The PDF source-of-truth served by the website is `/Vixale_Trading_Guide.pdf.b64`. The maintained generator is `/generate_swing_media_assets.py`.

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

## Rollback

For the Swing instructional-video/timing presentation change only:

1. revert the Swing instructional refinement, Trading Guide, Trading Systems Swing presentation, PDF base64 source, media assets, generator, focused tests, and this handbook addendum to the prior reviewed commit;
2. redeploy the prior confirmed website commit;
3. do not change or roll back Trading Lab, Swing feed generation, scoring/selection logic, bridge/TWS/IBKR, VECO, Pine, or Google Sheets lifecycle code because none of those components is part of this change.

The repository merge does not by itself prove production deployment. Update `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE.md` only after merge, Render deployment verification, and public verification of the canonical Swing page, HTML Trading Guide, and downloadable PDF.
