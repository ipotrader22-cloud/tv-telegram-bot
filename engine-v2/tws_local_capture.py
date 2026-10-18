#!/usr/bin/env python3
"""Local read-only TWS/IB Gateway evidence capture for VIXALE model research.

Install on the same Windows PC as TWS: pip install ib_insync
Requires running, logged-in TWS, enabled socket API, real-time US equities
market-data subscription, and compatible trusted-localhost port.
Does not issue or submit ANY orders. Does not expose the TWS API to Internet.
Writes JSON to a local file; no cloud upload or network server is started.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

def capture(host, port, client_id, symbols, output, seconds):
    try:
        from ib_insync import IB, Stock, util
    except ImportError as exc:
        raise SystemExit("Install the read-only TWS API client: pip install ib_insync") from exc
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("Refusing non-loopback TWS connection")
    ib = IB()
    ib.connect(host, port, clientId=client_id, timeout=10, readonly=True)
    subscriptions = []
    try:
        ib.reqMarketDataType(1)  # request REALTIME, never delayed
        contracts = [Stock(s, "SMART", "USD") for s in symbols]
        qualified = ib.qualifyContracts(*contracts)
        if len(qualified) != len(contracts):
            raise RuntimeError("Not all TWS US stock contracts qualified")
        for contract in qualified:
            ticker = ib.reqMktData(contract, "", False, False)
            ib.reqTickByTickData(contract, "Last", 0, False)
            subscriptions.append((contract, ticker))
        ib.sleep(seconds)
        trades = []
        for contract, ticker in subscriptions:
            if getattr(ticker, "marketDataType", None) != 1:
                raise RuntimeError(f"{contract.symbol}: TWS did not confirm REALTIME market-data type 1")
            ticks = getattr(ticker, "tickByTicks", []) or []
            last = next((x for x in reversed(ticks) if
                         getattr(x, "price", 0) > 0 and getattr(x, "size", 0) > 0
                         and getattr(x, "time", None) is not None), None)
            if last is None:
                raise RuntimeError(f"{contract.symbol}: no timestamped live Last trade during sample")
            timestamp = last.time.astimezone(timezone.utc).isoformat()
            trade_id = hashlib.sha256(
                f"{contract.conId}:{timestamp}:{last.price}:{last.size}:{getattr(last, 'exchange', '')}".encode()
            ).hexdigest()
            trades.append({
                "ticker": contract.symbol, "conId": contract.conId,
                "price": float(last.price), "lastSize": float(last.size),
                "timestamp": timestamp, "tradeId": f"IBKR:{trade_id}",
                "sourceType": "LAST_TRADE", "marketDataType": 1,
                "session": "UNATTESTED",  # receiver independently proves NYSE 09:30–16:00
            })
        envelope = {
            "provider": "IBKR_TWS", "connected": ib.isConnected(),
            "readOnly": True, "marketDataType": 1,
            "collectedAt": datetime.now(timezone.utc).isoformat(),
            "trades": trades,
        }
        destination = Path(output).expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        tmp = destination.with_suffix(destination.suffix + ".tmp")
        tmp.write_text(json.dumps(envelope, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, destination)
        print(json.dumps({"status": "CAPTURED_LOCAL_ONLY", "path": str(destination),
                          "symbols": [x["ticker"] for x in trades]}))
    finally:
        for contract, ticker in subscriptions:
            try:
                ib.cancelTickByTickData(contract, "Last")
                ib.cancelMktData(contract)
            except Exception:
                pass
        ib.disconnect()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7497,
                        help="TWS paper 7497, TWS live 7496 by common defaults; verify your TWS settings")
    parser.add_argument("--client-id", type=int, default=91)
    parser.add_argument("--symbols", nargs="+", required=True)
    parser.add_argument("--seconds", type=float, default=8)
    parser.add_argument("--output", default="tws-quote-evidence.json")
    args = parser.parse_args()
    if not 1 <= len(args.symbols) <= 40 or any(not s.isascii() or
        not s.replace(".", "").replace("-", "").isalnum() or s != s.upper() for s in args.symbols):
        parser.error("1–40 valid uppercase stock tickers required")
    capture(args.host, args.port, args.client_id, args.symbols, args.output, args.seconds)

if __name__ == "__main__":
    main()
