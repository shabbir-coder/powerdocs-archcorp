// FCM push via the Firebase Admin SDK. By default it uses the same Firebase
// project and service account as Storage (config/firebase.js initializes the
// default app), so the mobile app must be registered in that project.
//
// If the mobile app lives in a DIFFERENT Firebase project, set
// FIREBASE_MESSAGING_SERVICE_ACCOUNT_FILE in .env to that project's service
// account JSON (path relative to the API root) and push goes through it instead.
// A token sent to the wrong project fails with `messaging/mismatched-credential`.
const path = require('path');
require('../config/firebase');
const { initializeApp, cert, getApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getPool } = require('../config/db');
const deviceTokenModel = require('../models/deviceToken.model');

const MESSAGING_APP_NAME = 'push';

function messaging() {
  const file = process.env.FIREBASE_MESSAGING_SERVICE_ACCOUNT_FILE;
  if (!file) return getMessaging();
  let app;
  try {
    app = getApp(MESSAGING_APP_NAME);
  } catch {
    app = initializeApp({ credential: cert(require(path.join(__dirname, '..', file))) }, MESSAGING_APP_NAME);
  }
  return getMessaging(app);
}

// Only codes that mean "this token will never work again". Anything else
// (quota, transient, bad payload, wrong project) must not delete a user's device.
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

// Sends to raw tokens and returns one result per token. Dead tokens are
// pruned from DccDeviceTokens. dryRun validates against FCM without
// delivering anything to the device.
async function sendToTokens(tokens, { title, body, data }, { dryRun = false } = {}) {
  const results = [];
  if (!tokens.length) return results;

  for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
    const batch = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
    const response = await messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: stringifyData(data),
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    }, dryRun);
    response.responses.forEach((r, idx) => {
      results.push({
        token: batch[idx],
        success: r.success,
        messageId: r.messageId,
        error: r.success ? undefined : { code: r.error?.code, message: r.error?.message },
      });
    });
  }

  const dead = results.filter((r) => !r.success && DEAD_TOKEN_CODES.has(r.error?.code)).map((r) => r.token);
  if (dead.length) await deviceTokenModel.removeTokens(await getPool(), dead);
  return results;
}

async function sendToPersons(personIds, payload, options) {
  const uniqueIds = [...new Set(personIds)].filter(Boolean);
  if (!uniqueIds.length) return [];
  const pool = await getPool();
  const devices = await deviceTokenModel.getDevicesForPersons(pool, uniqueIds);
  const byToken = new Map(devices.map((d) => [d.token, d]));
  const results = await sendToTokens(devices.map((d) => d.token), payload, options);
  return results.map((r) => ({ ...r, personId: byToken.get(r.token)?.personId, platform: byToken.get(r.token)?.platform }));
}

module.exports = { sendToPersons, sendToTokens };
