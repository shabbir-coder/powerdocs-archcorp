const { getPool } = require('../config/db');
const notificationModel = require('../models/notification.model');
const deviceTokenModel = require('../models/deviceToken.model');
const { emitToPersons } = require('../realtime/notification.socket');

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
    const notifications = await notificationModel.getForPerson(pool, req.user.id, isAdmin(req));
    res.json({ notifications });
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

module.exports = { markRead, markOneRead, list, registerDeviceToken, removeDeviceToken };
