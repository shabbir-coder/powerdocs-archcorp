const { getPool } = require('../config/db');
const distributionModel = require('../models/distribution.model');
const { withPagination } = require('../utils/listQuery');

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { id: projectId } = req.params;
    const { disc, reviewer, action } = req.body;
    if (!disc || !reviewer || !action) return res.status(400).json({ error: 'disc, reviewer and action are required' });
    const row = await distributionModel.insert(pool, { project: projectId, disc, reviewer, action });
    res.status(201).json({ row });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const { items, pagination } = await distributionModel.list(pool, req.query);
    const distribution = {};
    for (const d of items) {
      (distribution[d.project] = distribution[d.project] || []).push({ disc: d.disc, reviewer: d.reviewer, action: d.action });
    }
    res.json(withPagination({ distribution }, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list };
