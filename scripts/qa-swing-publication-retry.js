"use strict";

const { spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const path = require("node:path");

// Publication-only retry. No credentials, portfolio writes or email delivery.
async function verifyWithRetry(run, sleep, attempts = 4) {
  const evidence = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await run();
    evidence.push({ attempt, checked_at: new Date().toISOString(), ...result });
    if (result.status === 0) return { result: "PASS", evidence };
    if (attempt < attempts) await sleep(60000);
  }
  return { result: "FAIL", evidence };
}

async function main() {
  const result = await verifyWithRetry(() => {
    const child = spawnSync(process.execPath, [path.join(__dirname, "qa-production-swing-parity.js")], {
      encoding: "utf8", timeout: 70000, maxBuffer: 1024 * 1024,
    });
    return { status: child.status, stdout: child.stdout || "", stderr: child.stderr || "", error: child.error?.message };
  }, ms => new Promise(resolve => setTimeout(resolve, ms)));
  const report = { gate: "PUBLICATION", expected_date: process.env.QA_SWING_EXPECTED_DATE, ...result };
  writeFileSync("swing-publication-evidence.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  process.exitCode = result.result === "PASS" ? 0 : 1;
}

module.exports = { verifyWithRetry };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

