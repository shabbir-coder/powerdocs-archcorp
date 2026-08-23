const { getPool } = require('../config/db');
const contractorModel = require('../models/contractor.model');
const { genId } = require('../utils/id');
const { hashPassword } = require('../utils/password');

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { name, email, firm, title, password } = req.body;
    if (!name || !email || !firm) return res.status(400).json({ error: 'name, email and firm are required' });
    const passwordHash = password ? await hashPassword(password) : null;
    const contractor = await contractorModel.insert(pool, { id: genId('c'), name, email, firm, title: title || 'Contractor', passwordHash });
    res.status(201).json({ contractor });
  } catch (err) {
    next(err);
  }
}

async function setPassword(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!(await contractorModel.getById(pool, id))) return res.status(404).json({ error: 'Contractor not found' });
    await contractorModel.setPassword(pool, id, await hashPassword(password));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await contractorModel.getById(pool, id))) return res.status(404).json({ error: 'Contractor not found' });
    const { name, email, firm, title } = req.body;
    if (!name || !email || !firm) return res.status(400).json({ error: 'name, email and firm are required' });
    const contractor = await contractorModel.update(pool, id, { name, email, firm, title: title || 'Contractor' });
    res.json({ contractor });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await contractorModel.getById(pool, id))) return res.status(404).json({ error: 'Contractor not found' });
    await contractorModel.remove(pool, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, remove, setPassword };
