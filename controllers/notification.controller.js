const { getPool } = require('../config/db');
const notificationModel = require('../models/notification.model');

async function markRead(req, res, next) {
  try {
    const pool = await getPool();
    await notificationModel.markAllReadFor(pool, req.user.id, req.user.role === 'Admin');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const notifications = await notificationModel.getAll(pool);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

module.exports = { markRead, list };
