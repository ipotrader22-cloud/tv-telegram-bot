"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_METRICS_FILE = "/var/data/vixale_website_funnel_metrics.json";
const EVENT_NAMES = Object.freeze([
  "access_cta_click",
  "access_form_submitted",
  "verification_email_sent",
  "email_verified",
  "owner_approved",
  "first_viewer_login",
  "service_enquiry",
]);
const SERVICE_KINDS = Object.freeze(["appointment", "bot", "strategy"]);
const eventSet = new Set(EVENT_NAMES);
const serviceKindSet = new Set(SERVICE_KINDS);
let writeChain = Promise.resolve();

function emptyState() {
  const counts = {};
  for (const event of EVENT_NAMES) counts[event] = 0;
  const service_enquiry_by_kind = {};
  for (const kind of SERVICE_KINDS) service_enquiry_by_kind[kind] = 0;
  return {
    version: 1,
    started_at: "",
    updated_at: "",
    counts,
    service_enquiry_by_kind,
  };
}

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function sanitizeState(value) {
  const state = emptyState();
  if (!value || typeof value !== "object") return state;
  state.started_at = typeof value.started_at === "string" ? value.started_at : "";
  state.updated_at = typeof value.updated_at === "string" ? value.updated_at : "";
  for (const event of EVENT_NAMES) state.counts[event] = finiteCount(value.counts && value.counts[event]);
  for (const kind of SERVICE_KINDS) {
    state.service_enquiry_by_kind[kind] = finiteCount(value.service_enquiry_by_kind && value.service_enquiry_by_kind[kind]);
  }
  return state;
}

async function readState(filePath = DEFAULT_METRICS_FILE) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function writeState(state, filePath = DEFAULT_METRICS_FILE) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", "utf8");
  await fs.promises.rename(tempPath, filePath);
}

async function recordNow(event, metadata = {}, filePath = DEFAULT_METRICS_FILE) {
  if (!eventSet.has(event)) return false;
  const state = await readState(filePath);
  const now = new Date().toISOString();
  if (!state.started_at) state.started_at = now;
  state.updated_at = now;
  state.counts[event] += 1;
  if (event === "service_enquiry") {
    const kind = String(metadata && metadata.kind || "").trim().toLowerCase();
    if (serviceKindSet.has(kind)) state.service_enquiry_by_kind[kind] += 1;
  }
  await writeState(state, filePath);
  return true;
}

function record(event, metadata = {}, options = {}) {
  const filePath = options.filePath || DEFAULT_METRICS_FILE;
  const task = () => recordNow(event, metadata, filePath);
  const pending = writeChain.then(task, task);
  writeChain = pending.catch(() => {});
  return pending;
}

async function snapshot(options = {}) {
  const filePath = options.filePath || DEFAULT_METRICS_FILE;
  return readState(filePath);
}

module.exports = {
  DEFAULT_METRICS_FILE,
  EVENT_NAMES,
  SERVICE_KINDS,
  emptyState,
  sanitizeState,
  record,
  snapshot,
};
