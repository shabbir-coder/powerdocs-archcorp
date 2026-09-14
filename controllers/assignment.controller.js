const { getPool } = require('../config/db');
const assignmentModel = require('../models/assignment.model');

async function add(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { personId, type } = req.body;
    if (!personId || !['internal', 'contractor'].includes(type)) {
      return res.status(400).json({ error: "personId and type ('internal' or 'contractor') are required" });
    }
    await assignmentModel.add(pool, id, personId, type);
    res.status(201).json({ project: id, a: personId, t: type });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const { id, personId } = req.params;
    await assignmentModel.remove(pool, id, personId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const rows = await assignmentModel.getAll(pool);
    const assignments = {};
    for (const r of rows) {
      (assignments[r.project] = assignments[r.project] || []).push({ a: r.a, t: r.t });
    }
    res.json({ assignments });
  } catch (err) {
    next(err);
  }
}

module.exports = { add, remove, list };
