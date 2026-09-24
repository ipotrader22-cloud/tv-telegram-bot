import asyncio
from types import SimpleNamespace

from bridge.quote_reconnect_adapter import install_quote_reconnect_adapter


class FakeIB:
    def cancelMktData(self, _contract):
        raise AssertionError(
            "stale reconnect path must not cancel old market-data request IDs"
        )


def make_core():
    calls = []
    core = SimpleNamespace(
        _ib_connection_generation=1,
        _quote_tickers={},
        _quote_contracts={},
        ib=FakeIB(),
    )

    async def ensure_ib_connected():
        return None

    async def ensure_quote_subscriptions(symbols):
        symbols = list(symbols)
        calls.append({
            "generation": core._ib_connection_generation,
            "symbols": symbols,
            "cache_before": sorted(core._quote_tickers),
        })
        for symbol in symbols:
            core._quote_tickers.setdefault(symbol, object())
            core._quote_contracts.setdefault(symbol, object())

    core.ensure_ib_connected = ensure_ib_connected
    core.ensure_quote_subscriptions = ensure_quote_subscriptions
    core.calls = calls
    return core


def test_initial_subscription_keeps_normal_path():
    core = make_core()
    install_quote_reconnect_adapter(core)
    asyncio.run(core.ensure_quote_subscriptions(["SOXL"]))

    assert core._quote_subscription_generation == 1
    assert core.calls == [{
        "generation": 1,
        "symbols": ["SOXL"],
        "cache_before": [],
    }]
    assert sorted(core._quote_tickers) == ["SOXL"]


def test_same_generation_does_not_clear_cache():
    core = make_core()
    core._quote_tickers["SOXL"] = object()
    core._quote_contracts["SOXL"] = object()
    install_quote_reconnect_adapter(core)

    asyncio.run(core.ensure_quote_subscriptions(["SOXL"]))
    first_ticker = core._quote_tickers["SOXL"]
    asyncio.run(core.ensure_quote_subscriptions(["SOXL"]))

    assert core._quote_tickers["SOXL"] is first_ticker
    assert [call["cache_before"] for call in core.calls] == [
        ["SOXL"],
        ["SOXL"],
    ]


def test_generation_change_clears_stale_cache_before_resubscribe():
    core = make_core()
    install_quote_reconnect_adapter(core)
    asyncio.run(core.ensure_quote_subscriptions(["SOXL", "UBER"]))
    old_soxl = core._quote_tickers["SOXL"]

    core._ib_connection_generation = 2
    asyncio.run(core.ensure_quote_subscriptions(["SOXL", "UBER"]))

    assert core._quote_subscription_generation == 2
    assert core.calls[-1]["cache_before"] == []
    assert sorted(core._quote_tickers) == ["SOXL", "UBER"]
    assert core._quote_tickers["SOXL"] is not old_soxl


def test_reconnect_during_original_call_retries_once():
    core = make_core()
    original = core.ensure_quote_subscriptions
    call_count = 0

    async def racing_original(symbols):
        nonlocal call_count
        call_count += 1
        await original(symbols)
        if call_count == 1:
            core._ib_connection_generation = 2

    core.ensure_quote_subscriptions = racing_original
    install_quote_reconnect_adapter(core)
    asyncio.run(core.ensure_quote_subscriptions(["SOXL"]))

    assert call_count == 2
    assert core._quote_subscription_generation == 2
    assert core.calls[1]["cache_before"] == []


def test_install_is_idempotent():
    core = make_core()
    install_quote_reconnect_adapter(core)
    wrapped = core.ensure_quote_subscriptions
    install_quote_reconnect_adapter(core)

    assert core.ensure_quote_subscriptions is wrapped


if __name__ == "__main__":
    tests = [
        test_initial_subscription_keeps_normal_path,
        test_same_generation_does_not_clear_cache,
        test_generation_change_clears_stale_cache_before_resubscribe,
        test_reconnect_during_original_call_retries_once,
        test_install_is_idempotent,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
