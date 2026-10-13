const { getPool } = require('../config/db');
const emailLogModel = require('../models/emailLog.model');
const { withPagination } = require('../utils/listQuery');

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const { items, pagination } = await emailLogModel.list(pool, req.query);
    res.json(withPagination({ emails: items }, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
