const { getPool } = require('../config/db');
const snagModel = require('../models/snag.model');
const projectModel = require('../models/project.model');
const { genId } = require('../utils/id');

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { project, discipline, location, desc, priority, assignedTo } = req.body;
    const raisedBy = req.user.id;
    if (!project || !discipline || !desc || !priority || !assignedTo) {
      return res.status(400).json({ error: 'project, discipline, desc, priority and assignedTo are required' });
    }
    const projects = await projectModel.getAll(pool);
    const proj = projects.find((p) => p.id === project);
    if (!proj) return res.status(400).json({ error: `Unknown project ${project}` });

    const cnt = (await snagModel.countForProject(pool, project)) + 1;
    const snag = await snagModel.insert(pool, {
      id: genId('s'), ref: `SNG-${proj.pid}-${String(cnt).padStart(3, '0')}`, project, discipline,
      location: location || '—', desc, raisedBy, assignedTo, priority, status: 'Open',
      created: new Date().toISOString(), closed: null, photo: true,
    });
    res.status(201).json({ snag });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    if (!(await snagModel.getById(pool, id))) return res.status(404).json({ error: 'Snag not found' });
    const closed = status === 'Closed' ? new Date().toISOString() : null;
    const snag = await snagModel.updateStatus(pool, id, status, closed);
    res.json({ snag });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const snags = await snagModel.getAll(pool);
    res.json({ snags });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, updateStatus, list };