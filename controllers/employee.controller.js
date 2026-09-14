const { getPool } = require('../config/db');
const employeeModel = require('../models/employee.model');
const { genId } = require('../utils/id');
const { hashPassword } = require('../utils/password');

function validate(body) {
  const { name, email, disc, dept, role, title } = body;
  if (!name || !email || !disc || !dept || !role || !title) {
    return 'name, email, disc, dept, role and title are required';
  }
  return null;
}

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, email, disc, dept, role, title, password } = req.body;
    const passwordHash = password ? await hashPassword(password) : null;
    const employee = await employeeModel.insert(pool, { id: genId('e'), name, email, disc, dept, role, title, passwordHash });
    res.status(201).json({ employee });
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
    if (!(await employeeModel.getById(pool, id))) return res.status(404).json({ error: 'Employee not found' });
    await employeeModel.setPassword(pool, id, await hashPassword(password));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await employeeModel.getById(pool, id))) return res.status(404).json({ error: 'Employee not found' });
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, email, disc, dept, role, title } = req.body;
    const employee = await employeeModel.update(pool, id, { name, email, disc, dept, role, title });
    res.json({ employee });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await employeeModel.getById(pool, id))) return res.status(404).json({ error: 'Employee not found' });
    await employeeModel.remove(pool, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const employees = await employeeModel.getAll(pool);
    res.json({ employees });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, remove, setPassword, list };
