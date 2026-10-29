const nodemailer = require('nodemailer');

// Reads the app-mode switch from .env ("App_MODE=Development" locally, "Production"
// once deployed) — matched case-insensitively by key since dotenv preserves whatever
// casing the .env file uses, and process.env lookups are case-sensitive on Linux
// (unlike Windows), so a literal process.env.APP_MODE would silently miss it there.
// Falls back to NODE_ENV so nothing breaks if the app-mode key isn't set at all.
const appModeKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'app_mode');
const APP_MODE = (appModeKey ? process.env[appModeKey] : process.env.NODE_ENV || 'development').toLowerCase();
const IS_PROD = APP_MODE === 'production';

// For Graph this must be a real mailbox in the Archcorp tenant (the address inside
// <...> is the one Graph sends as; the display name comes from the mailbox itself).
// MailDev accepts anything, so the placeholder is only fine for local dev.
const MAIL_FROM = process.env.MAIL_FROM || 'Archcorp DCC <no-reply@archcorp-dcc.local>';
const FROM_ADDRESS = (MAIL_FROM.match(/<([^>]+)>/)?.[1] || MAIL_FROM).trim();

// Microsoft Graph app-only credentials. The client ID is set explicitly rather than
// taken from MS_CLIENT_ID, since that's a list of sign-in apps and only the one with
// Mail.Send (Application) + admin consent can send. Tenant defaults to MS_TENANT_ID.
const GRAPH_TENANT_ID = process.env.MS_MAIL_TENANT_ID || process.env.MS_TENANT_ID;
const GRAPH_CLIENT_ID = process.env.MS_MAIL_CLIENT_ID;
const GRAPH_CLIENT_SECRET = process.env.MS_MAIL_CLIENT_SECRET;

// "maildev" | "smtp" | "graph". Dev defaults to MailDev so nobody real gets emailed
// while testing; production defaults to Graph once its secret is set, else SMTP.
// Set MAIL_TRANSPORT=graph locally to test real delivery end to end.
const TRANSPORT = (process.env.MAIL_TRANSPORT
  || (!IS_PROD ? 'maildev' : GRAPH_CLIENT_SECRET ? 'graph' : 'smtp')).toLowerCase();

// ---------- SMTP / MailDev (nodemailer) ----------

let transporter;

function buildTransport() {
  if (TRANSPORT === 'maildev') {
    // Local dev — MailDev's fake SMTP server (`npm run mail:dev`, in another terminal).
    // It accepts any sender/recipient with no auth and never delivers anywhere real;
    // every "sent" email lands in its web UI at http://localhost:1080 instead.
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || '127.0.0.1',
      port: Number(process.env.SMTP_PORT) || 1025,
      secure: false,
      ignoreTLS: true,
    });
  }

  // Generic SMTP relay (M365 SMTP AUTH, SendGrid, Postmark, SES, ...). Kept as a
  // fallback; Graph is the transport Archcorp actually uses.
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

function getTransporter() {
  if (!transporter) transporter = buildTransport();
  return transporter;
}

// ---------- Microsoft Graph (app-only /users/{mailbox}/sendMail) ----------

let cachedToken = null; // { token, expiresAt }
let pendingToken = null; // dedupes concurrent refreshes so a burst of emails makes one token call

async function fetchGraphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      grant_type: 'client_credentials',
      // Must be .default — asking for "Mail.Send" by name fails with invalid_scope.
      scope: 'https://graph.microsoft.com/.default',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Graph token request failed: ${data.error_description || data.error || res.status}`);
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function graphToken() {
  // Reuse until a minute before expiry — Entra rate-limits the token endpoint.
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  if (!pendingToken) pendingToken = fetchGraphToken().finally(() => { pendingToken = null; });
  return pendingToken;
}

function graphRecipients(list) {
  return list.map((address) => ({ emailAddress: { address } }));
}

async function sendViaGraph({ to, cc, subject, text, html }, retried = false) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(FROM_ADDRESS)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: html ? { contentType: 'HTML', content: html } : { contentType: 'Text', content: text || '' },
        toRecipients: graphRecipients(to),
        ccRecipients: graphRecipients(cc),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  // Throttled — honour Retry-After once (capped so a request never hangs on it).
  if (res.status === 429 && !retried) {
    const waitSec = Math.min(Number(res.headers.get('retry-after')) || 5, 30);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    return sendViaGraph({ to, cc, subject, text, html }, true);
  }
  // Token revoked/rotated before its cached expiry — drop it and try once more.
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return sendViaGraph({ to, cc, subject, text, html }, true);
  }
  // Success is 202 with an empty body — Graph returns no message id.
  if (res.status !== 202) {
    const detail = await res.text().catch(() => '');
    let message = detail;
    try { message = JSON.parse(detail).error?.message || detail; } catch { /* not JSON */ }
    throw new Error(`Graph sendMail ${res.status}: ${message}`);
  }
}

// ---------- public API ----------

function toList(v) {
  if (!v) return [];
  return (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim()).filter(Boolean);
}

function configError() {
  if (TRANSPORT === 'graph') {
    const missing = [
      !GRAPH_TENANT_ID && 'MS_TENANT_ID',
      !GRAPH_CLIENT_ID && 'MS_MAIL_CLIENT_ID',
      !GRAPH_CLIENT_SECRET && 'MS_MAIL_CLIENT_SECRET',
      !process.env.MAIL_FROM && 'MAIL_FROM',
    ].filter(Boolean);
    return missing.length ? `Graph email is not configured (missing ${missing.join(', ')})` : null;
  }
  if (TRANSPORT === 'smtp' && !process.env.SMTP_HOST) {
    return 'Email is not configured for production yet (set MS_MAIL_CLIENT_SECRET + MAIL_FROM for Graph, or SMTP_HOST)';
  }
  if (!['maildev', 'smtp', 'graph'].includes(TRANSPORT)) return `Unknown MAIL_TRANSPORT "${TRANSPORT}"`;
  return null;
}

if (configError()) console.warn(`[mailer] ${configError()} — sendMail() will throw until it is fixed.`);

async function sendMail({ to, cc, subject, text, html }) {
  const toAddrs = toList(to);
  const ccAddrs = toList(cc);
  if (!toAddrs.length) throw new Error('sendMail: "to" is required');
  const err = configError();
  if (err) throw new Error(err);

  if (TRANSPORT === 'graph') {
    await sendViaGraph({ to: toAddrs, cc: ccAddrs, subject, text, html });
    return { messageId: null, accepted: [...toAddrs, ...ccAddrs], rejected: [] };
  }
  const info = await getTransporter().sendMail({ from: MAIL_FROM, to: toAddrs, cc: ccAddrs, subject, text, html });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

module.exports = { sendMail, IS_PROD, MAIL_FROM, MAIL_TRANSPORT: TRANSPORT };
