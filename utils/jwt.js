const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
// Refresh tokens are signed with their own secret so an access token can never
// be replayed as a refresh token (and vice versa), even before the `typ` check.
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function signSession(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email, disc: user.disc || null, firm: user.firm || null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function verifySession(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.typ === 'refresh') throw new Error('Refresh token cannot be used as an access token');
  return payload;
}

// Carries only identity — the profile (name, role, disc...) is re-read from the
// DB on refresh so role changes and deactivations take effect.
function signRefresh(user) {
  return jwt.sign({ sub: user.id, role: user.role, typ: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

function verifyRefresh(token) {
  const payload = jwt.verify(token, JWT_REFRESH_SECRET);
  if (payload.typ !== 'refresh') throw new Error('Not a refresh token');
  return payload;
}

module.exports = { signSession, verifySession, signRefresh, verifyRefresh };
