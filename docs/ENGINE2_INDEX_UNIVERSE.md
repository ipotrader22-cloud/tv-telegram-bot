# Engine 2 S&P 500 + Nasdaq 100 universe

Owner request, November 8, 2026: replace the ten-stock integration universe with
S&P 500 union Nasdaq 100. Select `SP500_NASDAQ100_V1` in
`VIXALE_V2_RESEARCH_UNIVERSE` on the Engine 2 cron and observer. The pinned,
reviewed manifest supplies sectors; the old sectors env map is retained for rollback.
The website remains on its existing Engine 2 workbook reader on `main`.

## Membership and source evidence

`engine-v2/data/sp500-nasdaq100.json` is verified November 8: 503 S&P securities,
101 Nasdaq securities, 86 overlapping tickers, 518 unique securities. Separate
share classes remain separate securities. Wikipedia constituent/taxonomy tables
are cross-checked against official SPY/QQQ equity holdings dated November 5;
listing exchanges are verified against Nasdaq Trader's November 6 directory.
Source URLs and content hashes are retained in the manifest. ETF cash, futures,
collateral and other non-index holdings are not candidates.

GICS sectors apply to S&P members, ICB industries to Nasdaq-only members. Sector
ETFs cover all 11 sectors; SMH retains the existing semiconductor comparison.
SPY and QQQ are market benchmarks, never candidate stocks. Nine weights and all
entry/exit thresholds, ten-position cap, fixed-$10K accounting and public top-five
candidate presentation remain unchanged. Headlines alone still award zero
catalyst points.

Membership is a versioned snapshot, **not an automatic live index subscription**.
For index changes, download the five URLs in the manifest into `--source-dir`
using filenames `sp500.html`, `ndx-components.html`, `spy-holdings.xlsx`,
`qqq-all.json`, `nasdaqtraded.txt`, then run:

```sh
python scripts/build-engine2-index-universe.py --source-dir /path/to/downloads --verified-at YYYY-MM-DD
node --test engine-v2/index-universe.test.cjs
node engine-v2/index-universe-probe.cjs
```

The builder requires development-only pandas/lxml/openpyxl, verifies source dates
within seven days, membership counts, deduplication, official holdings coverage,
and stock listing identities. Review changes through a narrow PR. Provision
quote rows for additions before activation. Never overwrite a session's frozen
prepared research to change membership mid-session. A held ticker lacking new
research blocks the cycle; removal from an index alone is not a model exit.

## Collection and exclusions

Daily Google charts run four requests concurrently, four securities per request.
News coverage runs six concurrent requests, in deterministic candidate order.
All indexes are requested each preopen preparation. A source-confirmed history
below 200 bars is explicitly unscored and ineligible. A successful batched source
response missing one verified exchange identity similarly records
`PROVIDER_SYMBOL_UNAVAILABLE`; it cannot invent a score or price. Recheck these
members on each new collection. Held positions without research still block.
HTTP denial, quota response, transport failure, malformed candles, missing/stale
benchmarks or news collection failure block the full preparation. No host bypass.

The frozen artifact retains membership hash, requested/reviewed lists and exact
exclusion reasons/provenance. Validation requires an exact disjoint partition.
A cached ten-stock preparation cannot satisfy the new configured universe.
Old committed sessions and pending publication replay remain immutable.

The quote provider reads bounded `Engine 2 Quotes!A1:G651`; original ten rows
remain in place and 508 new stock rows are appended through row 519. Every price,
trade-time, delay, volume and priceopen formula is validated. Only quotes actually
required for entries/carried positions must be fresh at the morning decision.
No existing financial formulas, Q/R controls or ledger history are rewritten.

## Verification and rollout

`index-universe-probe.cjs` is read-only: real sources, current clock, prior completed
session and deterministic scoring. It never creates a prepared artifact in the
DB, model entry, sheet publication or email, and explicitly does not certify the
next market cycle. November 8 independent probe: 518 requested, 513 scored/news
covered, 14 benchmarks, 53.941 seconds. Exclusions: FDXF (115 bars), HONA (102),
SPCX (103), VYLR (27), HLT (new NASDAQ identity absent at Google). No source/score
is substituted for these stocks.

Deploy only after exact-head CI including disposable PostgreSQL passes. The
engine writer/observer currently track `engine-v2-shadow-foundation-20261016`,
so the feature PR targets that deployed branch; merging draft foundation PR329
into website `main` is outside this change. Verify exact Render live SHA and run
the read-only probe on Render. Existing cron preopen/10:00 windows remain.

### Index-scale memory correction

The first Render shell probe restarted without a result. A local reproduction
measured 4,560,380 KiB peak RSS despite a 256 MiB JavaScript heap limit: creating
an ICU timezone formatter for every candle retained excessive native memory.
Reuse the two timezone formatters and compact each validated Google batch
before retaining it. The same source and score rules apply; DST rollover and
532-symbol date conversion now have a subprocess memory regression test.
The readiness probe reports peak RSS so server verification includes capacity,
not merely successful CI. Render's temporary shell has a 256 MiB memory limit.

Rollback: restore prior universe CSV (NVDA,AMD,AVGO,MU,AMAT,MSFT,AAPL,ORCL,XOM,CVX)
and prior engine revision `0b284e4a959d34e9b942f678aa800b246419bd81`. Original quote
rows 2:11 and sector env map are preserved. Keep appended quote rows inert and
retain immutable journals. Never reinterpret a prepared index session under a
different universe; make configuration changes outside an in-progress session.
