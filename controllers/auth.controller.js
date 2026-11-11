const crypto = require('crypto');
const { getPool } = require('../config/db');
const employeeModel = require('../models/employee.model');
const contractorModel = require('../models/contractor.model');
const { comparePassword } = require('../utils/password');
const { signSession, signRefresh, verifyRefresh } = require('../utils/jwt');
const { verifyMicrosoftToken } = require('../utils/msVerify');

const DEV_BYPASS = process.env.AUTH_DEV_BYPASS === 'true';

function toPublicUser(id, role, name, email, extra) {
  return { id, role, name, email, ...extra };
}

// Every successful sign-in (and refresh) returns a short-lived access token
// plus a longer-lived refresh token for POST /auth/refresh.
function issueSession(user) {
  return { token: signSession(user), refreshToken: signRefresh(user), user };
}

// Single sign-in point for everyone (Admin, Reviewer, Contractor) — the role
// comes back from whichever record actually matches the email, rather than
// the client declaring which portal it thinks it's signing into. Checks the
// employees table (Admin/Reviewer) first, then contractors.
// `portal: 'contractor'` (sent by the web login page) skips the employees table:
// on the web, Archcorp staff sign in through task.archcorp.ai + /auth/auth-link.
// Without it (e.g. the mobile app) behaviour is unchanged.
async function login(req, res, next) {
  try {
    const { email, password, portal } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const pool = await getPool();

    const employee = portal === 'contractor' ? null : await employeeModel.findByEmail(pool, email);
    if (employee && (await comparePassword(password, employee.passwordHash))) {
      const user = toPublicUser(employee.id, employee.role, employee.name, employee.email, { disc: employee.disc, title: employee.title });
      return res.json(issueSession(user));
    }

    const contractor = await contractorModel.findByEmail(pool, email);
    if (contractor && (await comparePassword(password, contractor.passwordHash))) {
      const user = toPublicUser(contractor.id, 'Contractor', contractor.name, contractor.email, { firm: contractor.firm, title: contractor.title });
      return res.json(issueSession(user));
    }

    res.status(401).json({ error: 'Invalid email or password' });
  } catch (err) {
    next(err);
  }
}

async function devOptions(req, res, next) {
  try {
    if (!DEV_BYPASS) return res.status(404).json({ error: 'Not found' });
    const pool = await getPool();
    const employees = await employeeModel.getAll(pool);
    res.json({ employees: employees.filter((e) => ['Admin', 'Reviewer'].includes(e.role)).map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role, title: e.title })) });
  } catch (err) {
    next(err);
  }
}

async function loginDev(req, res, next) {
  try {
    if (!DEV_BYPASS) return res.status(404).json({ error: 'Not found' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    const pool = await getPool();
    const employee = await employeeModel.getById(pool, employeeId);
    if (!employee || !['Admin', 'Reviewer'].includes(employee.role)) return res.status(404).json({ error: 'Employee not found' });
    const user = toPublicUser(employee.id, employee.role, employee.name, employee.email, { disc: employee.disc, title: employee.title });
    res.json(issueSession(user));
  } catch (err) {
    next(err);
  }
}

async function loginMicrosoft(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    let claims;
    try {
      claims = await verifyMicrosoftToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: `Microsoft sign-in failed: ${err.message}` });
    }

    const email = (claims.preferred_username || claims.email || claims.upn || '').toLowerCase();
    if (!email) return res.status(401).json({ error: 'Microsoft account has no email/UPN claim' });

    const pool = await getPool();
    const employee = await employeeModel.findByEmail(pool, email);
    if (!employee || !['Admin', 'Reviewer'].includes(employee.role)) {
      return res.status(403).json({ error: `No Archcorp DCC staff account found for ${email}` });
    }

    const user = toPublicUser(employee.id, employee.role, employee.name, employee.email, { disc: employee.disc, title: employee.title });
    res.json(issueSession(user));
  } catch (err) {
    next(err);
  }
}

// Exchanges a valid refresh token for a new access + refresh token pair. The
// user is re-read from the DB so role/profile changes apply and deactivated
// accounts are cut off; Admin/Reviewer come from employees, Contractor from contractors.
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

    let payload;
    try {
      payload = verifyRefresh(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const pool = await getPool();
    let user = null;
    if (payload.role === 'Contractor') {
      const contractor = await contractorModel.findActiveById(pool, payload.sub);
      if (contractor) user = toPublicUser(contractor.id, 'Contractor', contractor.name, contractor.email, { firm: contractor.firm, title: contractor.title });
    } else {
      const employee = await employeeModel.findActiveById(pool, payload.sub);
      if (employee) user = toPublicUser(employee.id, employee.role, employee.name, employee.email, { disc: employee.disc, title: employee.title });
    }
    if (!user) return res.status(401).json({ error: 'Account no longer active' });

    res.json(issueSession(user));
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ user: req.user });
}

