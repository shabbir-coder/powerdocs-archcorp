const { getPool } = require('../config/db');
const workflowTemplateModel = require('../models/workflowTemplate.model');
const { withPagination } = require('../utils/listQuery');

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const { items, pagination } = await workflowTemplateModel.list(pool, req.query);
    res.json(withPagination({ workflowTemplates: items }, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
