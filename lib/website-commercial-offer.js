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

const VIEWER_ACCESS_BASE_URL = "/access";
const LOGIN_URL = "/dashboard";
const RESULTS_PATH = "/results";

function viewerAccessUrl(systemKey = "") {
  const key = String(systemKey || "").trim().toLowerCase();
  return key ? `${VIEWER_ACCESS_BASE_URL}?system=${encodeURIComponent(key)}` : VIEWER_ACCESS_BASE_URL;
}

const OFFER_DEFINITIONS = Object.freeze({
  "day-trading": Object.freeze({
    key: "day-trading",
    label: "Day Trading",
    monthly_price: SINGLE_SYSTEM_PRICE_MONTHLY,
    delivery: "Telegram signals and website activity",
    explore_path: "/trading-systems/day-trading",
    results_path: "/results#day-trading",
    public_description: "Public Day Trading status, realized results, daily recaps, and closed-trade evidence.",
    protected_description: "Approved viewers can open the read-only Day Trading dashboard.",
    subscription_request_url: singleSystemRequestUrl("Day Trading"),
    viewer_access_url: viewerAccessUrl("day-trading"),
  }),
  "swing-trading": Object.freeze({
    key: "swing-trading",
    label: "Swing Trading",
    monthly_price: SINGLE_SYSTEM_PRICE_MONTHLY,
    delivery: "Website updates",
    explore_path: "/trading-systems/swing-trading#active-portfolio",
    results_path: "/results#swing-trading",
    public_description: "The Active Portfolio, candidates, closed trades, and model equity history are public.",
    protected_description: "Viewer access is not required to review the public Swing model portfolio.",
    subscription_request_url: singleSystemRequestUrl("Swing Trading"),
    viewer_access_url: viewerAccessUrl("swing-trading"),
  }),
  options: Object.freeze({
    key: "options",
    label: "Options",
    monthly_price: SINGLE_SYSTEM_PRICE_MONTHLY,
    delivery: "Website updates",
    explore_path: "/trading-systems/options",
    results_path: "/results#options",
    public_description: "The Options performance chart and Option Journal are public.",
    protected_description: "Brokerage proof files and any entitled protected viewer detail remain behind approved viewer access.",
    subscription_request_url: singleSystemRequestUrl("Options"),
    viewer_access_url: viewerAccessUrl("options"),
  }),
});

function systemOffer(keyOrLabel) {
  const value = String(keyOrLabel || "").trim().toLowerCase();
  if (OFFER_DEFINITIONS[value]) return OFFER_DEFINITIONS[value];
  return Object.values(OFFER_DEFINITIONS).find(offer => offer.label.toLowerCase() === value) || null;
}

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
  VIEWER_ACCESS_BASE_URL,
  LOGIN_URL,
  RESULTS_PATH,
  OFFER_DEFINITIONS,
  viewerAccessUrl,
  systemOffer,
};
