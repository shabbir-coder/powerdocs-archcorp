const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const TENANT_ID = process.env.MS_TENANT_ID;
// Comma-separated: every Entra app registration allowed to sign in here (e.g. the web SPA
// and the mobile app each have their own client ID, so their ID tokens carry different aud).
const CLIENT_IDS = (process.env.MS_CLIENT_ID || '').split(',').map((id) => id.trim()).filter(Boolean);

const client = TENANT_ID
  ? jwksClient({ jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys` })
  : null;

function getSigningKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Verifies a Microsoft Entra ID ID token: signature against the tenant's live JWKS,
// audience must be one of this app's registrations, issuer must be this exact tenant.
// Azure AD issues v2.0 tokens with iss "https://login.microsoftonline.com/{tenant}/v2.0"
// and (for some tenant configs) a GUID-form iss with /{tenantId}/v2.0 — both start with
// the same prefix, which is all we assert here.
function verifyMicrosoftToken(idToken) {
  if (!TENANT_ID || !CLIENT_IDS.length) return Promise.reject(new Error('Microsoft sign-in is not configured (MS_TENANT_ID / MS_CLIENT_ID missing)'));
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getSigningKey,
      { algorithms: ['RS256'], audience: CLIENT_IDS, issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0` },
      (err, decoded) => (err ? reject(new Error(explain(err, idToken))) : resolve(decoded)),
    );
  });
}

// jsonwebtoken's raw messages ("jwt audience invalid. expected: …") don't say what the
// token actually contained or how to get a valid one, so translate the common cases.
function explain(err, idToken) {
  const claims = jwt.decode(idToken) || {};
  const msg = err.message || '';
  if (err.name === 'TokenExpiredError') return 'the Microsoft ID token has expired — sign in again to get a fresh one';
  if (err.name === 'NotBeforeError') return 'the Microsoft ID token is not valid yet (check the server clock)';
  if (msg.startsWith('jwt audience invalid')) {
    return `the token was issued for a different app (aud "${claims.aud}"). Allowed client IDs: ${CLIENT_IDS.join(', ')}. Send the ID token (not the access token) from an Archcorp DCC app, or add this client ID to MS_CLIENT_ID if it is one of our own app registrations`;
  }
  if (msg.startsWith('jwt issuer invalid')) {
    return `the token was issued by a different tenant (iss "${claims.iss}"). Only accounts in tenant ${TENANT_ID} can sign in`;
  }
  if (err.name === 'SigningKeyNotFoundError' || msg === 'invalid signature') {
    return 'the token signature could not be verified against Microsoft\'s keys for this tenant — it may be from another tenant or have been altered';
  }
  if (msg === 'jwt malformed' || msg.startsWith('invalid token')) return 'idToken is not a valid JWT — paste the whole token without quotes or a "Bearer " prefix';
  return msg;
}

module.exports = { verifyMicrosoftToken };
