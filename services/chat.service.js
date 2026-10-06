const { getPool } = require('../config/db');
const assignmentModel = require('../models/assignment.model');
const chatModel = require('../models/chat.model');
const { genId } = require('../utils/id');

async function canAccessProject(user, projectId) {
  const pool = await getPool();
  return assignmentModel.canAccessProject(pool, projectId, user.id, user.role);
}

async function getHistory(user, projectId, since) {
  const pool = await getPool();
  if (!(await assignmentModel.canAccessProject(pool, projectId, user.id, user.role))) {
    const error = new Error('Project not found or access denied');
    error.status = 404;
    throw error;
  }
  return chatModel.getForProjectSince(pool, projectId, since);
}

async function getAccessibleHistory(user) {
  const pool = await getPool();
  const projectIds = await assignmentModel.getAccessibleProjectIds(pool, user.id, user.role);
  return chatModel.getForProjects(pool, projectIds);
}

async function createMessage(user, projectId, text, kind = 'msg') {
  const pool = await getPool();
  if (!(await assignmentModel.canAccessProject(pool, projectId, user.id, user.role))) {
    const error = new Error('Project not found or access denied');
    error.status = 404;
    throw error;
  }
  return chatModel.insert(pool, {
    id: genId('m'),
    project: projectId,
    by: kind === 'ai' ? 'ai' : user.id,
    text: text.trim(),
    kind,
    at: new Date().toISOString(),
  });
}

module.exports = { canAccessProject, getHistory, getAccessibleHistory, createMessage };