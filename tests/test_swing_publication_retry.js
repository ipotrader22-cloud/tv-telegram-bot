"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyWithRetry } = require("../scripts/qa-swing-publication-retry");

test("transient failure recovers and never runs another attempt after PASS", async () => {
  let calls = 0; const delays = [];
  const result = await verifyWithRetry(() => ({ status: ++calls === 2 ? 0 : 1 }), async ms => delays.push(ms));
  assert.equal(result.result, "PASS"); assert.equal(calls, 2); assert.deepEqual(delays, [60000]);
  assert.equal(result.evidence.length, 2);
});
test("stale publication exhausts the bounded retries and remains FAIL", async () => {
  let calls = 0; let waits = 0;
  const result = await verifyWithRetry(() => ({ status: 1, stderr: "prior-day review", call: ++calls }), async () => waits++);
  assert.equal(result.result, "FAIL"); assert.equal(calls, 4); assert.equal(waits, 3);
  assert.ok(result.evidence.every(item => item.stderr === "prior-day review"));
});
test("timeout is a failed attempt, never a PASS", async () => {
  const result = await verifyWithRetry(() => ({ status: null, error: "timeout" }), async () => {}, 1);
  assert.equal(result.result, "FAIL"); assert.equal(result.evidence[0].error, "timeout");
});

