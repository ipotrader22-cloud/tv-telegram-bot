"use strict";

const DAY_TRIAL_DAYS = 30;
const SINGLE_SYSTEM_PRICE_MONTHLY = 49;
const THREE_SYSTEM_BUNDLE_PRICE_MONTHLY = 99;
const THREE_SEPARATE_SYSTEMS_PRICE_MONTHLY = SINGLE_SYSTEM_PRICE_MONTHLY * 3;
const BUNDLE_SAVINGS_MONTHLY = THREE_SEPARATE_SYSTEMS_PRICE_MONTHLY - THREE_SYSTEM_BUNDLE_PRICE_MONTHLY;
const TELEGRAM_DM_URL = "https://t.me/tradervip22";
const DAY_TRIAL_REQUEST_TEXT = "Hello, I'd like to start the 30-day free Day Trading Telegram signals trial.";
const DAY_TRIAL_URL = `${TELEGRAM_DM_URL}?text=${encodeURIComponent(DAY_TRIAL_REQUEST_TEXT)}`;

const SYSTEMS = Object.freeze([
  Object.freeze({ key: "day-trading", label: "Day Trading", path: "/trading-systems/day-trading" }),
  Object.freeze({ key: "swing-trading", label: "Swing Trading", path: "/trading-systems/swing-trading" }),
  Object.freeze({ key: "options", label: "Options", path: "/trading-systems/options" }),
]);

const SINGLE_SYSTEM_PLAN = Object.freeze({
  key: "single-system",
  name: "Single System",
  monthly_price: SINGLE_SYSTEM_PRICE_MONTHLY,
  systems: SYSTEMS,
});

const THREE_SYSTEM_BUNDLE = Object.freeze({
  key: "three-system-bundle",
  name: "Three-System Bundle",
  monthly_price: THREE_SYSTEM_BUNDLE_PRICE_MONTHLY,
  includes: SYSTEMS.map(system => system.key),
  savings_monthly: BUNDLE_SAVINGS_MONTHLY,
});

function telegramRequestUrl(text) {
  return `${TELEGRAM_DM_URL}?text=${encodeURIComponent(String(text || "").trim())}`;
}

function singleSystemRequestText(systemLabel) {
  return `Hello, I'd like to request the $${SINGLE_SYSTEM_PRICE_MONTHLY}/month Single System plan for ${String(systemLabel || "").trim()}. Please send the onboarding details.`;
}

function singleSystemRequestUrl(systemLabel) {
  return telegramRequestUrl(singleSystemRequestText(systemLabel));
}

const BUNDLE_REQUEST_TEXT = `Hello, I'd like to request the $${THREE_SYSTEM_BUNDLE_PRICE_MONTHLY}/month Three-System Bundle for Day Trading, Swing Trading, and Options. Please send the onboarding details.`;
const BUNDLE_REQUEST_URL = telegramRequestUrl(BUNDLE_REQUEST_TEXT);

module.exports = {
  DAY_TRIAL_DAYS,
  SINGLE_SYSTEM_PRICE_MONTHLY,
  THREE_SYSTEM_BUNDLE_PRICE_MONTHLY,
  THREE_SEPARATE_SYSTEMS_PRICE_MONTHLY,
  BUNDLE_SAVINGS_MONTHLY,
  TELEGRAM_DM_URL,
  DAY_TRIAL_REQUEST_TEXT,
  DAY_TRIAL_URL,
  SYSTEMS,
  SINGLE_SYSTEM_PLAN,
  THREE_SYSTEM_BUNDLE,
  telegramRequestUrl,
  singleSystemRequestText,
  singleSystemRequestUrl,
  BUNDLE_REQUEST_TEXT,
  BUNDLE_REQUEST_URL,
};
