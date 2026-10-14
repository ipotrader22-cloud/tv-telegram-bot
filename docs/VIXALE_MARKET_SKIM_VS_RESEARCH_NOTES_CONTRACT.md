# VIXALE: two independent editorial products — 2026-10-14 correction

## Product 1: Daily Market Skim (public website)
**Intent**: SHORT BROAD US EQUITY MARKET OVERVIEW, **NOT issuer press-release recaps**.
Must cover independently observed S&P 500, Nasdaq and Russell 2000 (or state any missing inputs), major Treasury yields and volatility/risk regime as of a precise ET market timestamp, plus macro catalysts from primary sources such as Federal Reserve, BLS, Treasury. Distinguish intraday snapshots from prior close and avoid pretending an incomplete morning quote is a close.
Generate 3–5 sentences EN/RU, source links and date/time. Require licensed/permitted public inputs; don't repurpose TWS/Dow Jones. No source/date/quote verification -> show pending, never fall back to NVIDIA-only company news as a "market" skim.
Website component `#vx-daily-market-skim` remains separate from model portfolio entries; any old 2026-10-14 NVIDIA-only source is historical/incorrect product semantics. Replace only when broad-market data gates pass. Public Google JSON delivery can stay, but validation must demand broad-market provenance and observed index context.

## Product 2: Active Portfolio Research Notes (canonical Sheet/Public Feed)
Eight symbols as of previous snapshot: PLTR, NVDA, DELL, PANW, AAOI, COHR, XOM, FTNT; **always re-read current live Sheet membership before using this historical list**. Notes are ticker-specific, dated, concise findings and what changed since last review, not repeated generic copy. Private research evidence includes verified company SEC/company IR and technical price/volume; one valid dated publisher release is not a full nine-factor review. Verify exact nine-factor caps Market10/Sector15/Leadership15/Catalyst10/Base15/Compression10/Volume15/MA5/Resistance5. Scores, review dates, status and note must be internally consistent.
Writer ONLY existing primary 10:00–10:20 ET scheduled review or 10:25–10:35 ET recovery under the strict native Sheets lease/fence and live lot reconciliation rules in `VIXALE_Operational_Control_2026-10-12_FINAL.txt`. Preserve Q/R, Public Feed formulas and fixed $10,000 per-position accounting. No new writer from website or RSS job, no broker orders, no synthetic notes, never change review date merely because a market summary was published.
Before claiming "notes updated", verify live Sheet `Portfolio`, `Open Positions`, `Public Feed`, then uncached EN/RU website and API parity. Separate financial DATA gate from PUBLICATION and DELIVERY gates.

## Implementation acceptance
- Remove NVIDIA-only brief publication as market-level copy.
- Broader market data proof precedes new live public skim.
- Keep ticker research and market summary fully isolated.
- Add read-only eight-ticker evidence preflight, then connect it to existing writer rather than introducing an unguarded Sheets updater.
