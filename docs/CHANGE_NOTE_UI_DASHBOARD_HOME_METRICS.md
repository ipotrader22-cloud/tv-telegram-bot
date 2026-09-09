# Dashboard and homepage live metric UI note

This change is presentation-only.

- Dashboard: moves the existing Vixale Prime / Vixale Edge explanatory panels into the title row on desktop and adds an Open Live P&L summary card immediately after Closed P&L Today.
- Homepage Day Trading snapshot: removes the redundant preview disclaimer and adds Live Open P&L plus Win Rate.
- Live P&L reuses the existing authenticated `/dashboard/live-pnl.json` and public `/public-live-open-pnl.json` paths; Win Rate reuses `/public-performance.json`.
- No trading, strategy, signal, risk, order, bridge, Pine, Google Sheets schema, or TWS/IBKR execution behavior is changed.
