from pathlib import Path
import re


APP = Path(__file__).resolve().parents[1] / "app.js"
text = APP.read_text(encoding="utf-8")
original = text

identity_anchor = "  const upper = joined.toUpperCase();\n\n  // Prefer explicit public-system identity over shared strategy-family names."
identity_replacement = """  const upper = joined.toUpperCase();

  // SMI must never fall through the legacy stop=0 => Vixale Prime classifier.
  if (
    upper.includes('VIXALE_SMI_FWD') ||
    upper.includes('SMI_HISTOGRAM_V0_4_FWD')
  ) {
    return 'SMI Ergodic';
  }

  // Prefer explicit public-system identity over shared strategy-family names."""

if "return 'SMI Ergodic';" not in text:
    if identity_anchor not in text:
        raise SystemExit("SMI identity anchor not found; refusing to patch app.js")
    text = text.replace(identity_anchor, identity_replacement, 1)

function_pattern = re.compile(
    r"async function markStandardBridgeClosePublicationComplete\(sheets, row\) \{.*?\n\}\n\nasync function cleanupLegacyPositionIfExists",
    re.S,
)
function_replacement = """async function markStandardBridgeClosePublicationComplete(sheets, row) {
  // Sheets writes are acknowledged before every replica/read path necessarily
  // observes the just-written compact Closed Trades row.  A bridge callback
  // must not be retried (and republished) merely because that immediate read is
  // briefly stale.  closed_trade_written=true is only persisted after the
  // Closed Trades append succeeds, so it is valid durable evidence.
  let state = null;
  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    state = await getStandardBridgeClosePublicationState(sheets, row);
    const closedWritten = Boolean(
      state?.metadata?.metadata?.closed_trade_written
    );
    if (state?.metadata && (state.closed || closedWritten)) break;
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  const closedWritten = Boolean(
    state?.metadata?.metadata?.closed_trade_written
  );
  if (!state?.metadata || (!state.closed && !closedWritten)) {
    throw new Error(
      `Cannot complete durable bridge close publication: ${state?.delivery_id || row?.trade_id || ''}`
    );
  }

  const publishedAt = nowNy();
  await updateTradeMetadataRow(sheets, state.metadata.row_number, {
    ...state.metadata.metadata,
    closed_trade_written: true,
    telegram_edge_exit_published: true,
    edge_exit_publication_complete: true,
    publication_completed_at: publishedAt,
  });
  return {
    delivery_id: state.delivery_id,
    telegram_published: true,
    publication_complete: true,
  };
}

async function cleanupLegacyPositionIfExists"""

if "const maxAttempts = 20;" not in text:
    match = function_pattern.search(text)
    if not match:
        raise SystemExit("Durable close completion anchor not found; refusing to patch app.js")
    text = function_pattern.sub(function_replacement, text, count=1)

if text == original:
    print("app.js already contains SMI Render hardening")
else:
    APP.write_text(text, encoding="utf-8")
    print("app.js patched: SMI identity + durable close completion")
