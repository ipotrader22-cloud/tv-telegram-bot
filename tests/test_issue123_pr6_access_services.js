"use strict";
const assert=require("assert");
const fs=require("fs");
const layer=require("../website_conversion_access_services_refinement");
const offer=require("../lib/website-commercial-offer");

const signal=layer.renderTelegramExample();
assert(signal.includes('Vixale Prime opened LONG'));
assert(signal.includes('[TICKER]'));
assert(signal.includes('Entry: <b>[entry]</b>'));
assert(signal.includes('Target: <b>[target]</b>'));
assert(signal.includes('Stop Ref: <b>[stop]</b>'));
assert(signal.includes('illustrative format using placeholders'));
assert(signal.includes('not a live trade'));
assert(signal.includes(offer.DAY_TRIAL_URL));
assert(signal.includes('Swing Trading and Options remain website-update products'));
assert(!signal.match(/\$\d+(?:\.\d+)?\s*(?:entry|target|stop)/i));

const access=layer.renderAccessIntro('options');
assert(access.includes('Request free read-only viewer access.'));
assert(access.includes('Viewer access is for protected website detail'));
assert(access.includes('30-day Day Trading Telegram signals trial'));
assert(access.includes('$49/month'));
assert(access.includes('$99/month'));
assert(access.includes('Viewer request form ↓'));

const services=layer.renderServicesIntro();
assert(services.includes('CUSTOM SERVICES'));
assert(services.includes('Services are scoped custom work'));
assert(services.includes('Signals &amp; Research'));
assert(services.includes('Automation / Setup'));
assert(services.includes('Strategy Review / Development'));
assert(services.includes('Custom Bot / Integration'));
assert(services.includes('/pricing'));

const base='<!doctype html><html><head></head><body><main><section id="existing-form">EXISTING FORM</section></main></body></html>';
const refinedAccess=layer.refineAccess(base,'day-trading');
assert(refinedAccess.includes('EXISTING FORM'));
assert(refinedAccess.indexOf('Request free read-only viewer access.')<refinedAccess.indexOf('EXISTING FORM'));
const refinedServices=layer.refineServices(base);
assert(refinedServices.includes('EXISTING FORM'));
assert(refinedServices.indexOf('CUSTOM SERVICES')<refinedServices.indexOf('EXISTING FORM'));
const refinedDay=layer.refineDay(base);
assert(refinedDay.includes('EXISTING FORM'));
assert(refinedDay.indexOf('EXISTING FORM')<refinedDay.indexOf('Vixale Prime opened LONG'));

const packageJson=JSON.parse(fs.readFileSync(require.resolve('../package.json'),'utf8'));
assert(packageJson.scripts.start.startsWith('node -r ./website_conversion_access_services_refinement.js -r ./website_conversion_pricing_refinement.js'));
console.log('Issue #123 PR6 access/services regression PASS');
