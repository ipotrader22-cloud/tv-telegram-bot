"use strict";

const OPTIONS_VIEWER_URL = "https://www.vixale.com/trading-systems/options/viewer";
const SWING_PORTFOLIO_URL = "https://www.vixale.com/trading-systems/swing-trading";

function normalizeAnchorText(anchorHtml) {
  return String(anchorHtml || "")
    .replace(/^<a\b[^>]*>/i, "")
    .replace(/<\/a>$/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&larr;|&#8592;|&#x2190;/gi, "←")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^←\s*/, "");
}

function anchorPresentationAttributes(anchorHtml) {
  const opening = String(anchorHtml || "").match(/^<a\b([^>]*)>/i);
  if (!opening) return "";
  const attrs = opening[1] || "";
  const kept = [];
  for (const name of ["class", "style"]) {
    const quoted = attrs.match(new RegExp(`\\s${name}\\s*=\\s*(["'])[^"']*\\1`, "i"));
    if (quoted) kept.push(quoted[0].trim());
  }
  return kept.length ? ` ${kept.join(" ")}` : "";
}

function renderQuickMenuLink(templateAnchor, href, text, marker) {
  const attrs = anchorPresentationAttributes(templateAnchor);
  return `<a${attrs} href="${href}" data-vx-quick-nav-item="${marker}">${text}</a>`;
}

function isFormattingGap(value) {
  return String(value || "").replace(/<!--[\s\S]*?-->/g, "").trim() === "";
}

function anchorHasHref(anchorHtml, href) {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bhref\\s*=\\s*(["'])${escaped}\\1`, "i").test(String(anchorHtml || ""));
}

function addQuickMenuSystemLinks(html) {
  if (typeof html !== "string") return html;
  const anchorPattern = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  const anchors = [];
  let match;
  while ((match = anchorPattern.exec(html))) {
    anchors.push({ html: match[0], start: match.index, end: anchorPattern.lastIndex });
  }
  if (anchors.length < 3) return html;

  const insertions = [];
  for (let index = 0; index <= anchors.length - 3; index += 1) {
    const back = anchors[index];
    const systems = anchors[index + 1];
    const risk = anchors[index + 2];
    if (
      normalizeAnchorText(back.html) !== "Back to Home" ||
      normalizeAnchorText(systems.html) !== "Trading Systems" ||
      normalizeAnchorText(risk.html) !== "Risk Management"
    ) continue;
    if (!isFormattingGap(html.slice(back.end, systems.start)) || !isFormattingGap(html.slice(systems.end, risk.start))) continue;

    const options = anchors[index + 3];
    const swing = anchors[index + 4];
    const hasOptions = options && isFormattingGap(html.slice(risk.end, options.start)) && normalizeAnchorText(options.html) === "Options" && anchorHasHref(options.html, OPTIONS_VIEWER_URL);
    const hasSwing = hasOptions && swing && isFormattingGap(html.slice(options.end, swing.start)) && normalizeAnchorText(swing.html) === "Swing Portfolio" && anchorHasHref(swing.html, SWING_PORTFOLIO_URL);
    if (hasOptions && hasSwing) continue;

    const separator = html.slice(systems.end, risk.start);
    const links = `${separator}${renderQuickMenuLink(risk.html, OPTIONS_VIEWER_URL, "Options", "options")}${separator}${renderQuickMenuLink(risk.html, SWING_PORTFOLIO_URL, "Swing Portfolio", "swing-portfolio")}`;
    insertions.push({ index: risk.end, text: links });
  }

  let result = html;
  for (let index = insertions.length - 1; index >= 0; index -= 1) {
    const insertion = insertions[index];
    result = result.slice(0, insertion.index) + insertion.text + result.slice(insertion.index);
  }
  return result;
}

module.exports = { OPTIONS_VIEWER_URL, SWING_PORTFOLIO_URL, normalizeAnchorText, anchorPresentationAttributes, addQuickMenuSystemLinks };
