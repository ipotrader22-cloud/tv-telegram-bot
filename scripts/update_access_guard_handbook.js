const fs = require('fs');

const path = 'docs/VECO_DEVELOPER_HANDBOOK.md';
let text = fs.readFileSync(path, 'utf8');

text = text.replace(/\*\*Last updated:\*\* \d{4}-\d{2}-\d{2}/, '**Last updated:** 2026-09-07');

if (!text.includes('TURNSTILE_SITE_KEY')) {
  const envAnchor = 'PASSWORD_REQUEST_BCC\nOPTION_PROOFS_DIR';
  if (!text.includes(envAnchor)) throw new Error('Dashboard env anchor missing');
  text = text.replace(
    envAnchor,
    'PASSWORD_REQUEST_BCC\nTURNSTILE_SITE_KEY\nTURNSTILE_SECRET_KEY\nOPTION_PROOFS_DIR'
  );
}

const sectionMarker = '### 10.1.1 Dashboard access request security';
if (!text.includes(sectionMarker)) {
  const anchor = '### 10.2 Operational admin surfaces';
  if (!text.includes(anchor)) throw new Error('Dashboard handbook anchor missing');
  const section = `### 10.1.1 Dashboard access request security

The public Dashboard Access request flow is separate from dashboard login and owner/admin authentication. Its public submission route remains \`POST /password-request\`.

Admission order is fixed:

\`\`\`text
honeypot body.website
-> per-IP rate limit (5 attempts / 15 minutes)
-> normalize and validate email
-> per-normalized-email rate limit (3 attempts / 60 minutes)
-> Cloudflare Turnstile server verification, action dashboard_access
-> write Awaiting Verification request
-> send Resend confirmation email
-> applicant confirms one-time email token
-> request becomes Pending
-> existing owner notification
-> existing manual Create 30-Day Code approval only
\`\`\`

Turnstile protects only the public access form. The browser receives only \`TURNSTILE_SITE_KEY\`; \`TURNSTILE_SECRET_KEY\` remains server-side and is sent only to Cloudflare Siteverify. Missing production Turnstile configuration fails closed for new public access requests. The existing \`body.website\` honeypot is retained. Rate limiting is bounded in-process state and is not global Express middleware.

The existing \`Dashboard Access Requests\` worksheet preserves A:I and appends J:L: \`Verification Token Hash\`, \`Verification Expires At\`, and \`Verified At\`. A new request is stored as \`Awaiting Verification\` for 60 minutes. Only a SHA-256 hash is persisted; the raw cryptographically random verification token is sent only in the email URL and is never stored or logged. Successful one-time verification clears the stored hash, writes \`Verified At\`, and changes status to \`Pending\`. Invalid, expired, or reused links cannot enter Pending or repeat owner notification. Confirmation-email delivery failure remains outside Pending as \`Verification Email Failed\`.

Email verification never creates a viewer code. Existing owner/viewer authentication and \`POST /dashboard-login\` remain unchanged. Only the existing authenticated owner Approve action may create the 30-day viewer code.

Pending Requests displays only status Pending. Approve and Reject retain their existing semantics. Owner-only permanent Delete uses the same \`adminAccessRequestAllowed()\` guard and Google Sheets \`deleteDimension\` pattern; it is refused when the request already has a Code ID or when an access-code row references the request. Deleting a request never revokes or modifies a viewer code.

Production activation requires a real Cloudflare Turnstile widget authorized for the Vixale hostnames plus \`TURNSTILE_SITE_KEY\` and \`TURNSTILE_SECRET_KEY\` in Render. Repository merge alone is not proof that Access Guard is active; Render deployment and live form/verification/manual-approval behavior must be independently verified.

`;
  text = text.replace(anchor, section + anchor);
}

const adrMarker = '### ADR-017 — Dashboard access requires bot defense, email verification, and manual approval';
if (!text.includes(adrMarker)) {
  const anchor = '## 18. Open Documentation Items';
  if (!text.includes(anchor)) throw new Error('ADR handbook anchor missing');
  const adr = `### ADR-017 — Dashboard access requires bot defense, email verification, and manual approval

**Decision:** A public dashboard access submission does not enter the owner Pending queue until it passes the existing honeypot, bounded IP/email rate limits, server-validated Cloudflare Turnstile, and one-time email verification. Email verification changes only request review state; it cannot create a viewer code. The existing authenticated owner Approve action remains the sole viewer-code creation path. Rejected requests remain for audit; unlinked spam requests may be physically deleted only by the same owner authorization guard, and code-linked requests cannot be deleted from the request table.

**Reason:** Public form submission and email delivery are insufficient evidence of a legitimate applicant. Separating anti-bot admission, email ownership proof, and manual access approval prevents automated submissions from filling Pending while preserving the established dashboard viewer-code trust boundary.

**Schema impact:** \`Dashboard Access Requests\` extends from A:I to A:L by appending verification token hash, expiration, and verified timestamp. Existing historical A:I rows remain parseable. No dashboard access-code schema, trading worksheet, webhook payload, bridge, Pine, order, risk, or broker lifecycle contract changes.

**Deployment impact:** Production requires a Cloudflare Turnstile widget and Render environment variables \`TURNSTILE_SITE_KEY\` and \`TURNSTILE_SECRET_KEY\`. The secret is never browser-exposed. If configuration is incomplete, new public requests fail closed. Activation must be verified from the live Render deployment and public form before being recorded as active.

---

`;
  text = text.replace(anchor, adr + anchor);
}

fs.writeFileSync(path, text);
