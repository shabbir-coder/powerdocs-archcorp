const { getPool } = require('../config/db');
const firmModel = require('../models/firm.model');
const { genId } = require('../utils/id');

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
    const firm = await firmModel.insert(pool, { id: genId('f'), name, code });
    res.status(201).json({ firm });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await firmModel.getById(pool, id))) return res.status(404).json({ error: 'Firm not found' });
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
    const firm = await firmModel.update(pool, id, { name, code });
    res.json({ firm });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await firmModel.getById(pool, id))) return res.status(404).json({ error: 'Firm not found' });
    await firmModel.remove(pool, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const firms = await firmModel.getAll(pool);
    res.json({ firms });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, remove, list };
