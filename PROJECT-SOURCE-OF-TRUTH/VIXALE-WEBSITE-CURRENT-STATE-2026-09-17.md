# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #129 — `Issue #123 PR 3: recompose system pages around the working product`
- **PR #129 merge SHA:** `9fdfff07160a3ec21b314d114c1d2c25b46b5295`
- **Observed PR state:** MERGED
- **Feature-branch verification before merge:** local Node syntax PASS for the new conversion system-page module; focused source regression PASS; branch 0 behind fresh `main`; exactly four intended files; no configured GitHub Actions/status checks
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-dami7hcs728c73c3ojmg`
- **Render deployed website-changing SHA:** `9fdfff07160a3ec21b314d114c1d2c25b46b5295`
- **Render deployment status:** LIVE
- **Render verification:** exact merge SHA checked out; build successful; server reached the normal startup/live sequence
- **Fresh public-origin visual verification:** **UNVERIFIED** until a direct origin/owner-visible check is available; prior external crawler behavior has been stale and is not treated as origin truth.

## Active product direction — Issue #123

Issue #123 — `Engineering: implement approved Vixale conversion redesign` — remains the active public-site implementation epic.

Approved customer-facing product/commercial contract:

- exactly three systems: **Day Trading**, **Swing Trading**, **Options**;
- shared direct navigation: **Day Trading | Swing Trading | Options | Results | Pricing**;
- free trial: **30 days of Day Trading Telegram signals only**;
- **Single System:** `$49/month`;
- **Three-System Bundle:** `$99/month`;
- bundle includes exactly Day Trading, Swing Trading, and Options;
- bundle savings: `$48/month` compared with three separate `$49/month` subscriptions;
- custom bots, setup, automation/integration, strategy review, and bespoke development remain separate services;
- Swing/Options Telegram delivery is not part of this release;
- no checkout, card requirement, renewal, automatic billing, or day-31 conversion behavior may be invented unless production support is separately verified.

## PR #129 — Issue #123 PR 3 production contract

PR #129 recomposes the direct system pages around the product rather than a long explanation wall.

### Day Trading

- benefit-led product intro;
- one-load working screen uses existing public endpoints only:
  - `/public-performance.json`
  - `/public-live-open-pnl.json`;
- displays existing Open Positions, Open P&L, Closed P&L Today, Total Realized P&L, and realized-equity points;
- adds no new interval poller and changes no Day Trading calculations;
- public results and Closed Trades remain separate evidence destinations;
- Day trial remains the existing 30-day Day Trading Telegram request;
- `$49/month` is presentation/comparison only, not an invented checkout flow.

### Swing Trading

- existing public Swing Leaders portfolio remains the working product screen and data owner;
- old primer/access wall is removed from the sales path;
- product framing is shortened to **Follow a portfolio reviewed every day.**;
- public portfolio, potential candidates, closed trades, equity history/model P&L, and existing Trading Lab values remain intact;
- customer-facing copy uses morning/latest-published-update wording while model/disclosure semantics remain unchanged;
- Swing remains research/model portfolio evidence, not brokerage-account performance.

### Options

- public page is benefit-led and shows the real workflow boundary rather than fabricated financial data;
- new positions / position updates / completed trades are described as the existing protected Option Journal workflow;
- journal rows, closed-only realized P&L, and available brokerage proof remain behind the existing viewer auth;
- no sample P&L, fictitious trade, synthetic timestamp, or Swing/Options Telegram promise is added.

### Implementation ownership

- `website_conversion_system_pages_refinement.js` is first in the preload order for the three direct system routes;
- it changes only GET/HEAD public presentation;
- prior homepage, navigation, SEO/accessibility, auth, data, and trading owners remain in place;
- Issue #89 still owns broad preload/HTML-rewrite consolidation.

## Prior Issue #123 production slices

### PR #126 — Homepage working-product opening

- merge SHA `f510f60f2fe8aab8ec22ff5115c7c187deb8d3d6`;
- Render deploy `dep-dami2j3ncjis73dk94kg` — LIVE;
- homepage H1: **Trading signals. Three systems. Your choice.**;
- first screen contains Day/Swing/Options product tabs;
- Day mirrors existing real homepage sources, Swing lazily uses `/api/swing-leaders`, Options preserves protected boundaries;
- shared `lib/website-commercial-offer.js` owns 30-day / $49 / $99 / $48 public presentation constants.

### PR #124 — Direct navigation/trial foundation

- merge SHA `04991bfd7446fa18acc15e7a61581f372457576b`;
- Render deploy `dep-damhrsjtqb8s73fujvcg` — LIVE;
- direct system navigation plus Results/Pricing;
- Log In + Get 30 Days Free;
- mobile three-system switcher;
- verified Telegram DM request destination reused for the Day Trading trial.

## Data ownership

Issue #123 is a website presentation/conversion project. Existing source and calculation ownership remains unchanged:

- **Day Trading:** current public status/open P&L, Closed Trades ledger/realized equity, protected Day viewer;
- **Swing Trading:** Trading Lab research/model portfolio, Active Portfolio, candidates, Closed Trades, Equity History;
- **Options:** owner-maintained Option Journal, existing derived closed-trade P&L/equity, protected owner-provided brokerage proofs.

Do not combine unlike sources into one P&L, fabricate missing values, convert model returns into brokerage-account performance, or change financial calculations as part of the redesign.

## Safety boundary

Issue #123 PRs #124, #126 and #129 do **not** change:

- VECO trading logic or strategy rules;
- signal generation/timing;
- entries/exits/filters/stops/targets/risk;
- Pine;
- bridge / TWS / IBKR execution;
- Telegram trade lifecycle publication;
- Swing Trading Lab scoring / selection / writer behavior;
- Option Journal owner writes or P&L calculation;
- Google Sheet trading schemas/calculations;
- protected dashboard/viewer authentication or authorization;
- `app.js`.

## Locale/domain verification

Preferred canonical public host remains `www.vixale.com`. Existing application-level GET/HEAD apex-to-www behavior from PR #121 remains in place. DNS/TLS edge routing and fresh user-visible public HTML require direct verification rather than crawler inference.

Render reports `ru.vixale.com` among service domains, but repository inspection has not identified a separate Russian public navigation implementation. Issue #123 has not introduced a separate RU fork.

## Historical reference

Detailed prior Issue #107 and Issue #123 PR contracts remain in Git history and handbook addenda. For current website-changing production state, use this manifest plus fresh GitHub/Render/live-origin verification according to `MASTER-INDEX.md`.
