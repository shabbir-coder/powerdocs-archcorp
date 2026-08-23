const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const TENANT_ID = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;

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
// audience must be this app's registration, issuer must be this exact tenant.
// Azure AD issues v2.0 tokens with iss "https://login.microsoftonline.com/{tenant}/v2.0"
// and (for some tenant configs) a GUID-form iss with /{tenantId}/v2.0 — both start with
// the same prefix, which is all we assert here.
function verifyMicrosoftToken(idToken) {
  if (!TENANT_ID || !CLIENT_ID) return Promise.reject(new Error('Microsoft sign-in is not configured (MS_TENANT_ID / MS_CLIENT_ID missing)'));
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getSigningKey,
      { algorithms: ['RS256'], audience: CLIENT_ID, issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0` },
      (err, decoded) => (err ? reject(err) : resolve(decoded)),
    );
  });
}

module.exports = { verifyMicrosoftToken };
