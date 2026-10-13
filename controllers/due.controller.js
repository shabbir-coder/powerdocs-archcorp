const { getPool } = require('../config/db');
const dueModel = require('../models/due.model');
const { withPagination } = require('../utils/listQuery');

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const { items, pagination } = await dueModel.list(pool, req.query);
    res.json(withPagination({ dues: items }, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
