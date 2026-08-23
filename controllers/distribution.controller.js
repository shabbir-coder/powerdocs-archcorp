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

module.exports = { create };
