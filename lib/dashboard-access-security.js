"use strict";

const crypto = require("crypto");

const TURNSTILE_ACTION = "dashboard_access";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAccessEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 200);
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function isVerificationTokenFormat(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || "").trim());
}

function createBoundedRateLimiter({ limit, windowMs, maxKeys = 5000, now = () => Date.now() }) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("rate limiter limit must be >= 1");
  if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error("rate limiter windowMs must be >= 1");
  const buckets = new Map();

  function cleanup(atMs = now()) {
    const cutoff = atMs - windowMs;
    for (const [key, timestamps] of buckets) {
      const kept = timestamps.filter(timestamp => timestamp > cutoff);
      if (!kept.length) buckets.delete(key);
      else if (kept.length !== timestamps.length) buckets.set(key, kept);
    }
    while (buckets.size > maxKeys) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  function consume(rawKey) {
    const atMs = now();
    cleanup(atMs);
    const key = String(rawKey || "").trim() || "unknown";
    const timestamps = buckets.get(key) || [];
    if (timestamps.length >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((timestamps[0] + windowMs - atMs) / 1000)),
      };
    }
    timestamps.push(atMs);
    buckets.set(key, timestamps);
    cleanup(atMs);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { consume, cleanup, size: () => buckets.size, reset: () => buckets.clear() };
}

function turnstileResultAccepted(data, expectedAction = TURNSTILE_ACTION) {
  return Boolean(data && data.success === true && String(data.action || "") === expectedAction);
}

async function verifyTurnstileToken({ token, secretKey, remoteIp = "", fetchImpl = global.fetch }) {
  const cleanToken = String(token || "").trim();
  const cleanSecret = String(secretKey || "").trim();
  if (!cleanToken || !cleanSecret || typeof fetchImpl !== "function") return { ok: false, data: null };

  const form = new URLSearchParams();
  form.set("secret", cleanSecret);
  form.set("response", cleanToken);
  if (String(remoteIp || "").trim()) form.set("remoteip", String(remoteIp).trim());

  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await response.json();
    return { ok: Boolean(response.ok && turnstileResultAccepted(data)), data };
  } catch (_error) {
    return { ok: false, data: null };
  }
}

function verificationSentHtml({ email = "", name = "", lang = "en" } = {}) {
  const isRu = String(lang).toLowerCase() === "ru";
  const safeEmail = escapeHtml(email);
  const safeName = escapeHtml(name);
  const title = isRu ? "Подтвердите email" : "Confirm your email";
  const greeting = safeName ? (isRu ? `Спасибо, ${safeName}.` : `Thanks, ${safeName}.`) : "";
  const text = isRu
    ? `Мы отправили ссылку подтверждения на <strong>${safeEmail}</strong>. После подтверждения заявка попадёт на ручную проверку. Доступ не предоставляется автоматически.`
    : `We sent a confirmation link to <strong>${safeEmail}</strong>. After you confirm, your request will enter manual review. Access is never granted automatically.`;
  return pageHtml({ lang: isRu ? "ru" : "en", title, heading: title, paragraphs: [greeting, text].filter(Boolean), href: "/", button: isRu ? "На Vixale" : "Back to Vixale" });
}

function verifiedHtml({ lang = "en" } = {}) {
  const isRu = String(lang).toLowerCase() === "ru";
  const title = isRu ? "Email подтверждён." : "Email confirmed.";
  const text = isRu
    ? "Ваша заявка на доступ к dashboard отправлена на ручную проверку. Доступ не предоставляется автоматически. Если заявка будет одобрена, вы получите персональный viewer code по email."
    : "Your dashboard access request has been submitted for review. Access is not granted automatically. If approved, you will receive your personal viewer code by email.";
  return pageHtml({ lang: isRu ? "ru" : "en", title, heading: title, paragraphs: [text], href: "/dashboard", button: "Dashboard Login" });
}

function pageHtml({ lang, title, heading, paragraphs, href, button }) {
  return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vixale | ${escapeHtml(title)}</title><style>body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4faf6;color:#121815;margin:0}.card{max-width:620px;margin:9vh auto;padding:32px;background:#fff;border:1px solid #dfe9e3;border-radius:24px;box-shadow:0 18px 54px rgba(21,48,34,.08)}h1{font-size:30px;margin:0 0 12px}p{line-height:1.65;color:#58665f}.btn{display:inline-block;margin-top:10px;padding:11px 16px;border-radius:999px;background:#101613;color:#fff;text-decoration:none}</style></head><body><main class="card"><h1>${escapeHtml(heading)}</h1>${paragraphs.map(p => `<p>${p}</p>`).join("")}<a class="btn" href="${escapeHtml(href)}">${escapeHtml(button)}</a></main></body></html>`;
}

function verificationEmailHtml({ name = "", verificationUrl = "" } = {}) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f6f9f6;padding:30px;color:#101413"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e3e9e5;border-radius:22px;padding:28px"><h2 style="margin-top:0">Confirm your Vixale dashboard request</h2>${safeName ? `<p>Hi ${safeName},</p>` : ""}<p>Confirm your email to submit your dashboard access request for manual review.</p><p><a href="${safeUrl}" style="display:inline-block;background:#101613;color:#fff;text-decoration:none;border-radius:999px;padding:12px 18px">Confirm Email</a></p><p style="color:#64716a">This link expires in 60 minutes. Email confirmation does not grant dashboard access. Access requires manual owner approval.</p></div></div>`;
}

function verificationEmailText({ verificationUrl = "" } = {}) {
  return [
    "Confirm your Vixale dashboard request",
    "",
    "Confirm your email to submit your dashboard access request for manual review:",
    String(verificationUrl || ""),
    "",
    "This link expires in 60 minutes.",
    "Email confirmation does not grant dashboard access. Access requires manual owner approval.",
  ].join("\n");
}

module.exports = {
  TURNSTILE_ACTION,
  TURNSTILE_VERIFY_URL,
  escapeHtml,
  normalizeAccessEmail,
  hashToken,
  isVerificationTokenFormat,
  createBoundedRateLimiter,
  turnstileResultAccepted,
  verifyTurnstileToken,
  verificationSentHtml,
  verifiedHtml,
  verificationEmailHtml,
  verificationEmailText,
};
