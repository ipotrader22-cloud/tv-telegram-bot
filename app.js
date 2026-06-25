//@version=6
strategy("SuperTrend Flip | Vixale JSON Automation | ATR Target + Close Stop",
     overlay=true,
     initial_capital=1000000,
     default_qty_type=strategy.fixed,
     default_qty_value=2,
     pyramiding=0,
     commission_type=strategy.commission.cash_per_contract,
     commission_value=2.50,
     process_orders_on_close=true,
     calc_on_every_tick=false,
     calc_on_order_fills=true,
     max_labels_count=500)

//────────────────────────────────────────────────────────────
// Inputs — SuperTrend
//────────────────────────────────────────────────────────────
superTrendAtrPeriod = input.int(10, "SuperTrend ATR Period", minval=1, group="SuperTrend")
superTrendFactor = input.float(3.0, "SuperTrend Factor", minval=0.1, step=0.1, group="SuperTrend")

//────────────────────────────────────────────────────────────
// Inputs — Risk / Size
//────────────────────────────────────────────────────────────
tradeQty = input.int(2, "Contracts / Shares", minval=1, maxval=100000, group="Risk / Size")

riskAtrPeriod = input.int(14, "Risk ATR Period", minval=1, group="Risk / Size")

useAtrCloseStop = input.bool(true, "Use ATR Stop Close Only", group="Risk / Size")
atrStopMult = input.float(1.0, "ATR Stop Multiplier", minval=0.1, maxval=20.0, step=0.1, group="Risk / Size")

useAtrLimitTarget = input.bool(true, "Use ATR Limit Target", group="Risk / Size")
atrTargetMult = input.float(2.0, "ATR Target Multiplier", minval=0.1, maxval=50.0, step=0.1, group="Risk / Size")

//────────────────────────────────────────────────────────────
// Inputs — Direction
//────────────────────────────────────────────────────────────
enableLongs = input.bool(true, "Enable Longs", group="Trade Direction")
enableShorts = input.bool(true, "Enable Shorts", group="Trade Direction")

//────────────────────────────────────────────────────────────
// Inputs — Session / EOD
//────────────────────────────────────────────────────────────
useRthOnly = input.bool(true, "Use RTH Only", group="Session / EOD")
closeAtRthEnd = input.bool(true, "Close At RTH End", group="Session / EOD")

rthSession = input.session("0930-1600:23456", "RTH Session", group="Session / EOD")
sessionTimezoneInput = input.string(
     "America/New_York",
     "Session Timezone",
     options=["America/New_York", "America/Chicago", "Exchange"],
     group="Session / EOD")

rthEndHour = input.int(16, "RTH End Hour", minval=0, maxval=23, group="Session / EOD")
rthEndMinute = input.int(0, "RTH End Minute", minval=0, maxval=59, group="Session / EOD")

//────────────────────────────────────────────────────────────
// Inputs — Alert / Symbol
//────────────────────────────────────────────────────────────
symbolOverride = input.string("", "Symbol Override For Bridge", group="Alert JSON")

//────────────────────────────────────────────────────────────
// Inputs — Visuals
//────────────────────────────────────────────────────────────
showSignals = input.bool(true, "Show Buy/Sell Arrows", group="Visuals")
showSuperTrend = input.bool(true, "Show SuperTrend Line", group="Visuals")
showRiskLevels = input.bool(true, "Show ATR Stop/Target Lines", group="Visuals")
showEodMarker = input.bool(true, "Show EOD Close Marker", group="Visuals")

//────────────────────────────────────────────────────────────
// Session Logic
//────────────────────────────────────────────────────────────
sessionTimezone = sessionTimezoneInput == "Exchange" ? syminfo.timezone : sessionTimezoneInput

inRth = not na(time(timeframe.period, rthSession, sessionTimezone))

rthEndTimestamp = timestamp(
     sessionTimezone,
     year(time, sessionTimezone),
     month(time, sessionTimezone),
     dayofmonth(time, sessionTimezone),
     rthEndHour,
     rthEndMinute)

isRthEndCloseBar =
     barstate.isconfirmed and
     useRthOnly and
     closeAtRthEnd and
     inRth and
     time_close >= rthEndTimestamp

