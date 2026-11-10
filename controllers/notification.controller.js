const { getPool } = require('../config/db');
const notificationModel = require('../models/notification.model');
const deviceTokenModel = require('../models/deviceToken.model');
const pushService = require('../services/push.service');
const { emitToPersons } = require('../realtime/notification.socket');
const { withPagination } = require('../utils/listQuery');

const PLATFORMS = ['android', 'ios', 'web'];

function isAdmin(req) {
  return req.user.role === 'Admin';
}

async function markRead(req, res, next) {
  try {
    const pool = await getPool();
    await notificationModel.markAllReadFor(pool, req.user.id, isAdmin(req));
    // Syncs the caller's other open tabs/devices.
    emitToPersons([req.user.id], 'notification:read', { all: true });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function markOneRead(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const existing = await notificationModel.getByIdForPerson(pool, id, req.user.id, isAdmin(req));
    if (!existing) return res.status(404).json({ error: 'Notification not found' });
    if (!existing.read) {
      await notificationModel.markReadFor(pool, id, req.user.id);
      emitToPersons([req.user.id], 'notification:read', { id });
    }
    res.json({ notification: { ...existing, read: true } });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const { items, pagination } = await notificationModel.listForPerson(pool, req.user.id, isAdmin(req), req.query);
    res.json(withPagination({ notifications: items }, pagination));
  } catch (err) {
    next(err);
  }
}

async function registerDeviceToken(req, res, next) {
  try {
    const { token, platform } = req.body || {};
    if (typeof token !== 'string' || !token.trim() || token.length > 512) {
      return res.status(400).json({ error: 'token (1-512 characters) is required' });
    }
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: `platform must be one of: ${PLATFORMS.join(', ')}` });
    }
    const pool = await getPool();
    await deviceTokenModel.upsert(pool, { token: token.trim(), personId: req.user.id, platform });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Called on logout so the device stops receiving this person's pushes.
// Idempotent: unknown tokens (or tokens owned by someone else) still return 204.
async function removeDeviceToken(req, res, next) {
  try {
    const token = req.body?.token || req.query.token;
    if (typeof token !== 'string' || !token.trim()) return res.status(400).json({ error: 'token is required' });
    const pool = await getPool();
    await deviceTokenModel.removeForPerson(pool, token.trim(), req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Test endpoint: sends a push without creating a stored notification.
// Default target is the caller's own registered devices; targeting another
// person or a raw token is Admin only. Returns per-device FCM results so a
// failing setup (wrong Firebase project, expired token) is visible directly.
async function testPush(req, res, next) {
  try {
    const { personId, token, title, body, data, dryRun } = req.body || {};
    if ((personId && personId !== req.user.id) || token) {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Only Admin can send a test push to another person or a raw token' });
    }
    if (token !== undefined && (typeof token !== 'string' || !token.trim())) {
      return res.status(400).json({ error: 'token must be a non-empty string' });
    }
    if (data !== undefined && (typeof data !== 'object' || Array.isArray(data) || data === null)) {
      return res.status(400).json({ error: 'data must be an object of key/value pairs' });
    }

    const payload = {
      title: typeof title === 'string' && title.trim() ? title.trim() : 'DCC test notification',
      body: typeof body === 'string' && body.trim() ? body.trim() : `Test push sent at ${new Date().toISOString()}`,
      data: { type: 'test', ...data },
    };
    const options = { dryRun: dryRun === true };

    const target = token ? { token: token.trim() } : { personId: personId || req.user.id };
    const results = token
      ? await pushService.sendToTokens([token.trim()], payload, options)
      : await pushService.sendToPersons([target.personId], payload, options);

    const successCount = results.filter((r) => r.success).length;
    res.json({
      dryRun: options.dryRun,
      target,
      devices: results.length,
      successCount,
      failureCount: results.length - successCount,
      // Token shortened in the response; the full value stays server-side.
      results: results.map((r) => ({ ...r, token: `${r.token.slice(0, 12)}…${r.token.slice(-6)}` })),
      ...(results.length === 0 && { hint: 'No devices registered for this person. Log in on the mobile app (it calls POST /notifications/fcm-token) and try again.' }),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { markRead, markOneRead, list, registerDeviceToken, removeDeviceToken, testPush };
