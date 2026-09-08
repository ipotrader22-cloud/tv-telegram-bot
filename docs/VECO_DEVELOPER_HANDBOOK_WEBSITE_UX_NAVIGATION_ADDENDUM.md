# VECO Developer Handbook — Website UX, Navigation & Accessibility Addendum

**Applies to:** Vixale public website presentation, homepage hierarchy, public navigation, Trading Systems comparison UI, and accessibility refinements  
**Added:** 2026-09-08  
**Related routes:** `/`, `/trading-systems`, `/trading-systems/day-trading`, `/trading-systems/swing-trading`, `/trading-systems/options`, `/services`, `/about`, `/pricing`, `/closed-trades`, `/trading-guide`, `/risk-management`

## Purpose

This addendum records Issue #74 / PR3. It is a website-only presentation contract. It does not change strategy logic, signals, lifecycle rules, Sheets writers, auth/session mechanics, Swing Trading Lab automation, Option Journal owner entry, Telegram, bridge, TWS, or IBKR execution.

## Homepage hierarchy contract

The homepage opening section must establish the customer-value message before system navigation.

Desktop order:

1. primary sales hero;
2. authentic Day Trading evidence preview beside the hero;
3. Day Trading / Swing Trading / Options selector below the hero row;
4. full `#live-day-trading` status/performance section;
5. access form and the rest of the page.

Mobile order:

1. hero;
2. evidence preview;
3. three system cards stacked vertically;
4. full Day Trading evidence section.

Approved hero message:

```text
See how our trading systems perform before you commit.
```

Primary CTA:

```text
Request Free Access -> /#password-access
```

Secondary CTA:

```text
Explore Performance -> #live-day-trading
```

The opening H1 uses a normal sales-page hierarchy rather than the previous compact 28–32px treatment: approximately 48–58px on desktop and 34–40px on small mobile layouts.

## Evidence preview contract

The hero-side Day Trading preview is presentation-only and creates no new data source.

It mirrors the already-approved homepage evidence elements:

- Open Positions;
- Pending Setups;
- Closed P&L Today;
- Total Realized P&L;
- Day Trading data-freshness state;
- Last updated timestamp.

The preview reads those rendered DOM values and mirrors changes through `MutationObserver` plus a low-frequency synchronization fallback. It does not call Google Sheets, TWS, or a new endpoint. It does not calculate or substitute performance values.

If an authoritative source value is unavailable, the preview remains `—` / unavailable. Simulated or decorative profit figures are prohibited.

The full Day Trading block remains the authoritative public presentation for methodology, coverage, stale/unavailable states, live open P&L, and realized equity.

## System selector contract

The homepage selector remains three equal system choices:

- Day Trading -> `#live-day-trading`;
- Swing Trading -> `/trading-systems/swing-trading`;
- Options -> `/trading-systems/options`.

The selector is below the hero/evidence row, not beside the headline.

This is navigation/presentation only. It does not change any system's data, auth, or execution path.

## Public navigation contract

English public pages with a standard navigation container use one shared link hierarchy:

```text
Trading Systems  -> /trading-systems
Performance      -> /#live-day-trading
Services         -> /services
About            -> /about
Trading Guide    -> /trading-guide
Login            -> /dashboard
Request Free Access -> /#password-access
```

The `Request Free Access` action is the prominent navigation CTA. `Login` is visually quieter for returning viewers.

The shared normalizer preserves the existing brand/logo element and replaces only the link container (`.nav-links` or the standalone Trading Guide `.navlinks`). The Trading Guide's PDF action remains available inside the guide content; it is not required in the top navigation.

Russian routes are not included in this English public-navigation normalization and must remain unchanged unless a separate RU task is approved.

## Trading Systems comparison contract

The `/trading-systems` cards should let a new visitor compare the three categories without exposing proprietary signal-generation rules.

Each card includes customer-facing context for:

- cadence;
- evidence;
- what the visitor sees;
- access destination/state.

Current approved distinctions:

### Day Trading

- cadence: intraday monitoring;
- evidence: live status + closed-trade ledger;
- visitor view: status, realized curve, Day Trading dashboard;
- access: free viewer access available.

### Swing Trading

- cadence: multi-session portfolio review;
- evidence: Active Portfolio + Equity History;
- visitor view: Swing Leaders research/model portfolio;
- access: public Swing research page.

### Options

