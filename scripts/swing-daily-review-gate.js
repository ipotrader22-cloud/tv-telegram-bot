"use strict";

const assert = require("node:assert/strict");

// Public note dates can advance before a complete score reassessment.
// Event parity deliberately does not call this morning-report gate.
function assertDailyReview(data, expected) {
  assert.equal(data.snapshot_date, expected, "Expected production review must be published");
  assert.equal(data.equity_history_latest_date, expected, "Today's equity history must be published");
  const incomplete = /\b(?:ranking|rankings|score)\b[^.!?\n]*\b(?:reassessment|review)\s+pending\b|\b(?:not reassessed|not re-scored|not rescored)\b/i;
  for (const [rows, dateField, noteField] of [
    [data.active_portfolio, "last_review_date", "brief_note"],
    [data.interns, "review_date", "brief_reason"],
  ]) {
    for (const item of rows) {
      assert.equal(item[dateField], expected, item.ticker + " review must be current");
      const note = String(item[noteField] || "").trim();
      assert.ok(note, item.ticker + " must have a research note");
      assert.ok(!incomplete.test(note), item.ticker + " ranking reassessment is incomplete");
    }
  }
}

module.exports = { assertDailyReview };

