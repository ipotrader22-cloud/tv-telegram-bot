'use strict';
// Shared by server HTML and the serialized browser refresh, including RU.
const valuationTranslations = [
 ['Intraday valuation: timestamp-verified Google Finance quotes or completed Google minute closes; morning decision marks stay frozen.',
  'Внутридневная оценка: подтверждённые временем котировки Google Finance или завершённые минутные свечи; утренние цены решений сохранены.'],
 ['Market closed. Last regular-session valuation:', 'Рынок закрыт. Последняя оценка основной сессии:'],
 ['Quote times:', 'Время котировок:'],
 ['Some quotes are unavailable; unrealized P&L is withheld.', 'Часть котировок недоступна; суммарный нереализованный P&L не рассчитан.'],
 ['Quotes may be delayed.', 'Котировки могут быть задержаны.'],
 ['Quotes temporarily unavailable; unrealized P&L is withheld.', 'Котировки временно недоступны; нереализованный P&L не рассчитан.'],
];
function valuationNoticeParts(data) {
 const parts = data.valuation_market_open === false
  ? ['Market closed. Last regular-session valuation:', data.valuation_session_date || '—']
  : ['Intraday valuation: timestamp-verified Google Finance quotes or completed Google minute closes; morning decision marks stay frozen.'];
 const times = (data.active_portfolio || []).filter(p =>
  ['FRESH_DELAYED','FRESH_MINUTE_BAR','LAST_SESSION_QUOTE'].includes(p.valuation_status))
  .map(p => p.quote_timestamp_et).filter(Boolean).sort();
 if (data.valuation_market_open === false && times.length) {
  parts.push('Quote times:', times[0] === times.at(-1) ? times[0] : times[0] + ' – ' + times.at(-1));
  parts.push('Quotes may be delayed.');
 }
 if (data.valuation_coverage < data.active_count) parts.push('Some quotes are unavailable; unrealized P&L is withheld.');
 return parts;
}
module.exports = { valuationNoticeParts, valuationTranslations };
