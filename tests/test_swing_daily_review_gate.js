"use strict";
const assert = require("node:assert/strict");
const { assertDailyReview } = require("../scripts/swing-daily-review-gate");
const date = "2026-10-12";
const fixture = () => ({ snapshot_date: date, equity_history_latest_date: date,
  active_portfolio: [{ ticker: "AMD", last_review_date: date, brief_note: "Oct12 AMD news: AI launch. Ranking increased to 82." }],
  interns: [{ ticker: "PANW", review_date: date, brief_reason: "Oct12 PANW news: Cybersecurity demand. Ranking unchanged at 80." }],
});
assert.doesNotThrow(() => assertDailyReview(fixture(), date));
for (const note of ["Ranking retained at 81; reassessment pending.", "full score review pending (last scoredOct9)", "Ranking not reassessed."]) {
  const data = fixture(); data.active_portfolio[0].brief_note = note;
  assert.throws(() => assertDailyReview(data, date), /ranking reassessment is incomplete/);
}
const candidate = fixture(); candidate.interns[0].brief_reason = "Ranking retained at 80; reassessment pending.";
assert.throws(() => assertDailyReview(candidate, date), /PANW ranking/);
const old = fixture(); old.active_portfolio[0].last_review_date = "2026-10-09";
assert.throws(() => assertDailyReview(old, date), /review must be current/);
const empty = fixture(); empty.interns[0].brief_reason = "";
assert.throws(() => assertDailyReview(empty, date), /research note/);
console.log("Swing daily review rejects current-dated incomplete rankings: PASS");

