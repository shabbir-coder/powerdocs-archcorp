const { getPool } = require('../config/db');
const emailLogModel = require('../models/emailLog.model');

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const emails = await emailLogModel.getAll(pool);
    res.json({ emails });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
