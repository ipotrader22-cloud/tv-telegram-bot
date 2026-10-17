# PLTR October 12, 2026 — 250-bar historical metrics replay

Source: archived production GitHub Actions workflow run **38287231788**, artifact **11763492868** (swing-research-inputs.json). The original JSON was collected at 2026-10-12T17:53:47.519Z. SHA-256 of original JSON: `290034fe1dc78d06a064e9518c6a951aec1d5d851532baaa07b9c25af4ad3532`.

Cutoff: **October 12 13:48 ET**. All October 12 daily bars were excluded. PLTR, SPY, XLK, QQQ, and SMH each had **250** completed OHLCV bars through October 9, 2026, with matching dates.

| Metric | PLTR | SPY | XLK |
|---|---:|---:|---:|
| Oct 9 closing price | 209.0500 | 778.5700 | 198.7800 |
| SMA20 | 186.9965 | 767.9770 | 194.5165 |
| SMA50 | 176.9796 | 767.5744 | 189.0484 |
| SMA200 | 152.3312 | 722.9284 | 166.3784 |
| 20-session return | +25.0075% | +1.8684% | +5.9200% |
| 60-session return | +55.4969% | +3.7098% | +11.9761% |
| Last completed-day volume / prior 20-session mean | 1.6317x | 0.4918x | 0.7422x |
| 50-session high-low range as percent of high | 42.9239% | 5.6217% | 15.0308% |

PLTR excess performance: +23.1391 pp / +51.7871 pp versus SPY (20 / 60 sessions); +19.0875 pp / +43.5208 pp versus XLK. PLTR close was above all three moving averages.

**Benchmark qualification:** XLK is explicitly used as a technology-sector proxy in this replay because it is present in the original artifact. It has **not** been proven to be the uniquely chosen sector benchmark during the original 13:48 review; QQQ and SMH are also available for sensitivity checks.

**Evidence qualification:** This is a numerical reconstruction from a previously captured dated research artifact, not new live Yahoo retrieval. The original 13:48 review score was 83. No separate nine-factor evidence review has independently reproduced 83. Oct 12 intraday quote, publication timestamp, and final qualitative catalyst assessment are not established by these 250 daily bars.

No production writes or score changes.
