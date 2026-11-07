# VIXALE Website — Current-State Manifest (2026-11-06 / PR #380)

**Scope:** Website / Design / Copy / Public Pages
**Target:** https://www.vixale.com/ and https://ru.vixale.com/
**Repository:** `ipotrader22-cloud/tv-telegram-bot`

## Source and deployment verification

- PR #380 (homepage video + EN/RU presentation and QA) merged to `main` as `1668433afb08379b9ba5664bf5d7acbcb56e7f2d` on 2026-11-06.
- Render service `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`) auto-deployed exactly that commit in `dep-dbn6j8lckfvc73ft04a0`; direct Render deployment read reported **live** on 2026-11-06 at `23:59:14.58361Z`.
- PR workflow **Production EN/RU Browser QA** run `42315245695` (#237) was **SUCCESS**. `locale-contract` passed (including the newly added intro-video regression); the `browser-qa` job was **skipped** for this pull request.
- The changed homepage module and new test parsed successfully; an isolated execution of `refineConversionHomepage` verified one section, correct placement, hero link, EN/RU source URLs and copy, responsive CSS, idempotence, and preservation of preview/cards. This was not an end-to-end live browser check.

## Website presentation

- `website_conversion_home_refinement.js` inserts **Meet Vixale / Three trading systems. One platform.** between the hero system preview and Day/Swing/Options description cards.
- Hero adds **Watch 55-second overview** linking to `#meet-vixale-video`; existing actions are preserved.
- Media uses a responsive 16:9 layout, no autoplay, English HeyGen embed (`5b58c907fc054fe7b8a6807ccfd69633`), Russian translated-video source (`cc6bde06dc634fb2a1ba927cfb1a426e-ru`), optional HeyGen fallback links, and a note that video illustrations are schematic.
- The supplied 55-second 720p captioned MP4 remains a conversation attachment; website uses the associated HeyGen-hosted versions rather than committing the binary file to the repository. Caption availability in the external player is not independently verified.

## Verification limitations

- Fresh public EN/RU response-body checks, screenshots, and cross-origin HeyGen playback were **NOT RUN / UNVERIFIED**. A public web crawler returned an older cached homepage; its content is not evidence against the new Render deployment.
- Public HeyGen share permissions, actual browser media playback, and mobile visual QA remain **UNVERIFIED**. This report does not assert those succeeded.
- No unrelated code conflicts found. No TWS/IBKR, trading-engine, strategies, Sheets/data-source, authentication, routing, or customer-access logic changed.

## Files changed by PR #380

```text
website_conversion_home_refinement.js
tests/test_home_intro_video.js
.github/workflows/production-locale-browser-qa.yml
docs/VECO_DEVELOPER_HANDBOOK.md
```

**Handbook update required:** YES — updated in PR #380.

## Rollback and prior state

Rollback: revert merged PR #380 by reviewed PR and allow the normal Render main auto-deploy. No migration or trading-side rollback is required.
Prior indexed website manifest: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR368.md`.

**Documentation export/upload:** NOT PERFORMED. Central local exporter is not accessible from this environment. This manifest is a repository documentation update, not a new implementation deployment.