const { getPool } = require('../config/db');
const workflowTemplateModel = require('../models/workflowTemplate.model');

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const workflowTemplates = await workflowTemplateModel.getAll(pool);
    res.json({ workflowTemplates });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
