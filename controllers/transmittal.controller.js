const { getPool } = require('../config/db');
const projectModel = require('../models/project.model');
const documentModel = require('../models/document.model');
const historyModel = require('../models/history.model');
const transmittalModel = require('../models/transmittal.model');
const emailLogModel = require('../models/emailLog.model');
const { genId } = require('../utils/id');
const { getPerson } = require('../utils/person');
const { sendMail } = require('../config/mailer');

async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { id: projectId } = req.params;
    const { purpose, to, docs, remarks, mailType } = req.body;
    if (!purpose || !Array.isArray(to) || !to.length || !Array.isArray(docs) || !docs.length) {
      return res.status(400).json({ error: 'purpose, to and docs are required' });
    }
    const project = await projectModel.getById(pool, projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Server owns number generation so it can never collide/duplicate across clients.
    const cnt = (await transmittalModel.countForProject(pool, projectId)) + 1;
    const now = new Date().toISOString();
    const transmittal = await transmittalModel.insert(pool, {
      id: genId('t'), number: `${project.pid}-TR-${String(cnt).padStart(3, '0')}`, project: projectId,
      mailType: mailType || 'Transmittal', purpose, from: req.user.id, to, docs, createdAt: now, status: 'Issued', remarks: remarks || '',
    });

    const historyEntries = [];
    const docSummaries = [];
    for (const docId of docs) {
      const doc = await documentModel.getByIdFull(pool, docId);
      if (!doc) continue;
      const entry = await historyModel.insert(pool, {
        id: genId('h'), doc: docId, project: doc.project, at: now, action: 'Transmitted',
        actor: req.user.id, role: req.user.role === 'Admin' ? 'Reviewer' : req.user.role, round: doc.round,
        comment: `${transmittal.number} — ${purpose}`,
      });
      historyEntries.push(entry);
      docSummaries.push(`${doc.ref} — ${doc.title}`);
    }

    const subject = `[${transmittal.number}] ${purpose}`;
    const bodyFor = (recipientName) =>
      `Dear ${recipientName || ''},\n\n${req.user.name} has issued transmittal ${transmittal.number} (${purpose}) on ${project.pid} — ${project.name}.\n\n` +
      `Documents (${docSummaries.length}):\n${docSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` +
      (remarks ? `Remarks:\n${remarks}\n\n` : '') +
      `Please access the full document set in the Archcorp DCC portal.\n\nRegards,\n${req.user.name}\nArchcorp`;

    const emails = [];
    for (const personId of to) {
      const person = await getPerson(pool, personId);
      if (!person?.email) continue;
      const body = bodyFor(person.name);
      let delivered = false;
      try {
        await sendMail({ to: person.email, subject, text: body });
        delivered = true;
      } catch (err) {
        console.error(`[mailer] transmittal email to ${person.email} failed:`, err.message);
      }
      const email = await emailLogModel.insert(pool, {
        id: genId('em'), to: person.email, firm: person.firm || '', subject, body, doc: null, at: now, type: 'transmittal',
      });
      emails.push({ ...email, delivered });
    }

    res.status(201).json({ transmittal, historyEntries, emails });
  } catch (err) {
    next(err);
  }
}

module.exports = { create };
