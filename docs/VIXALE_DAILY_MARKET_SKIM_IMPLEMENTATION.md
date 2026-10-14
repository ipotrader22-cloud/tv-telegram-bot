# VIXALE Daily Market Skim — implementation contract (2026-10-14)

**Status:** proposal only; NOT deployed. No production writing, no new scheduled writer or TWS data exfiltration.

## Product
A short, human-readable **Daily Market Skim** on `/trading-systems/swing-trading`, adjacent to the existing Market Posture text. English by default, Russian equivalent when `lang=ru`. At most 90 words in English, 3–5 short sentences; timestamp "Reviewed YYYY-MM-DD, HH:MM ET"; a small "Read sources" link to primary public source URLs. Never display paid TWS/Dow Jones/Briefing.com article text, headlines, identifying feed metadata or adapted/translated licensed articles. No broker trade instructions.

## Legal/source boundary
The user's locally installed TWS News Collector remains **local only**, for personal alerting/research. It must not upload news text, headlines, metadata, hashes, embeddings, or generated summaries derived exclusively from TWS to GitHub, OpenAI, Google Sheets, or the public website absent express applicable authorization. Simply paraphrasing licensed text is not an authorization to redistribute API data. Public summaries must be written *independently* from unrestricted, publicly verified primary sources (company IR releases, SEC EDGAR, government releases) and appropriately licensed reporting. Cite exact linked URLs; no model-invented facts, dates, quotes, price/target values.

## Runtime
1. At 10:35–10:45 ET on NYSE trading sessions, a **research/publication-only** job reads current universe and independently verifies public primary sources and dates, and completed-session market context where possible. It must not write portfolio/model financial state and must never acquire/release the financial fence on behalf of another job.
2. Check for an existing, fully reviewed current-day canonical portfolio snapshot; never imply today's scoring is complete if it is not. The skim may publish separately, clearly labeled "Market overview" and its own timestamp, without altering rank review timestamps or Public Feed notes.
3. Produce a strict schema: `{dateET, reviewedAtET, stance, summaryEn, summaryRu, sources:[{url,issuedDate,issuer}], universeDate, provenance:'independent-public-sources'}`. Exact date/URL/host/date corroboration required. Reject text that overlaps paid news excerpts or lacks independent source corroboration.
4. Idempotency by `dateET`; validate all content before publication. Store skim separately from Public Feed formulas, Equity History, or fixed-$10K model.
5. Make website deploy in existing deployment pipeline, not an isolated static-file mutation that the next deployment overwrites. After publishing, fetch uncached HTML AND API and verify identical date, summary digest, source links and locale. A failed publication gate leaves previous visibly dated skim, not a falsely updated review.
6. If publication cannot be substantiated, show "Today's market brief is pending verification" rather than inventing summary; no stale date marked as current. Do not trigger any trading orders or emails.

## UI acceptance
- One compact block immediately after Market Posture, before Active Portfolio.
- Title: "Today's Market Skim" / "Коротко о рынке".
- 3–5 sentences, <90 English words, at most 2 linked public sources displayed.
- Date/time ET visible; market overview explicitly separate from portfolio research rankings.
- No empty states shown as factual commentary; mobile-friendly.
- English/Russian parity and sanitization of all model-generated text.

## Release checklist
- Validate public source collection in read-only CI and prove no TWS API data crossed the boundary.
- Synthetics test schema validation, stale dates, malicious URLs, duplicate date, locale parity and failed publication rollback.
- Stage first, then QA both page locales; deploy through canonical site workflow.
- Confirm 10:35 ET cadence doesn't conflict with the 10:00/10:25 model review and recovery windows; this research job is not a financial writer.
- Validate one genuine read-only brief before scheduling any live publication.

## 2026-10-14 incident and root-cause repair

The first build for the Daily Market Skim code (`00f91c2d`) began at 20:54Z and became live only at 21:54Z, about an hour later. During that build the independently verified daily JSON was committed (`f836d7fa`) at 20:55Z. The Render deploy history recorded only `00f91c2d` live, leaving its local checked-out `data/daily-market-skim.json` absent. The early six-minute QA failed correctly; JSON production visibility was not established.

**Repair:** `lib/public-daily-skim-feed.js` reads the immutable-path, publicly accessible owner-authored JSON from `raw.githubusercontent.com/ipotrader22-cloud/tv-telegram-bot/refs/heads/main/data/daily-market-skim.json` using a background poll every 60 seconds and an edge-cache-busting request. It validates exact review date, source allowlist, provenance, locales and payload size, caches the vetted object locally in memory, and falls back to the current-deploy local JSON if available. No IBKR, TWS, Dow Jones or other licensed content is transported. A failed remote refresh never replaces a validated local object with invalid data; yesterday's cached news cannot masquerade as today's news.

This decouples **daily content delivery** from the slow Render code deploy. Render remains the canonical **application/code** deploy path for website changes; only the separate, non-financial public news JSON is refreshed from the repository. Do not modify public feed formulas, financial reviews, website API snapshot headers or portfolio locks. The code change itself still needs one complete Render deploy; verify it via Render live commit plus uncached EN/RU HTML. No production success claim until both pass.
