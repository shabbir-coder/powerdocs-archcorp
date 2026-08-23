const { bindInClause } = require('../utils/sql');

function mapFile(r) {
  if (!r) return null;
  // StoredName holds the full Firebase Storage download URL.
  return { name: r.OriginalName, ver: r.Version, size: r.SizeLabel, url: r.StoredName };
}

// Every resubmission already inserts a new DccDocumentFiles row (kind='in',
// Version = the new round) — the full revision ladder is just that history,
// read back and labeled against the document's current round/flow. No
// separate revisions table needed, and nothing here is client-only anymore.
function mapRevisions(history, round, flow) {
  return (history || []).map((h) => ({
    rev: h.version,
    date: h.at,
    status: h.version < round ? 'Superseded' : flow === 'Completed' ? 'Current — approved' : 'Current — in review',
    file: h.name,
    current: h.version === round,
  }));
}

function mapDocumentRow(r, files, thread, memberReviews, fileHistory) {
  const docFiles = files[r.Id] || {};
  return {
    id: r.Id,
    ref: r.Ref,
    project: r.ProjectId,
    type: r.Type,
    title: r.Title,
    disciplines: r.Disciplines.split(',').filter(Boolean),
    firm: r.FirmId,
    submittedBy: r.SubmittedBy,
    reviewers: r.ReviewerIds.split(',').filter(Boolean),
    status: r.Status,
    flow: r.Flow,
    priority: r.Priority,
    round: r.Round,
    category: r.Category,
    dueDays: r.DueDays,
    created: r.Created.toISOString(),
    updated: r.Updated.toISOString(),
    storage: r.Storage,
    inFile: mapFile(docFiles.in),
    outFile: mapFile(docFiles.out),
    thread: thread[r.Id] || [],
    activity: r.Activity || undefined,
    leadDays: r.LeadDays ?? undefined,
    material: r.Material || undefined,
    qty: r.Qty || undefined,
    mode: r.Mode,
    memberReviews: (memberReviews && memberReviews[r.Id]) || [],
    docNo: r.DocNo || undefined,
    originator: r.Originator || undefined,
    functional: r.Functional || undefined,
    spatial: r.Spatial || undefined,
    form: r.Form || undefined,
    discCode: r.DiscCode || undefined,
    stageCode: r.StageCode || undefined,
    stage: r.Stage || undefined,
    reasonForIssue: r.ReasonForIssue || undefined,
    createdByOrg: r.CreatedByOrg || undefined,
    revisions: mapRevisions((fileHistory && fileHistory[r.Id]) || [], r.Round, r.Flow),
  };
}

async function getLatestFiles(pool, docIds) {
  if (!docIds.length) return {};
  const request = pool.request();
  const inClause = bindInClause(request, 'doc', docIds);
  const { recordset } = await request.query(
    `SELECT DocumentId, Kind, OriginalName, StoredName, Version, SizeLabel, UploadedAt FROM (
       SELECT f.*, ROW_NUMBER() OVER (PARTITION BY f.DocumentId, f.Kind ORDER BY f.UploadedAt DESC) AS rn
       FROM dbo.DccDocumentFiles f
       JOIN dbo.DccDocuments d ON d.Id = f.DocumentId AND f.Version = d.Round
       WHERE f.DocumentId IN (${inClause})
     ) x WHERE rn = 1`
  );
  const byDoc = {};
  for (const r of recordset) {
    byDoc[r.DocumentId] = byDoc[r.DocumentId] || {};
    byDoc[r.DocumentId][r.Kind] = r;
  }
  return byDoc;
}

async function getInFileHistory(pool, docIds) {
  if (!docIds.length) return {};
  const request = pool.request();
  const inClause = bindInClause(request, 'doc', docIds);
  const { recordset } = await request.query(
    `SELECT DocumentId, Version, OriginalName, UploadedAt FROM dbo.DccDocumentFiles
     WHERE Kind = 'in' AND DocumentId IN (${inClause})
     ORDER BY DocumentId, Version ASC`
  );
  const byDoc = {};
  for (const r of recordset) {
    (byDoc[r.DocumentId] = byDoc[r.DocumentId] || []).push({ version: r.Version, name: r.OriginalName, at: r.UploadedAt.toISOString() });
  }
  return byDoc;
}

const DOC_COLUMNS = `Id, Ref, ProjectId, Type, Title, Disciplines, FirmId, SubmittedBy, ReviewerIds, Status, Flow,
  Priority, Round, Category, DueDays, Created, Updated, Storage, Activity, LeadDays, Material, Qty, Mode,
  DocNo, Originator, Functional, Spatial, Form, DiscCode, StageCode, Stage, ReasonForIssue, CreatedByOrg`;

