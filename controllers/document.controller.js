const path = require('path');
const crypto = require('crypto');
const { getPool } = require('../config/db');
const documentModel = require('../models/document.model');
const threadModel = require('../models/thread.model');
const historyModel = require('../models/history.model');
const projectModel = require('../models/project.model');
const lookupModel = require('../models/lookup.model');
const memberReviewModel = require('../models/memberReview.model');
const markupModel = require('../models/markup.model');
const notificationModel = require('../models/notification.model');
const chatModel = require('../models/chat.model');
const emailLogModel = require('../models/emailLog.model');
const assignmentModel = require('../models/assignment.model');
const firmModel = require('../models/firm.model');
const { genId } = require('../utils/id');
const { buildPlaceholderPdf } = require('../db/pdfPlaceholder');
const { uploadBuffer } = require('../config/firebase');
const { getPerson } = require('../utils/person');
const { sendMail } = require('../config/mailer');
const { FORM_CODE, ADISC, stageOf, stageCodeFor, buildDocNo } = require('../utils/docNumbering');

function normalizeRole(role) {
  return role === 'Admin' ? 'Reviewer' : role;
}

function sizeLabel(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Uploads straight to Firebase Storage — no local disk I/O — and returns the
// download URL + size label ready to hand to documentModel.insertFile().
async function storePlaceholder(docId, kind, version, title) {
  const buffer = buildPlaceholderPdf(title);
  const destination = `documents/${docId}/${kind}_v${version}_${crypto.randomUUID()}.pdf`;
  const url = await uploadBuffer(buffer, destination, 'application/pdf');
  return { url, size: sizeLabel(buffer.length) };
}

async function storeUploadedFile(docId, kind, version, file) {
  const ext = path.extname(file.originalname) || '.pdf';
  const destination = `documents/${docId}/${kind}_v${version}_${crypto.randomUUID()}${ext}`;
  const url = await uploadBuffer(file.buffer, destination, file.mimetype || 'application/pdf');
  return { url, size: sizeLabel(file.size) };
}

async function createDocument(req, res, next) {
  try {
    const pool = await getPool();
    const body = req.body;
    const submittedBy = req.user.id;
    const projects = await projectModel.getAll(pool);
    const project = projects.find((p) => p.id === body.project);
    if (!project) return res.status(400).json({ error: `Unknown project ${body.project}` });

    const docType = await lookupModel.getDocTypeByName(pool, body.type);
    const cnt = (await documentModel.countForProject(pool, body.project)) + 1;
    const ref = `${project.pid}-${docType?.refCode || 'DOC'}-${String(cnt).padStart(3, '0')}`;
    const category = docType?.category || 'Others';
    const now = new Date().toISOString();

    // Aconex-style composed number — segments either come from the numbering
    // builder in the upload form (resolved against the project's own code
    // tables client-side) or fall back to a sane default here.
    const firmRow = body.firm ? await firmModel.getById(pool, body.firm) : null;
    const originator = body.originator || firmRow?.code || 'ARC';
    const functional = body.functional || 'XXX';
    const spatial = body.spatial || 'XXX';
    const form = body.form || FORM_CODE[body.type] || 'DOC';
    const discCode = body.discCode || ADISC[body.discipline] || 'XXX';
    const stageCode = stageCodeFor(project.status);
    const stage = stageOf(project.status);
    const reasonForIssue = body.reasonForIssue || 'S01 - Issued for Approval';
    const docNo = buildDocNo({ proj: project.pid, orig: originator, func: functional, spatial, form, disc: discCode, num: cnt });

    const doc = {
      id: genId('d'), ref, project: body.project, type: body.type, title: body.title,
      disciplines: [body.discipline], firm: body.firm, submittedBy, reviewers: [body.reviewer],
      status: 'Submitted', flow: 'In-Process', priority: body.priority || 'Medium', round: 1, category,
      dueDays: docType?.defaultDueDays ?? 14, created: now, updated: now, storage: `/${project.pid}/${category}/`,
      docNo, originator, functional, spatial, form, discCode, stageCode, stage, reasonForIssue,
      createdByOrg: firmRow?.name || 'Archcorp Architectural Engineering',
    };
    await documentModel.insert(pool, doc);

    let originalName;
    let stored;
    if (req.file) {
      originalName = req.file.originalname;
      stored = await storeUploadedFile(doc.id, 'in', 1, req.file);
    } else {
      originalName = `${ref}_R1.pdf`;
      stored = await storePlaceholder(doc.id, 'in', 1, doc.title);
    }
    await documentModel.insertFile(pool, {
      documentId: doc.id, kind: 'in', originalName, storedName: stored.url, version: 1, sizeLabel: stored.size, uploadedAt: now,
    });

    const remarks = (body.remarks || '').trim();
    if (remarks) {
      await threadModel.insert(pool, {
        id: genId('sn'), documentId: doc.id, seqIndex: await threadModel.getNextSeqIndex(pool, doc.id),
        by: submittedBy, role: normalizeRole(req.user.role), type: 'comment', loc: null, status: null, txt: remarks, parent: null, at: now,
      });
    }

    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: doc.id, project: body.project, at: now, action: 'Submitted', actor: submittedBy,
      role: normalizeRole(req.user.role), round: 1, comment: `Rev 1 submitted${remarks ? ': ' + remarks.slice(0, 40) : ''}`,
    });

    const document = await documentModel.getByIdFull(pool, doc.id);
    res.status(201).json({ document, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function addComment(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { txt, isSnag, loc, page } = req.body;
    const actorId = req.user.id;
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const now = new Date().toISOString();
    const role = normalizeRole(req.user.role);
    await threadModel.insert(pool, {
      id: genId('sn'), documentId: id, seqIndex: await threadModel.getNextSeqIndex(pool, id),
      by: actorId, role, type: isSnag ? 'snag' : 'comment', loc: loc || null, page: loc ? (page || 1) : 1, status: isSnag ? 'open' : null,
      txt, parent: null, at: now,
    });
    await documentModel.touchUpdated(pool, id, now);
    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: now, action: isSnag ? 'Snag raised' : 'Comment added',
      actor: actorId, role, round: doc.round, comment: txt.slice(0, 60),
    });

    const document = await documentModel.getByIdFull(pool, id);
    res.json({ document, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function addReply(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { parentIndex, txt } = req.body;
    const now = new Date().toISOString();
    await threadModel.insert(pool, {
      id: genId('sn'), documentId: id, seqIndex: await threadModel.getNextSeqIndex(pool, id),
      by: req.user.id, role: normalizeRole(req.user.role), type: 'reply', loc: null, status: null, txt, parent: parentIndex, at: now,
    });
    await documentModel.touchUpdated(pool, id, now);
    const document = await documentModel.getByIdFull(pool, id);
    res.json({ document });
  } catch (err) {
    next(err);
  }
}

async function toggleThread(req, res, next) {
  try {
    const pool = await getPool();
    const { id, seqIndex } = req.params;
    const status = await threadModel.toggleStatus(pool, id, Number(seqIndex));
    if (status === null) return res.status(404).json({ error: 'Thread item not found' });
    await documentModel.touchUpdated(pool, id, new Date().toISOString());
    const document = await documentModel.getByIdFull(pool, id);
    res.json({ document, status });
  } catch (err) {
    next(err);
  }
}

async function review(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { status, narration } = req.body;
    const actorId = req.user.id;
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const now = new Date().toISOString();
    const statusRow = await lookupModel.getStatusByName(pool, status);
    const flow = statusRow?.isCompletedFlow ? 'Completed' : 'In-Process';
    await documentModel.updateReview(pool, id, { status, flow, updated: now });

    const stored = await storePlaceholder(id, 'out', doc.round, `${doc.ref} — Reviewed`);
    await documentModel.insertFile(pool, {
      documentId: id, kind: 'out', originalName: `${doc.ref}_R${doc.round}_REVIEWED.pdf`, storedName: stored.url,
      version: doc.round, sizeLabel: stored.size, uploadedAt: now,
    });

    const role = normalizeRole(req.user.role);
    const trimmedNarration = (narration || '').trim();
    if (trimmedNarration) {
      await threadModel.insert(pool, {
        id: genId('sn'), documentId: id, seqIndex: await threadModel.getNextSeqIndex(pool, id),
        by: actorId, role, type: 'comment', loc: null, status: null, txt: trimmedNarration, parent: null, at: now,
      });
    }

    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: now, action: status, actor: actorId, role,
      round: doc.round, comment: trimmedNarration || `Decision: ${status}`,
    });

    const document = await documentModel.getByIdFull(pool, id);
    res.json({ document, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function resubmit(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const actorId = req.user.id;
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const now = new Date().toISOString();
    const round = doc.round + 1;
    await documentModel.resubmit(pool, id, { round, status: 'Submitted', flow: 'In-Process', updated: now });

    const stored = await storePlaceholder(id, 'in', round, doc.title);
    await documentModel.insertFile(pool, {
      documentId: id, kind: 'in', originalName: `${doc.ref}_R${round}.pdf`, storedName: stored.url, version: round,
      sizeLabel: stored.size, uploadedAt: now,
    });

    const role = normalizeRole(req.user.role);
    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: now, action: 'Submitted', actor: actorId, role, round,
      comment: `Rev ${round} re-submitted addressing prior comments`,
    });

    const document = await documentModel.getByIdFull(pool, id);
    res.json({ document, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function setMode(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { mode } = req.body;
    if (!['review', 'snagging'].includes(mode)) return res.status(400).json({ error: "mode must be 'review' or 'snagging'" });
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await documentModel.setMode(pool, id, mode);
    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: new Date().toISOString(), action: 'Handling set',
      actor: req.user.id, role: normalizeRole(req.user.role), round: doc.round,
      comment: `Marked for ${mode === 'snagging' ? 'Snagging' : 'Review'} by ${req.user.name}`,
    });
    const document = await documentModel.getByIdFull(pool, id);
    res.json({ document, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function addMemberReview(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { verdict, comment } = req.body;
    if (!['endorse', 'object', 'comment'].includes(verdict)) return res.status(400).json({ error: 'Invalid verdict' });
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await memberReviewModel.upsert(pool, id, req.user.id, verdict, comment || '');
    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: new Date().toISOString(), action: 'Member review',
      actor: req.user.id, role: normalizeRole(req.user.role), round: doc.round,
      comment: `${req.user.name}: ${verdict} — ${(comment || '').slice(0, 50)}`,
    });
    const document = await documentModel.getByIdFull(pool, id);
    res.json({ document, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const documents = await documentModel.getAllFull(pool);
    res.json({ documents });
  } catch (err) {
    next(err);
  }
}

async function listHistory(req, res, next) {
  try {
    const pool = await getPool();
    const history = await historyModel.getAll(pool);
    res.json({ history });
  } catch (err) {
    next(err);
  }
}

async function listMarkups(req, res, next) {
  try {
    const pool = await getPool();
    const rows = await markupModel.getAll(pool);
    const markups = {};
    for (const m of rows) {
      markups[m.documentId] = m.marks;
    }
    res.json({ markups });
  } catch (err) {
    next(err);
  }
}

async function saveMarkups(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { marks } = req.body;
    if (!Array.isArray(marks)) return res.status(400).json({ error: 'marks array is required' });
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const saved = await markupModel.save(pool, id, marks);
    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: new Date().toISOString(), action: 'Markup saved',
      actor: req.user.id, role: normalizeRole(req.user.role), round: doc.round,
      comment: `${marks.length} markup${marks.length !== 1 ? 's' : ''} added by ${req.user.name}`,
    });
    res.json({ marks: saved, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function notifyTeam(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const members = (await assignmentModel.getForProject(pool, doc.project)).map((m) => m.a).filter((pid) => pid !== req.user.id);
    const label = doc.docNo || doc.ref;
    const now = new Date().toISOString();
    const notification = await notificationModel.insert(pool, {
      id: genId('n'), to: members, from: req.user.id, docId: id, project: doc.project,
      text: `${req.user.name} requests review of ${label}`, kind: 'review', at: now,
    });
    const message = await chatModel.insert(pool, {
      id: genId('m'), project: doc.project, by: 'ai', kind: 'ai', at: now,
      text: `${req.user.name} notified the team to review <b>${label}</b> — ${doc.title}.`,
    });
    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: now, action: 'Team notified', actor: req.user.id,
      role: normalizeRole(req.user.role), round: doc.round, comment: `${members.length} member(s) notified for review`,
    });
    res.status(201).json({ notification, message, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

async function followUp(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { summary } = req.body;
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const label = doc.docNo || doc.ref;
    const members = (await assignmentModel.getForProject(pool, doc.project)).map((m) => m.a).filter((pid) => pid !== req.user.id);
    const now = new Date().toISOString();
    const message = await chatModel.insert(pool, {
      id: genId('m'), project: doc.project, by: req.user.id, kind: 'msg', at: now,
      text: `Follow-up on ${label} (${doc.title}) — currently ${summary || ''}. Please advise status.`,
    });
    const notification = await notificationModel.insert(pool, {
      id: genId('n'), to: members, from: req.user.id, docId: id, project: doc.project,
      text: `Follow-up requested on ${label}`, kind: 'followup', at: now,
    });
    const historyEntry = await historyModel.insert(pool, {
      id: genId('h'), doc: id, project: doc.project, at: now, action: 'Follow-up', actor: req.user.id,
      role: normalizeRole(req.user.role), round: doc.round, comment: `Follow-up posted by ${req.user.name}`,
    });
    res.status(201).json({ notification, message, historyEntries: [historyEntry] });
  } catch (err) {
    next(err);
  }
}

// Firebase Storage doesn't send CORS headers for browser-side fetch(), so the
// markup export (which needs the raw PDF bytes to burn annotations onto it)
// fetches the file server-side here instead, where CORS doesn't apply.
async function proxyFile(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const which = req.query.which === 'out' ? 'out' : 'in';
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const file = which === 'out' ? doc.outFile : doc.inFile;
    if (!file?.url) return res.status(404).json({ error: 'File not available' });

    const upstream = await fetch(file.url);
    if (!upstream.ok) return res.status(502).json({ error: 'Could not fetch source file' });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/pdf');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

async function sendEmailLog(req, res, next) {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { status, narration } = req.body;
    const doc = await documentModel.getByIdFull(pool, id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const firm = await firmModel.getById(pool, doc.firm);
    const submitter = await getPerson(pool, doc.submittedBy);
    const openPts = doc.thread.filter((t) => t.type === 'snag' && t.status === 'open');
    const subject = `[${doc.ref}] ${status} — ${doc.title}`;
    const body =
      `Dear ${submitter?.name || ''},\n\nDocument ${doc.ref} (${doc.title}) has been reviewed with the outcome: ${status}.\n\n` +
      (narration ? narration + '\n\n' : '') +
      (openPts.length ? `Open review points (${openPts.length}):\n` + openPts.map((s, i) => `${i + 1}. ${s.txt}`).join('\n') + '\n\n' : '') +
      `Please access the reviewed copy and full comment thread in the Archcorp DCC portal.\n\nRegards,\n${req.user.name}\nArchcorp`;
    let delivered = false;
    let deliveryError = null;
    if (submitter?.email) {
      try {
        await sendMail({ to: submitter.email, subject, text: body });
        delivered = true;
      } catch (err) {
        deliveryError = err.message;
        console.error(`[mailer] decision email to ${submitter.email} failed:`, err.message);
      }
    } else {
      deliveryError = 'Submitter has no email on file';
    }

    const email = await emailLogModel.insert(pool, {
      id: genId('em'), to: submitter?.email || '', firm: firm?.name || '', subject, body, doc: id,
      at: new Date().toISOString(), type: 'decision',
    });
    res.status(201).json({ email, delivered, deliveryError });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list, listHistory, createDocument, addComment, addReply, toggleThread, review, resubmit,
  setMode, addMemberReview, listMarkups, saveMarkups, notifyTeam, followUp, sendEmailLog, proxyFile,
};
