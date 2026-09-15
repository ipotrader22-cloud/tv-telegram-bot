# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages
**Manifest updated:** 2026-09-15 (America/New_York)
**Repository:** `ipotrader22-cloud/tv-telegram-bot`
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #103 — `Remove generated Swing instructional video`
- **PR #103 merge SHA:** `07ed317562a04023570b0b2e51c714c3b6c0e3e0`
- **Observed PR state:** MERGED
- **Pre-merge focused verification:** GitHub Actions run `34918249710` — SUCCESS
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-daka4roae00c73ctonjg`
- **Render deployed SHA:** `07ed317562a04023570b0b2e51c714c3b6c0e3e0`
- **Render deployment status:** LIVE
- **Fresh public verification:** GitHub Actions run `34918443150` — SUCCESS
- **Canonical Swing page:** verified without a `<video>` element, without the removed instructional title/path, and with the old MP4 route returning HTTP 404

## PR #103 — Swing instructional video removed

PR #103 removes the generated Swing instructional-video implementation introduced by PR #102 while preserving the approved public Swing timing/risk copy.

Removed from the maintained website implementation:

- generated MP4 base64 parts
- generated poster image
- generated WebVTT captions
- generated media serving routes and byte-range handling
- instructional-video card/style injection on `/trading-systems/swing-trading`
- `/generate_swing_media_assets.py`

Preserved:

- public Swing timing/copy alignment
- `10:00–11:00 AM ET` update-window contract
- +10% actual-entry target guidance
- morning-review -5% stop-reference semantics
- Active Portfolio removal as an independent exit instruction
- Trading Guide PDF source
- canonical Swing routing and existing Swing feed/data behavior

Future instructional-video integration is **not active**. Engineering should only add a replacement after the owner supplies and approves the MP4 asset. Do not regenerate or substitute synthetic narration/video unless explicitly requested.

## Safety boundary

PR #103 does **not** change:

- Trading Lab selection/scoring
- Swing feed generation
- strategy logic
- Pine
- VECO
- bridge/TWS/IBKR execution
- order/risk behavior
- Google Sheets lifecycle
- `lib/swing-leaders-core.js`

## Verification details

Pre-merge run `34918249710` passed:

- JavaScript syntax check
- Swing public-copy/removal regression
- Trading Systems regression
- Trading Guide regression
- canonical Swing route regression
- generated media/generator absence checks
- `git diff --check`

Fresh public run `34918443150` fetched `https://www.vixale.com/trading-systems/swing-trading` after Render reported the PR #103 SHA live and verified:

- page loads successfully
- `Vixale Swing Trading` is present
- no `<video>` element is present
- removed instructional-video title/path is absent
- old MP4 route returns HTTP 404

## Historical manifest

The previous canonical manifest remains available for historical detail at:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE.md`

For current website state, use this manifest because it records the later PR #103 merge/deploy/public verification.
