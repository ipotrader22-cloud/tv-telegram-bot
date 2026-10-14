'use strict';
const { isSmioRsiPayload } = require('./smio-rsi-gate');
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;

function identity(d) {
  if (!d || d.experimental_contract !== 'SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013' ||
      d.system_id !== 'TRADING_LAB_SMIO_RSI_PAPER' || d.strategy_id !== 'SMIO_RSI_RESEARCH' ||
      d.mode !== 'PAPER' || d.research_version !== 'PINE_0.1' || d.sec_type !== 'STK' ||
      d.initial_capital !== 1000000 || d.paper_contract_version !== 1) return false;
  if (d.strategy !== undefined && d.strategy !== 'SMIO_RSI_RESEARCH') return false;
  if (typeof d.symbol !== 'string' || !/^[A-Z][A-Z0-9.\-]{0,15}$/.test(d.symbol) ||
      typeof d.timeframe !== 'string' || !/^[1-9][0-9]{0,3}$/.test(d.timeframe) ||
      typeof d.tickerid !== 'string' || d.tickerid.split(':').at(-1) !== d.symbol ||
      typeof d.configuration_id !== 'string' || !d.configuration_id.startsWith('PINE01:') ||
      !['LONG', 'SHORT'].includes(d.side)) return false;
  const prefix = `SMIO_RSI_RESEARCH:${d.configuration_id}:${d.tickerid}:${d.timeframe}:${d.side}:`;
  const parts = d.configuration_id.split(':');
  if (parts.length !== 14 || [1, 2, 3, 4, 7, 8, 9].some(i => !/^[1-9][0-9]*$/.test(parts[i])) ||
      [5, 6, 13].some(i => !['true', 'false'].includes(parts[i])) || !positive(Number(parts[11])) ||
      !['Auto', 'Stocks RTH'].includes(parts[12]) ||
      ({ ATR: 'ATR', 'RSI 80/20': 'RSI_80_20', 'First of either': 'FirstOfEither' })[parts[10]] !== d.target_mode) return false;
  return typeof d.setup_id === 'string' && d.setup_id.startsWith(prefix) && /^\d+$/.test(d.setup_id.slice(prefix.length));
}

function validateSmioSignal(d, now = Date.now()) {
  const bad = reason => ({ ok: false, reason });
  if (!identity(d) || d.source !== 'TradingView') return bad('SMIO identity mismatch');
  if (!positive(d.qty) || !Number.isInteger(d.qty) || d.qty_source !== 'TV Strategy Properties') return bad('SMIO exact whole-share quantity required');
  if (!positive(d.entry) || !positive(d.price) || d.entry_order_type !== 'MARKET' || d.session_timezone !== 'America/New_York') return bad('SMIO reference / session mismatch');
  const entry = ['BUY', 'SELL'].includes(d.signal);
  if (entry) {
    if (d.event !== 'SETUP' || d.reason !== 'RSI_ENTRY' || d.side !== (d.signal === 'BUY' ? 'LONG' : 'SHORT')) return bad('SMIO entry mapping mismatch');
  } else if (d.signal !== 'CLOSE' || d.event !== 'CLOSE_POSITION' || !['RSI_STOP', 'RSI_PROFIT', 'RTH_EOD'].includes(d.reason)) return bad('SMIO close mapping mismatch');
  if (!Number.isInteger(d.signal_bar_time) || !Number.isInteger(d.signal_bar_close) || d.signal_bar_time <= 0 || d.signal_bar_close <= d.signal_bar_time) return bad('SMIO timestamps invalid');
  if (entry && !d.setup_id.endsWith(`:${d.signal_bar_time}`)) return bad('SMIO setup timestamp mismatch');
  if (d.event_id !== `${d.setup_id}:${d.signal}:${d.signal_bar_close}:${d.reason}`) return bad('SMIO event identity mismatch');
  if (d.signal_bar_close > now + 5000 || (entry && now - d.signal_bar_close > 90000)) return bad('SMIO stale / future signal');
  if (d.target_mode === 'RSI_80_20') {
    if (d.target !== null || d.target_price !== null) return bad('SMIO RSI target must be null');
  } else if (!['ATR', 'FirstOfEither'].includes(d.target_mode) || !positive(d.target) || d.target_price !== d.target ||
             (d.side === 'LONG' ? d.target <= d.entry : d.target >= d.entry)) return bad('SMIO target invalid');
  return { ok: true, reason: 'SMIO experimental demo signal' };
}

function validSmioCallback(d) {
  if (!identity(d) || d.source !== 'IB_BRIDGE' || !Number.isInteger(d.qty) || d.qty <= 0 || !positive(d.price)) return false;
  if (d.event === 'ENTRY_FILL') return d.entry_filled === true && ['Filled', 'Cancelled', 'ApiCancelled', 'Inactive'].includes(d.ib_entry_status) &&
    positive(d.ib_entry_fill_price) && d.price === d.ib_entry_fill_price && d.qty === d.ib_entry_filled_qty &&
    Array.isArray(d.entry_exec_ids) && d.entry_exec_ids.length > 0 && d.entry_exec_ids.every(x => typeof x === 'string' && x) &&
    Number(d.ib_order_id) > 0 && typeof d.ib_order_ref === 'string' && d.ib_order_ref.startsWith('SMIOE_') &&
    (d.target_mode === 'RSI_80_20' || (Number(d.ib_target_order_id) > 0 && String(d.ib_target_order_ref).startsWith('SMIOT_')));
  if (!['TP', 'CLOSE_STOP', 'EOD_CLOSE'].includes(d.event) || d.broker_confirmed_flat !== true ||
      d.position_after_close !== 0 || d.close_filled !== true || d.ib_close_status !== 'Filled' ||
      d.ib_close_filled_qty !== d.qty || d.ib_close_fill_price !== d.price || !d.reconciliation_id || !d.exit_execution_id) return false;
  const entries = Object.entries(d.execution_components || {});
  return entries.length > 0 && entries.every(([id, e]) => id && positive(e.qty) && positive(e.price)) &&
    entries.reduce((q, [, e]) => q + e.qty, 0) === d.qty &&
    Math.abs(entries.reduce((v, [, e]) => v + e.qty * e.price, 0) / d.qty - d.price) < 1e-8 &&
    Number(d.ib_order_id) > 0 && /^SMIO[CT]_/.test(String(d.ib_order_ref));
}

function blockedSmio(d) {
  return isSmioRsiPayload(d) && !(validateSmioSignal(d).ok || validSmioCallback(d));
}
module.exports = { identity, validateSmioSignal, validSmioCallback, blockedSmio };