// ---------------------------------------------------------------------------
// Staff SSO from task.archcorp.ai (Admin / Reviewer only).
//
// task.archcorp.ai signs the user in, then sends the browser to:
//   GET /api/auth/auth-link?email=<email>
// CURRENT MODE (default): email only. Any active Admin/Reviewer email logs in,
// with no other check. Anyone who knows a staff email can open this link.
//
// SIGNED MODE (set AUTH_LINK_REQUIRE_SIGNATURE=true + AUTH_LINK_SECRET in .env):
//   GET /api/auth/auth-link?email=<email>&ts=<unix seconds>&sig=<hex>
//   sig = HMAC-SHA256(AUTH_LINK_SECRET, lowercase(email) + "." + ts)
//   valid for AUTH_LINK_MAX_AGE_S, usable once.
//
// Either way, success redirects to the web app's /sso page with a one-time
// code, which the page swaps for a session via POST /auth/auth-link/exchange,
// so no access token ever appears in a URL, browser history or IIS log.
// ---------------------------------------------------------------------------
const AUTH_LINK_MAX_AGE_S = 120;
const AUTH_LINK_CLOCK_SKEW_S = 30;
const LOGIN_CODE_TTL_MS = 60 * 1000;
const STAFF_ROLES = ['Admin', 'Reviewer'];
const usedLinkSigs = new Map(); // sig -> expiresAt (ms)
const loginCodes = new Map(); // code -> { employeeId, expiresAt (ms) }

function pruneExpired(map) {
  const now = Date.now();
  for (const [key, value] of map) {
    const expiresAt = typeof value === 'number' ? value : value.expiresAt;
    if (expiresAt <= now) map.delete(key);
  }
}

function frontendUrl(pathAndQuery) {
  return `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}${pathAndQuery}`;
}

function signAuthLink(email, ts, secret) {
  return crypto.createHmac('sha256', secret).update(`${email.trim().toLowerCase()}.${ts}`).digest('hex');
}

async function authLink(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const fail = (message) => res.redirect(frontendUrl(`/login?sso_error=${encodeURIComponent(message)}`));
  try {
    const { email, ts, sig } = req.query;
    if (typeof email !== 'string' || !email.trim()) {
      return fail('This sign-in link is incomplete. Please sign in again from task.archcorp.ai.');
    }
    if (process.env.AUTH_LINK_REQUIRE_SIGNATURE === 'true') {
      const failure = checkSignedLink(email, ts, sig);
      if (failure) return fail(failure);
    }

    const pool = await getPool();
    const employee = await employeeModel.findByEmail(pool, email.trim());
    if (!employee || !STAFF_ROLES.includes(employee.role)) {
      return fail(`No active DCC Admin/Reviewer account found for ${email.trim()}.`);
    }

    pruneExpired(loginCodes);
    const code = crypto.randomBytes(32).toString('base64url');
    loginCodes.set(code, { employeeId: employee.id, expiresAt: Date.now() + LOGIN_CODE_TTL_MS });
    res.redirect(frontendUrl(`/sso?code=${code}`));
  } catch (err) {
    next(err);
  }
}

// Signed mode only. Returns an error message, or null when the link is valid.
function checkSignedLink(email, ts, sig) {
  const secret = process.env.AUTH_LINK_SECRET;
  if (!secret) return 'Staff sign-in is not configured on this server.';
  if (typeof ts !== 'string' || typeof sig !== 'string') {
    return 'This sign-in link is incomplete. Please sign in again from task.archcorp.ai.';
  }

  const tsNum = Number(ts);
  const age = Math.floor(Date.now() / 1000) - tsNum;
  if (!Number.isInteger(tsNum) || age > AUTH_LINK_MAX_AGE_S || age < -AUTH_LINK_CLOCK_SKEW_S) {
    return 'This sign-in link has expired. Please sign in again from task.archcorp.ai.';
  }

  const expected = Buffer.from(signAuthLink(email, ts, secret), 'hex');
  const given = /^[0-9a-f]{64}$/i.test(sig) ? Buffer.from(sig, 'hex') : null;
  if (!given || !crypto.timingSafeEqual(expected, given)) {
    return 'This sign-in link is invalid. Please sign in again from task.archcorp.ai.';
  }

  pruneExpired(usedLinkSigs);
  const sigKey = sig.toLowerCase();
  if (usedLinkSigs.has(sigKey)) {
    return 'This sign-in link has already been used. Please sign in again from task.archcorp.ai.';
  }
  usedLinkSigs.set(sigKey, (tsNum + AUTH_LINK_MAX_AGE_S + AUTH_LINK_CLOCK_SKEW_S) * 1000);
  return null;
}

async function exchangeAuthLinkCode(req, res, next) {
  try {
    const { code } = req.body || {};
    const entry = typeof code === 'string' ? loginCodes.get(code) : undefined;
    if (entry) loginCodes.delete(code); // one-time, even if it turns out expired
    if (!entry || entry.expiresAt <= Date.now()) {
      return res.status(401).json({ error: 'Sign-in code is invalid or has expired' });
    }

    const pool = await getPool();
    const employee = await employeeModel.findActiveById(pool, entry.employeeId);
    if (!employee || !STAFF_ROLES.includes(employee.role)) {
      return res.status(403).json({ error: 'Account is no longer an active Admin/Reviewer' });
    }
    const user = toPublicUser(employee.id, employee.role, employee.name, employee.email, { disc: employee.disc, title: employee.title });
    res.json(issueSession(user));
  } catch (err) {
    next(err);
  }
}

module.exports = { login, loginDev, devOptions, loginMicrosoft, refresh, me, authLink, exchangeAuthLinkCode };
