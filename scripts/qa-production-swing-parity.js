"use strict";

// Public production smoke check for the private Swing Equity HTML and API.
// This runner has no viewer credentials. Never treat an anonymous 200 or
// login redirect as an authenticated snapshot-parity PASS. The authenticated
// fixture parity is separately checked by Swing Source Rollout CI.
const assert = require("node:assert/strict");

const ORIGIN = String(process.env.QA_EN_ORIGIN || "https://www.vixale.com").replace(/\/$/, "");
const PAGE = "/trading-systems/swing-trading";
const API = "/api/swing-leaders";
const PRIVATE_FIELDS = /"active_portfolio"|"reporting_equity_history"|"total_model_pnl"/i;

async function readAnonymous(path, accept) {
  const url = ORIGIN + path + (path.includes("?") ? "&" : "?") +
    "vx_access_qa=" + Date.now();
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    headers: { Accept: accept, "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(20000),
  });
  return { response, body: await response.text() };
}

function assertProtected(path, result) {
  const { response, body } = result;
  const status = response.status;
  const redirect = [301, 302, 303, 307, 308].includes(status);
  assert.ok(redirect || status === 401 || status === 403,
    path + " must require authentication, got HTTP " + status);
  if (redirect) {
    const location = response.headers.get("location");
    assert.ok(location, path + " redirect must include Location");
    const actual = new URL(location, ORIGIN);
    assert.equal(actual.origin, new URL(ORIGIN).origin,
      path + " must not redirect a login to another origin");
    assert.equal(actual.pathname, "/login",
      path + " must redirect to the actual dashboard login");
    assert.equal(actual.searchParams.get("next"), path,
      path + " must preserve the intended return destination");
  }
  assert.doesNotMatch(body, PRIVATE_FIELDS,
    path + " must not disclose portfolio/equity data anonymously");
  return { path, status, redirectedToLogin: redirect };
}

async function verifyAnonymousGate() {
  const [page, api] = await Promise.all([
    readAnonymous(PAGE, "text/html"),
    readAnonymous(API, "application/json"),
  ]);
  const result = [
    assertProtected(PAGE, page),
    assertProtected(API, api),
  ];
  console.log(JSON.stringify({
    result: "AUTH_GATE_VERIFIED_PARITY_NOT_CHECKED",
    origin: ORIGIN,
    anonymous: true,
    protectedRoutes: result,
    note: "Authenticated HTML/API parity cannot be verified without a viewer session",
  }));
}

verifyAnonymousGate().catch(error => {
  console.error("Swing production authentication gate verification failed:", error.message);
  process.exitCode = 1;
});
