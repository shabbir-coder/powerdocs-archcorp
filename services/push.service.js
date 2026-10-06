// FCM push via the Firebase Admin SDK. Uses the same Firebase project and
// service account as Storage (config/firebase.js initializes the default app),
// so no extra server key is needed - the mobile app just has to be registered
// in that same Firebase project.
require('../config/firebase');
const { getMessaging } = require('firebase-admin/messaging');
const { getPool } = require('../config/db');
const deviceTokenModel = require('../models/deviceToken.model');

// Only codes that mean "this token will never work again". Anything else
// (quota, transient, bad payload) must not delete a user's device.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const FCM_MULTICAST_LIMIT = 500;

// FCM data values must all be strings.
function stringifyData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  return out;
}

async function sendToPersons(personIds, { title, body, data }) {
  const uniqueIds = [...new Set(personIds)].filter(Boolean);
  if (!uniqueIds.length) return;
  const pool = await getPool();
  const tokens = await deviceTokenModel.getTokensForPersons(pool, uniqueIds);
  if (!tokens.length) return;

  const deadTokens = [];
  for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
    const batch = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
    const response = await getMessaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: stringifyData(data),
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    response.responses.forEach((r, idx) => {
      if (!r.success && DEAD_TOKEN_CODES.has(r.error?.code)) deadTokens.push(batch[idx]);
    });
  }
  await deviceTokenModel.removeTokens(pool, deadTokens);
}

module.exports = { sendToPersons };