async function getAllFull(pool) {
  const { recordset } = await pool.request().query(`SELECT ${DOC_COLUMNS} FROM dbo.DccDocuments`);
  const ids = recordset.map((r) => r.Id);
  const thread = require('./thread.model');
  const memberReview = require('./memberReview.model');
  const [files, threadByDoc, memberReviewsByDoc, fileHistory] = await Promise.all([
    getLatestFiles(pool, ids), thread.getForDocuments(pool, ids), memberReview.getForDocuments(pool, ids), getInFileHistory(pool, ids),
  ]);
  return recordset.map((r) => mapDocumentRow(r, files, threadByDoc, memberReviewsByDoc, fileHistory));
}

async function getByIdFull(pool, id) {
  const { recordset } = await pool.request().input('id', id).query(`SELECT ${DOC_COLUMNS} FROM dbo.DccDocuments WHERE Id = @id`);
  if (!recordset.length) return null;
  const thread = require('./thread.model');
  const memberReview = require('./memberReview.model');
  const [files, threadByDoc, memberReviewsByDoc, fileHistory] = await Promise.all([
    getLatestFiles(pool, [id]), thread.getForDocuments(pool, [id]), memberReview.getForDocuments(pool, [id]), getInFileHistory(pool, [id]),
  ]);
  return mapDocumentRow(recordset[0], files, threadByDoc, memberReviewsByDoc, fileHistory);
}

async function insert(pool, doc) {
  await pool.request()
    .input('id', doc.id).input('ref', doc.ref).input('project', doc.project).input('type', doc.type)
    .input('title', doc.title).input('disciplines', doc.disciplines.join(',')).input('firm', doc.firm)
    .input('submittedBy', doc.submittedBy).input('reviewerIds', doc.reviewers.join(','))
    .input('status', doc.status).input('flow', doc.flow).input('priority', doc.priority)
    .input('round', doc.round).input('category', doc.category).input('dueDays', doc.dueDays)
    .input('created', doc.created).input('updated', doc.updated).input('storage', doc.storage)
    .input('activity', doc.activity || null).input('leadDays', doc.leadDays ?? null)
    .input('material', doc.material || null).input('qty', doc.qty || null).input('mode', doc.mode || 'review')
    .input('docNo', doc.docNo || null).input('originator', doc.originator || null).input('functional', doc.functional || null)
    .input('spatial', doc.spatial || null).input('form', doc.form || null).input('discCode', doc.discCode || null)
    .input('stageCode', doc.stageCode || null).input('stage', doc.stage || null)
    .input('reasonForIssue', doc.reasonForIssue || null).input('createdByOrg', doc.createdByOrg || null)
    .query(`INSERT INTO dbo.DccDocuments (${DOC_COLUMNS})
            VALUES (@id, @ref, @project, @type, @title, @disciplines, @firm, @submittedBy, @reviewerIds, @status,
                    @flow, @priority, @round, @category, @dueDays, @created, @updated, @storage, @activity, @leadDays,
                    @material, @qty, @mode,
                    @docNo, @originator, @functional, @spatial, @form, @discCode, @stageCode, @stage, @reasonForIssue, @createdByOrg)`);
}

async function setMode(pool, id, mode) {
  await pool.request().input('id', id).input('mode', mode).query('UPDATE dbo.DccDocuments SET Mode = @mode WHERE Id = @id');
}

async function insertFile(pool, file) {
  await pool.request()
    .input('doc', file.documentId).input('kind', file.kind).input('originalName', file.originalName)
    .input('storedName', file.storedName).input('version', file.version).input('sizeLabel', file.sizeLabel)
    .input('uploadedAt', file.uploadedAt)
    .query(`INSERT INTO dbo.DccDocumentFiles (DocumentId, Kind, OriginalName, StoredName, Version, SizeLabel, UploadedAt)
            VALUES (@doc, @kind, @originalName, @storedName, @version, @sizeLabel, @uploadedAt)`);
}

async function updateReview(pool, id, { status, flow, updated }) {
  await pool.request().input('id', id).input('status', status).input('flow', flow).input('updated', updated)
    .query('UPDATE dbo.DccDocuments SET Status = @status, Flow = @flow, Updated = @updated WHERE Id = @id');
}

async function resubmit(pool, id, { round, status, flow, updated }) {
  await pool.request().input('id', id).input('round', round).input('status', status).input('flow', flow).input('updated', updated)
    .query('UPDATE dbo.DccDocuments SET Round = @round, Status = @status, Flow = @flow, Updated = @updated WHERE Id = @id');
}

async function touchUpdated(pool, id, updated) {
  await pool.request().input('id', id).input('updated', updated)
    .query('UPDATE dbo.DccDocuments SET Updated = @updated WHERE Id = @id');
}

async function countForProject(pool, projectId) {
  const { recordset } = await pool.request().input('project', projectId)
    .query('SELECT COUNT(*) AS n FROM dbo.DccDocuments WHERE ProjectId = @project');
  return recordset[0].n;
}

module.exports = {
  mapDocumentRow, getAllFull, getByIdFull, insert, insertFile, updateReview, resubmit, touchUpdated, countForProject, setMode,
};
