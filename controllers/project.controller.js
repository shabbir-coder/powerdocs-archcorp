const { getPool } = require('../config/db');
const projectModel = require('../models/project.model');
const { genId } = require('../utils/id');

function validate(body) {
  const { pid, name, client, city, status, start } = body;
  if (!pid || !name || !client || !city || !status || !start) {
    return 'pid, name, client, city, status and start are required';
  }
  return null;
}

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const { pid, name, client, city, status, start, workflow, disciplines, categories, numbering, numberingConfig, accId } = req.body;
    const project = await projectModel.insert(pool, {
      id: genId('p'), pid, name, client, city, status, start, workflow, disciplines, categories, numbering, numberingConfig, accId,
    });
    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await projectModel.getById(pool, id))) return res.status(404).json({ error: 'Project not found' });
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const { pid, name, client, city, status, start } = req.body;
    const project = await projectModel.update(pool, id, { pid, name, client, city, status, start });
    res.json({ project });
  } catch (err) {
    next(err);
  }
}

// Partial update — merges onto the current row so, e.g., the Numbering & Config
// screen (which only ever sends numberingConfig) doesn't null out workflow/
// disciplines/categories/numbering that Project Master already set.
async function updateEnrichment(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const current = await projectModel.getById(pool, id);
    if (!current) return res.status(404).json({ error: 'Project not found' });
    const { workflow, disciplines, categories, numbering, numberingConfig } = req.body;
    const merged = {
      workflow: workflow !== undefined ? workflow : current.workflow,
      disciplines: disciplines !== undefined ? disciplines : current.disciplines,
      categories: categories !== undefined ? categories : current.categories,
      numbering: numbering !== undefined ? numbering : current.numbering,
      numberingConfig: numberingConfig !== undefined ? numberingConfig : current.numberingConfig,
    };
    const project = await projectModel.updateEnrichment(pool, id, merged);
    res.json({ project });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    if (!(await projectModel.getById(pool, id))) return res.status(404).json({ error: 'Project not found' });
    await projectModel.remove(pool, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const projects = await projectModel.getAll(pool);
    res.json({ projects });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, updateEnrichment, remove, list };
