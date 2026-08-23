const { getPool } = require('../config/db');
const scheduleActivityModel = require('../models/scheduleActivity.model');
const { genId } = require('../utils/id');

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { id: projectId } = req.params;
    const { wbs, name, disc, start, finish, critical, float } = req.body;
    if (!name || !start || !finish) return res.status(400).json({ error: 'name, start and finish are required' });
    const activity = {
      id: genId('act'), project: projectId, wbs: wbs || 'General', name, disc: disc || '',
      start, finish, critical: !!critical, float: float ?? 0,
    };
    await scheduleActivityModel.insert(pool, activity);
    res.status(201).json({ activity });
  } catch (err) {
    next(err);
  }
}

module.exports = { create };
