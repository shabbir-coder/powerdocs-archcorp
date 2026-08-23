const { getPool } = require('../config/db');
const clientModel = require('../models/client.model');
const projectModel = require('../models/project.model');
const employeeModel = require('../models/employee.model');
const firmModel = require('../models/firm.model');
const contractorModel = require('../models/contractor.model');
const assignmentModel = require('../models/assignment.model');
const documentModel = require('../models/document.model');
const historyModel = require('../models/history.model');
const snagModel = require('../models/snag.model');
const dueModel = require('../models/due.model');
const scheduleActivityModel = require('../models/scheduleActivity.model');
const transmittalModel = require('../models/transmittal.model');
const workflowTemplateModel = require('../models/workflowTemplate.model');
const markupModel = require('../models/markup.model');
const chatModel = require('../models/chat.model');
const notificationModel = require('../models/notification.model');
const distributionModel = require('../models/distribution.model');
const emailLogModel = require('../models/emailLog.model');

async function getBootstrap(req, res, next) {
  try {
    const pool = await getPool();
    const [
      clients, projects, employees, firms, contractors, assignmentRows, documents, history, snags, dues, scheduleRows,
      transmittals, workflowTemplates, markupRows, chatRows, notifications, distributionRows, emails,
    ] = await Promise.all([
      clientModel.getAll(pool),
      projectModel.getAll(pool),
      employeeModel.getAll(pool),
      firmModel.getAll(pool),
      contractorModel.getAll(pool),
      assignmentModel.getAll(pool),
      documentModel.getAllFull(pool),
      historyModel.getAll(pool),
      snagModel.getAll(pool),
      dueModel.getAll(pool),
      scheduleActivityModel.getAll(pool),
      transmittalModel.getAll(pool),
      workflowTemplateModel.getAll(pool),
      markupModel.getAll(pool),
      chatModel.getAll(pool),
      notificationModel.getAll(pool),
      distributionModel.getAll(pool),
      emailLogModel.getAll(pool),
    ]);

    const assignments = {};
    for (const a of assignmentRows) {
      (assignments[a.project] = assignments[a.project] || []).push({ a: a.a, t: a.t });
    }

    const schedules = {};
    for (const a of scheduleRows) {
      (schedules[a.project] = schedules[a.project] || []).push(a);
    }

    const markups = {};
    for (const m of markupRows) {
      markups[m.documentId] = m.marks;
    }

    const chats = {};
    for (const c of chatRows) {
      (chats[c.project] = chats[c.project] || []).push(c);
    }

    const distribution = {};
    for (const d of distributionRows) {
      (distribution[d.project] = distribution[d.project] || []).push({ disc: d.disc, reviewer: d.reviewer, action: d.action });
    }

    res.json({
      clients, projects, employees, firms, contractors, assignments, documents, history, snags, dues, schedules,
      transmittals, workflowTemplates, markups, chats, notifications, distribution, emails,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getBootstrap };
