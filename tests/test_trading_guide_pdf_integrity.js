"use strict";

const assert = require("assert");
const { readUpdatedPdfBuffer } = require("../website_options_straddle_refinement");

const pdf = readUpdatedPdfBuffer();
assert(pdf.length > 5000, "Trading Guide PDF should be a substantive document");
assert.strictEqual(pdf.subarray(0, 5).toString("ascii"), "%PDF-", "Trading Guide must have a PDF signature");
assert(pdf.subarray(Math.max(0, pdf.length - 256)).toString("latin1").includes("%%EOF"), "Trading Guide must have a PDF EOF marker");
assert(pdf.toString("latin1").includes("/Count 5"), "Trading Guide should contain five pages");
console.log("Trading Guide PDF integrity: PASS");
