const nodemailer = require('nodemailer');

// Reads the app-mode switch from .env ("App_MODE=Development" locally, "Production"
// once deployed) — matched case-insensitively by key since dotenv preserves whatever
// casing the .env file uses, and process.env lookups are case-sensitive on Linux
// (unlike Windows), so a literal process.env.APP_MODE would silently miss it there.
// Falls back to NODE_ENV so nothing breaks if the app-mode key isn't set at all.
const appModeKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'app_mode');
const APP_MODE = (appModeKey ? process.env[appModeKey] : process.env.NODE_ENV || 'development').toLowerCase();
const IS_PROD = APP_MODE === 'production';

// No real mailbox to send from yet — this only matters for the "From" header a human
// reads; MailDev accepts anything. Must be overridden with MAIL_FROM once a real
// sending mailbox is issued (see the "Mail" section in .env.example).
const MAIL_FROM = process.env.MAIL_FROM || 'Archcorp DCC <no-reply@archcorp-dcc.local>';

let transporter;

function buildTransport() {
  if (!IS_PROD) {
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

  // Production — generic SMTP relay. Works as-is with Microsoft 365 SMTP AUTH client
  // submission, or the SMTP interface every third-party provider offers (SendGrid,
  // Postmark, AWS SES, etc.) — just set SMTP_HOST/PORT/USER/PASSWORD once issued.
  // If Microsoft Graph's app-only /users/{mailbox}/sendMail is chosen instead (no
  // SMTP at all), replace this branch's transport with an HTTP call to Graph — the
  // sendMail() function below is the only thing that would need to change.
  if (!process.env.SMTP_HOST) {
    console.warn('[mailer] APP_MODE=production but SMTP_HOST is not set — sendMail() will throw until SMTP_* env vars are configured.');
  }
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

async function sendMail({ to, subject, text, html }) {
  if (!to) throw new Error('sendMail: "to" is required');
  if (IS_PROD && !process.env.SMTP_HOST) throw new Error('Email is not configured for production yet (SMTP_HOST missing)');
  const info = await getTransporter().sendMail({ from: MAIL_FROM, to, subject, text, html });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

module.exports = { sendMail, IS_PROD, MAIL_FROM };
