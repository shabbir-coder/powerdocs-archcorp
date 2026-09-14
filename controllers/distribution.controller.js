const { getPool } = require('../config/db');
const distributionModel = require('../models/distribution.model');

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
    const rows = await distributionModel.getAll(pool);
    const distribution = {};
    for (const d of rows) {
      (distribution[d.project] = distribution[d.project] || []).push({ disc: d.disc, reviewer: d.reviewer, action: d.action });
    }
    res.json({ distribution });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list };
