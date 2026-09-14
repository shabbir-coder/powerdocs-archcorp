const { getPool } = require('../config/db');
const dueModel = require('../models/due.model');

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const dues = await dueModel.getAll(pool);
    res.json({ dues });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
