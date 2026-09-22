"use strict";

const assert = require("assert");
const {
  HOME_PATH,
  SWING_PATH,
  GUIDE_URL,
  OLD_SWING_COPY,
  refineOwnerCopy,
} = require("../website_owner_copy_refinement");

const swing = `<!doctype html><html><head></head><body><p class="hero-copy">${OLD_SWING_COPY}</p></body></html>`;
const swingOut = refineOwnerCopy(swing, SWING_PATH);
assert(swingOut.includes("Active Portfolio based on Vixale's proprietary ranking system."));
assert(swingOut.includes("Positions are added and closed daily. Updated every morning around 10:00 am."));
assert(swingOut.includes(`href="${GUIDE_URL}"`));
assert(swingOut.includes(">trading guide</a>."));
assert(!swingOut.includes(OLD_SWING_COPY));
assert.strictEqual(refineOwnerCopy(swingOut, SWING_PATH), swingOut, "Swing owner-copy refinement must be idempotent");

for (const source of [
  "Closed Trades ledger · realized P&amp;L source",
  "Closed Trades ledger · realized P&amp;amp;L source",
  "Closed Trades ledger · realized P&L source",
  "Verified · Closed Trades ledger",
]) {
  const out = refineOwnerCopy(`<button>${source}</button>`, HOME_PATH);
  assert(out.includes("Closed Trades P&amp;L"), `must normalize home label variant: ${source}`);
  assert(!out.includes(source), `must remove old home label variant: ${source}`);
}

const unrelated = "<html><body>Unrelated page</body></html>";
assert.strictEqual(refineOwnerCopy(unrelated, "/pricing"), unrelated);
console.log("Owner-requested Swing copy and Closed Trades label: PASS");
