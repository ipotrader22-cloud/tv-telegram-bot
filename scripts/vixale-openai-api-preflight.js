'use strict';
// Tiny one-time OpenAI API connectivity test. Does not touch Sheets, website, or Resend.
const key = process.env.VIXALE_OPENAI_API_KEY;
if (!key) { console.error('OPENAI_PREFLIGHT BLOCKED: GitHub secret absent'); process.exit(1); }
async function main() {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: 'Reply with exactly the single word READY.',
      max_output_tokens: 24,
      store: false
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) {
    const reason = r.status === 401 ? 'INVALID_OR_UNAUTHORIZED_KEY'
      : r.status === 403 ? 'INSUFFICIENT_API_PERMISSION'
      : r.status === 429 ? 'BILLING_QUOTA_OR_RATE_LIMIT'
      : 'HTTP_' + r.status;
    console.error('OPENAI_PREFLIGHT BLOCKED: ' + reason);
    process.exitCode = 1;
    return;
  }
  const body = await r.json();
  const text = (body.output || [])
    .flatMap(x => x.content || [])
    .filter(x => x.type === 'output_text')
    .map(x => x.text)
    .join('').trim();
  if (body.status !== 'completed' || text !== 'READY') {
    console.error('OPENAI_PREFLIGHT BLOCKED: INCOMPLETE_OR_UNEXPECTED_RESPONSE');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ gate: 'OPENAI_API_CONNECTION', result: 'PASS',
    model: 'gpt-4.1-mini', noSheetWrites: true, noEmails: true, noWebsiteChanges: true }));
}
main().catch(e => {
  console.error('OPENAI_PREFLIGHT BLOCKED: ' +
    (e.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_OR_RESPONSE_ERROR'));
  process.exitCode = 1;
});
