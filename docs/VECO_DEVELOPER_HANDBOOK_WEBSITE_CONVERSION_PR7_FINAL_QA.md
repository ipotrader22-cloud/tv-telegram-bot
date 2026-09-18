# Vixale Website Conversion — PR 7 Final QA Addendum

Date: 2026-09-18  
Owner issue: #123

## Scope

PR 7 is the final public-presentation and QA layer for the approved Issue #123 conversion redesign. It does not change strategy generation, Pine, signal timing, entries/exits, risk, Telegram publication logic, TWS/IBKR, Trading Lab, Option Journal calculations, Google Sheet schemas, or authentication behavior.

## Trading Guide contract

The maintained five-page PDF source is `Vixale_Trading_Guide.pdf.b64`. The public download route decodes that committed source at request time so the deployed guide cannot fall back to an older untracked binary.

The public HTML Trading Guide is aligned to the same product contract:

- Day Trading remains a followable signal workflow.
- Swing Trading remains a followable portfolio workflow.
- Options is presented as a protected website/journal position-update workflow.
- The legacy public Options Straddles execution example, 6:00–8:30 PM window, call+put opening recipe, +10% debit target, SPY sample trade, and hedge/exit instruction sequence are removed from final public HTML.
- Swing/Options Telegram signal delivery is not promised.
- Viewer access is free/read-only and separate from the Day Trading Telegram trial and paid subscriptions.
- Single System is $49/month; Three-System Bundle is $99/month and includes exactly Day Trading, Swing Trading, and Options.
- Bespoke Services remain separate.

## Homepage chart contract

The Issue #123 first-screen Day Trading preview and the lower Day Trading equity chart both render from the existing `/public-performance.json` payload and its existing `equity_curve.points` / `cumulative_pnl` values.

PR 7 adds no performance calculation and no alternate data source. It only renders the already-authorized realized-P&L points into SVG on the client. If the endpoint or points are unavailable, no simulated replacement data is created.

The lower chart label is normalized to `Realized P&L Equity Curve` when older presentation layers emit the conflicting `Open P&L Equity Curve` label.

## Homepage hierarchy contract

The homepage H1 `Trading signals. Three systems. Your choice.` uses the same responsive type-size range as the lower `Day Trading System Status` heading: `clamp(30px, 3.5vw, 42px)`. This keeps the product preview visually dominant without an oversized sales headline.

## SEO and sitemap

`/pricing` remains canonical at `https://www.vixale.com/pricing` and uses pricing-specific metadata describing the $49 Single System, $99 Three-System Bundle, and 30-day Day Trading Telegram signals trial.

The final public sitemap includes `/pricing` exactly once.

## Accessibility and responsive behavior

The final layer preserves the existing skip-link/focus/reduced-motion/public-QA behavior. New guide sections use labelled headings and existing CTA components. The guide commerce grid collapses to one column on narrow screens; guide CTA rows become full-width where appropriate.

## Deployment and rollback

`website_conversion_final_qa_refinement.js` must remain the first preload in `npm start` so it receives the fully composed outbound HTML last and can enforce the final contract.

Rollback is presentation-only: remove that first preload and revert the PR 7 presentation/test/document/PDF-source changes. No trading, broker, Sheet, Telegram, journal, or authentication data rollback is required.
