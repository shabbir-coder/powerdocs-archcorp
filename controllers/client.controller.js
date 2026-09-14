const { getPool } = require('../config/db');
const clientModel = require('../models/client.model');
const { genId } = require('../utils/id');

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { name, code, city } = req.body;
    if (!name || !code || !city) return res.status(400).json({ error: 'name, code and city are required' });
    const client = await clientModel.insert(pool, { id: genId('cl'), name, code, city });
    res.status(201).json({ client });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await clientModel.getById(pool, id))) return res.status(404).json({ error: 'Client not found' });
    const { name, code, city } = req.body;
    if (!name || !code || !city) return res.status(400).json({ error: 'name, code and city are required' });
    const client = await clientModel.update(pool, id, { name, code, city });
    res.json({ client });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await clientModel.getById(pool, id))) return res.status(404).json({ error: 'Client not found' });
    await clientModel.remove(pool, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const clients = await clientModel.getAll(pool);
    res.json({ clients });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, remove, list };
