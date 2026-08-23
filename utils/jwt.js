const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

function signSession(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email, disc: user.disc || null, firm: user.firm || null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function verifySession(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signSession, verifySession };