- cadence: options-specific updates;
- evidence: Option Journal + realized equity;
- visitor view: journal, equity, and protected brokerage proofs;
- access: viewer access required for journal details.

This comparison text does not redefine the underlying Swing or Options data-entry contracts.

## Beginner guide ordering

On `/trading-systems`, the existing compact `How to Trade Vixale` guide must render inside the main Trading Systems content **before** the system risk/disclosure footer.

This ordering is presentation-only. The guide content, full `/trading-guide`, and downloadable PDF remain separate existing resources.

## Accessibility/readability contract

PR3 establishes the following public presentation requirements:

- normal explanatory muted text uses colors with WCAG-AA contrast on the site's white / near-white backgrounds;
- essential chart-axis text is no longer rendered with the prior `#87918d` / ~9px treatment;
- homepage equity SVG labels are visually overridden to a darker readable muted tone and approximately 10.5–11px minimum presentation size;
- essential Day Trading labels remain readable at 360/390px widths;
- compact-guide headings may wrap and are not forced to ~13px single-line text;
- primary public H1 hierarchy remains readable at desktop and mobile sizes;
- keyboard-visible focus outlines are provided for links, buttons, inputs, selects, and textareas;
- public navigation collapses on smaller screens to the quiet `Login` link plus the primary `Request Free Access` CTA rather than forcing the full desktop link row to overflow.

The muted text target used by this layer (`#56645e` / `#5f6d67` on white or near-white backgrounds) is intentionally darker than the previously audited low-contrast `#87918d` treatment.

## Implementation boundary

Primary files for this contract:

```text
website_home_conversion_refinement.js
website_home_system_selector_refinement.js
website_navigation_disclosure_refinement.js
website_trading_systems_product_refinement.js
```

The existing preload/refinement architecture remains in place for this PR. PR3 does not perform the separately planned cleanup/reduction of the long HTML-rewrite chain.

The shared navigation/accessibility refinement runs after the system/product/home presentation layers in response-transform order so it can normalize their final customer-facing navigation and readability without changing backend routes.

## Validation

Before merge:

- syntax-check every changed JS/test file;
- run homepage conversion regression;
- run homepage selector/evidence-preview regression;
- run unified navigation/disclosure/accessibility regression;
- run Trading Systems product comparison regression;
- run existing homepage performance, performance-truth, public-IA, About, Trading Guide style, Swing canonical, and Options canonical regressions;
- verify `app.js` remains unchanged;
- inspect final branch diff for trading, broker, Telegram, Sheets writer, auth, Swing automation, and Options owner-entry changes;
- verify English-only scope does not rewrite RU routes;
- verify `Request Free Access` points to `/#password-access` and returning-user `Login` points to `/dashboard`;
- verify preview code contains no new endpoint/data read and no simulated figures.

After an approved merge/deployment:

- verify exact Render merge SHA reaches LIVE;
- visually inspect widths 360 / 390 / 768 / 1440;
- verify keyboard focus and 200% zoom behavior;
- verify homepage hero -> preview -> selector -> Day Trading order;
- verify shared navigation on Home, Systems, Services, About, and Trading Guide;
- verify the compact guide appears before the Trading Systems disclosure;
- update the Website Current-State manifest with the authoritative deployment/user-visible result.

## ADR-WEB-004 — Customer-value hero, mirrored evidence, and one public navigation contract

**Decision:** The public website uses a customer-value-first homepage hero with a mirrored, non-simulated Day Trading evidence preview; the three system choices sit below the opening hero; and English public pages use one shared navigation hierarchy with one Free Access CTA and one returning-user Login link.

**Reason:** The previous homepage gave system selector cards and a compact headline nearly equal visual weight, making the Day Trading status section more dominant than the primary sales message. Public pages also accumulated different navigation sets. A mirrored preview preserves real evidence without adding another data source, while a shared navigation contract makes the site easier to understand and safer to maintain.

**Data/schema impact:** None. The preview mirrors already-rendered approved aggregates and creates no new API, Google Sheets range, TWS source, environment variable, or writer.

**Auth impact:** None. `Request Free Access` still points to the existing homepage request flow and `Login` still uses the existing `/dashboard` viewer flow.

**Execution impact:** None.

## Rollback

Revert the PR3 merge. No Google Sheets, access-code, Swing workbook, Option Journal, trading-state, broker-state, Telegram, bridge, TWS, or IBKR rollback is required.