canTradeBySession =
     not useRthOnly or
     (inRth and not isRthEndCloseBar)

//────────────────────────────────────────────────────────────
// SuperTrend
// TradingView convention:
// direction < 0 = bullish trend
// direction > 0 = bearish trend
//────────────────────────────────────────────────────────────
[superTrend, direction] = ta.supertrend(superTrendFactor, superTrendAtrPeriod)

bullTrend = direction < 0
bearTrend = direction > 0

bullFlip = barstate.isconfirmed and bullTrend and bearTrend[1]
bearFlip = barstate.isconfirmed and bearTrend and bullTrend[1]

//────────────────────────────────────────────────────────────
// ATR
//────────────────────────────────────────────────────────────
riskAtr = ta.atr(riskAtrPeriod)

//────────────────────────────────────────────────────────────
// Signals
//────────────────────────────────────────────────────────────
longSignal = canTradeBySession and enableLongs and bullFlip
shortSignal = canTradeBySession and enableShorts and bearFlip

//────────────────────────────────────────────────────────────
// ATR State
//────────────────────────────────────────────────────────────
var float pendingAtr = na
var float entryAtr = na
var int entryBar = na

if longSignal or shortSignal
    pendingAtr := riskAtr

newLongPosition = strategy.position_size > 0 and strategy.position_size[1] <= 0
newShortPosition = strategy.position_size < 0 and strategy.position_size[1] >= 0
reversedPosition = (strategy.position_size > 0 and strategy.position_size[1] < 0) or (strategy.position_size < 0 and strategy.position_size[1] > 0)
becameFlat = strategy.position_size == 0 and strategy.position_size[1] != 0

if newLongPosition or newShortPosition or reversedPosition
    entryAtr := na(pendingAtr) ? riskAtr : pendingAtr
    entryBar := bar_index
    pendingAtr := na

if becameFlat
    entryAtr := na
    entryBar := na

if strategy.position_size != 0 and na(entryAtr)
    entryAtr := riskAtr
    entryBar := bar_index

//────────────────────────────────────────────────────────────
// Levels
//────────────────────────────────────────────────────────────
longStop = strategy.position_avg_price - entryAtr * atrStopMult
longTarget = strategy.position_avg_price + entryAtr * atrTargetMult

shortStop = strategy.position_avg_price + entryAtr * atrStopMult
shortTarget = strategy.position_avg_price - entryAtr * atrTargetMult

estimatedLongEntry = close
estimatedLongStop = close - riskAtr * atrStopMult
estimatedLongTarget = close + riskAtr * atrTargetMult

estimatedShortEntry = close
estimatedShortStop = close + riskAtr * atrStopMult
estimatedShortTarget = close - riskAtr * atrTargetMult

//────────────────────────────────────────────────────────────
// Stop Conditions
//────────────────────────────────────────────────────────────
longCloseStopHit =
     barstate.isconfirmed and
     strategy.position_size > 0 and
     useAtrCloseStop and
     not na(entryAtr) and
     not na(entryBar) and
     bar_index > entryBar and
     close <= longStop

shortCloseStopHit =
     barstate.isconfirmed and
     strategy.position_size < 0 and
     useAtrCloseStop and
     not na(entryAtr) and
     not na(entryBar) and
     bar_index > entryBar and
     close >= shortStop

stopTriggered = longCloseStopHit or shortCloseStopHit

//────────────────────────────────────────────────────────────
// EOD Close
//────────────────────────────────────────────────────────────
longEodClose =
     isRthEndCloseBar and
     strategy.position_size > 0

shortEodClose =
     isRthEndCloseBar and
     strategy.position_size < 0

eodCloseTriggered = longEodClose or shortEodClose

//────────────────────────────────────────────────────────────
// JSON Alert Messages For ib_bridge.py
//────────────────────────────────────────────────────────────
payloadSymbol = str.length(symbolOverride) > 0 ? symbolOverride : syminfo.ticker

longSetupJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"SETUP\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"LONG\"," +
     "\"entry\":" + str.tostring(estimatedLongEntry, format.mintick) + "," +
     "\"target\":" + str.tostring(estimatedLongTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(estimatedLongStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"SUPER_TREND_BULL_FLIP\"" +
     "}"

shortSetupJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"SETUP\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"SHORT\"," +
     "\"entry\":" + str.tostring(estimatedShortEntry, format.mintick) + "," +
     "\"target\":" + str.tostring(estimatedShortTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(estimatedShortStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"SUPER_TREND_BEAR_FLIP\"" +
     "}"

longCloseStopJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"CLOSE_STOP\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"LONG\"," +
     "\"entry\":" + str.tostring(strategy.position_avg_price, format.mintick) + "," +
     "\"price\":" + str.tostring(close, format.mintick) + "," +
     "\"target\":" + str.tostring(longTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(longStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"ATR_CLOSE_STOP\"" +
     "}"

shortCloseStopJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"CLOSE_STOP\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"SHORT\"," +
     "\"entry\":" + str.tostring(strategy.position_avg_price, format.mintick) + "," +
     "\"price\":" + str.tostring(close, format.mintick) + "," +
     "\"target\":" + str.tostring(shortTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(shortStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"ATR_CLOSE_STOP\"" +
     "}"

longFlipCloseJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"CLOSE_STOP\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"LONG\"," +
     "\"entry\":" + str.tostring(strategy.position_avg_price, format.mintick) + "," +
     "\"price\":" + str.tostring(close, format.mintick) + "," +
     "\"target\":" + str.tostring(longTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(longStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"SUPER_TREND_OPPOSITE_FLIP\"" +
     "}"

shortFlipCloseJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"CLOSE_STOP\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"SHORT\"," +
     "\"entry\":" + str.tostring(strategy.position_avg_price, format.mintick) + "," +
     "\"price\":" + str.tostring(close, format.mintick) + "," +
     "\"target\":" + str.tostring(shortTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(shortStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"SUPER_TREND_OPPOSITE_FLIP\"" +
     "}"

longEodJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"EOD_CLOSE\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"LONG\"," +
     "\"entry\":" + str.tostring(strategy.position_avg_price, format.mintick) + "," +
     "\"price\":" + str.tostring(close, format.mintick) + "," +
     "\"target\":" + str.tostring(longTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(longStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"RTH_END_CLOSE\"" +
     "}"

shortEodJson =
     "{" +
     "\"source\":\"TradingView\"," +
     "\"strategy\":\"SUPER_TREND_ATR_CLOSE_STOP\"," +
     "\"event\":\"EOD_CLOSE\"," +
     "\"symbol\":\"" + payloadSymbol + "\"," +
     "\"side\":\"SHORT\"," +
     "\"entry\":" + str.tostring(strategy.position_avg_price, format.mintick) + "," +
     "\"price\":" + str.tostring(close, format.mintick) + "," +
     "\"target\":" + str.tostring(shortTarget, format.mintick) + "," +
     "\"stop\":" + str.tostring(shortStop, format.mintick) + "," +
     "\"qty\":" + str.tostring(tradeQty) + "," +
     "\"reason\":\"RTH_END_CLOSE\"" +
     "}"

//────────────────────────────────────────────────────────────
// Orders — Close Stop First
//────────────────────────────────────────────────────────────
if longCloseStopHit
    strategy.close("Long", comment="Long ATR Close Stop", alert_message=longCloseStopJson)

if shortCloseStopHit
    strategy.close("Short", comment="Short ATR Close Stop", alert_message=shortCloseStopJson)

//────────────────────────────────────────────────────────────
// Orders — EOD
//────────────────────────────────────────────────────────────
if longEodClose
    strategy.close("Long", comment="RTH End Close", alert_message=longEodJson)

if shortEodClose
    strategy.close("Short", comment="RTH End Close", alert_message=shortEodJson)

//────────────────────────────────────────────────────────────
// Orders — Entries / Reversals
// Sends SETUP JSON to ib_bridge.py.
// For reversals, sends close first, then new setup.
//────────────────────────────────────────────────────────────
if not stopTriggered and not eodCloseTriggered
    if longSignal
        if strategy.position_size < 0
            strategy.close("Short", comment="Short Closed On Bull Flip", alert_message=shortFlipCloseJson)
        if strategy.position_size <= 0
            strategy.entry("Long", strategy.long, qty=tradeQty, alert_message=longSetupJson)

    if shortSignal
        if strategy.position_size > 0
            strategy.close("Long", comment="Long Closed On Bear Flip", alert_message=longFlipCloseJson)
        if strategy.position_size >= 0
            strategy.entry("Short", strategy.short, qty=tradeQty, alert_message=shortSetupJson)

//────────────────────────────────────────────────────────────
// ATR Limit Target For Backtest Only
// Alert disabled because TWS target is attached by ib_bridge.py.
//────────────────────────────────────────────────────────────
if strategy.position_size > 0 and useAtrLimitTarget and not na(entryAtr)
    strategy.exit(
         "Long ATR Limit Target",
         from_entry="Long",
         limit=longTarget,
         disable_alert=true)

if strategy.position_size < 0 and useAtrLimitTarget and not na(entryAtr)
    strategy.exit(
         "Short ATR Limit Target",
         from_entry="Short",
         limit=shortTarget,
         disable_alert=true)

//────────────────────────────────────────────────────────────
// Plots — SuperTrend
//────────────────────────────────────────────────────────────
plot(
     showSuperTrend and bullTrend ? superTrend : na,
     title="Bullish SuperTrend",
     color=color.green,
     linewidth=2,
     style=plot.style_linebr)

plot(
     showSuperTrend and bearTrend ? superTrend : na,
     title="Bearish SuperTrend",
     color=color.red,
     linewidth=2,
     style=plot.style_linebr)

//────────────────────────────────────────────────────────────
// Plots — Signals
//────────────────────────────────────────────────────────────
plotshape(
     showSignals and longSignal,
     title="Buy",
     style=shape.triangleup,
     location=location.belowbar,
     color=color.green,
     text="Buy",
     textcolor=color.white,
     size=size.small)

plotshape(
     showSignals and shortSignal,
     title="Sell",
     style=shape.triangledown,
     location=location.abovebar,
     color=color.red,
     text="Sell",
     textcolor=color.white,
     size=size.small)

plotshape(
     showEodMarker and longEodClose,
     title="Long EOD Close",
     style=shape.xcross,
     location=location.abovebar,
     color=color.orange,
     text="EOD",
     textcolor=color.white,
     size=size.tiny)

plotshape(
     showEodMarker and shortEodClose,
     title="Short EOD Close",
     style=shape.xcross,
     location=location.belowbar,
     color=color.orange,
     text="EOD",
     textcolor=color.white,
     size=size.tiny)

//────────────────────────────────────────────────────────────
// Plots — Risk Levels
//────────────────────────────────────────────────────────────
plot(
     showRiskLevels and strategy.position_size > 0 and not na(entryAtr) ? longStop : na,
     title="Long ATR Close Stop",
     color=color.red,
     linewidth=1,
     style=plot.style_linebr)

plot(
     showRiskLevels and strategy.position_size > 0 and not na(entryAtr) ? longTarget : na,
     title="Long ATR Limit Target",
     color=color.green,
     linewidth=1,
     style=plot.style_linebr)

plot(
     showRiskLevels and strategy.position_size < 0 and not na(entryAtr) ? shortStop : na,
     title="Short ATR Close Stop",
     color=color.red,
     linewidth=1,
     style=plot.style_linebr)

plot(
     showRiskLevels and strategy.position_size < 0 and not na(entryAtr) ? shortTarget : na,
     title="Short ATR Limit Target",
     color=color.green,
     linewidth=1,
     style=plot.style_linebr)

//────────────────────────────────────────────────────────────
// Optional Alert Conditions
// For live routing use strategy alert:
// {{strategy.order.alert_message}}
//────────────────────────────────────────────────────────────
alertcondition(longSignal, "SuperTrend Buy", "SuperTrend bullish setup.")
alertcondition(shortSignal, "SuperTrend Sell", "SuperTrend bearish setup.")
alertcondition(longCloseStopHit, "Long ATR Close Stop", "Long close-stop hit.")
alertcondition(shortCloseStopHit, "Short ATR Close Stop", "Short close-stop hit.")
alertcondition(longEodClose, "Long RTH End Close", "Long EOD close.")
alertcondition(shortEodClose, "Short RTH End Close", "Short EOD close.")
