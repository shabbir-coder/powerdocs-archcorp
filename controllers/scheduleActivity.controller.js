const { getPool } = require('../config/db');
const scheduleActivityModel = require('../models/scheduleActivity.model');
const { genId } = require('../utils/id');
const { withPagination } = require('../utils/listQuery');

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

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const { items, pagination } = await scheduleActivityModel.list(pool, req.query);
    const schedules = {};
    for (const a of items) {
      (schedules[a.project] = schedules[a.project] || []).push(a);
    }
    res.json(withPagination({ schedules }, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list };
