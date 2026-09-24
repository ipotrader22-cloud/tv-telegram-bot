"""Reconnect-safe dashboard quote subscription adapter.

This adapter is intentionally limited to the dashboard market-data subscription
cache. It does not place, cancel, size, or otherwise modify broker orders.
"""

from __future__ import annotations

from typing import Any, Iterable


def install_quote_reconnect_adapter(core: Any) -> None:
    """Recreate quote subscriptions after the IB connection generation changes."""
    if getattr(core, "_quote_reconnect_adapter_installed", False):
        return

    original_ensure_quote_subscriptions = core.ensure_quote_subscriptions
    core._quote_subscription_generation = None

    def invalidate_stale_generation() -> bool:
        connection_generation = int(
            getattr(core, "_ib_connection_generation", 0) or 0
        )
        subscription_generation = getattr(
            core,
            "_quote_subscription_generation",
            None,
        )

        if subscription_generation is None:
            core._quote_subscription_generation = connection_generation
            return False

        if int(subscription_generation) == connection_generation:
            return False

        stale_symbols = sorted(
            str(symbol)
            for symbol in getattr(core, "_quote_tickers", {}).keys()
        )

        # A socket reconnect invalidates server-side reqMktData subscriptions.
        # Do not call cancelMktData for the old connection: those request IDs no
        # longer belong to the new socket session and can generate noisy Error 300.
        getattr(core, "_quote_tickers", {}).clear()
        getattr(core, "_quote_contracts", {}).clear()
        core._quote_subscription_generation = connection_generation

        print(
            "[QUOTE RESUBSCRIBE] "
            f"previous_generation={subscription_generation} "
            f"connection_generation={connection_generation} "
            f"stale_symbols={','.join(stale_symbols) if stale_symbols else 'none'}"
        )
        return True

    async def ensure_quote_subscriptions_with_reconnect(
        symbols: Iterable[str],
    ) -> None:
        # Establish/observe the current generation before the original function
        # checks its in-memory ticker cache.
        await core.ensure_ib_connected()
        invalidate_stale_generation()

        await original_ensure_quote_subscriptions(symbols)

        # A disconnect can race with the first check and be recovered by the
        # original function's own ensure_ib_connected() call. If that happened,
        # invalidate the old cache and immediately recreate subscriptions once.
        if invalidate_stale_generation():
            await original_ensure_quote_subscriptions(symbols)

    core.ensure_quote_subscriptions = ensure_quote_subscriptions_with_reconnect
    core._quote_reconnect_adapter_installed = True
