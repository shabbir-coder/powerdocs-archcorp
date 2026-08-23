const { bindInClause } = require('../utils/sql');

function mapRow(r) {
  return {
    id: r.Id,
    by: r.ByPerson,
    role: r.Role,
    type: r.Type,
    loc: r.LocX != null && r.LocY != null ? { x: r.LocX, y: r.LocY } : null,
    page: r.Page || 1,
    status: r.Status || null,
    txt: r.Txt,
    parent: r.ParentIndex,
    at: r.CreatedAt.toISOString(),
  };
}

async function getForDocuments(pool, docIds) {
  if (!docIds.length) return {};
  const request = pool.request();
  const inClause = bindInClause(request, 'doc', docIds);
  const { recordset } = await request.query(
    `SELECT Id, DocumentId, SeqIndex, ByPerson, Role, Type, LocX, LocY, Page, Status, Txt, ParentIndex, CreatedAt
     FROM dbo.DccDocumentThread WHERE DocumentId IN (${inClause})
     ORDER BY DocumentId, SeqIndex ASC`
  );
  const byDoc = {};
  for (const r of recordset) {
    (byDoc[r.DocumentId] = byDoc[r.DocumentId] || []).push(mapRow(r));
  }
  return byDoc;
}

async function getNextSeqIndex(pool, documentId) {
  const { recordset } = await pool.request().input('doc', documentId)
    .query('SELECT COUNT(*) AS n FROM dbo.DccDocumentThread WHERE DocumentId = @doc');
  return recordset[0].n;
}

async function insert(pool, item) {
  await pool.request()
    .input('id', item.id).input('doc', item.documentId).input('seq', item.seqIndex)
    .input('by', item.by).input('role', item.role).input('type', item.type)
    .input('locX', item.loc ? item.loc.x : null).input('locY', item.loc ? item.loc.y : null)
    .input('page', item.page || 1)
    .input('status', item.status).input('txt', item.txt).input('parent', item.parent)
    .input('at', item.at)
    .query(`INSERT INTO dbo.DccDocumentThread (Id, DocumentId, SeqIndex, ByPerson, Role, Type, LocX, LocY, Page, Status, Txt, ParentIndex, CreatedAt)
            VALUES (@id, @doc, @seq, @by, @role, @type, @locX, @locY, @page, @status, @txt, @parent, @at)`);
  return item;
}

async function toggleStatus(pool, documentId, seqIndex) {
  const current = await pool.request().input('doc', documentId).input('seq', seqIndex)
    .query('SELECT Id, Status FROM dbo.DccDocumentThread WHERE DocumentId = @doc AND SeqIndex = @seq');
  if (!current.recordset.length) return null;
  const next = current.recordset[0].Status === 'resolved' ? 'open' : 'resolved';
  await pool.request().input('doc', documentId).input('seq', seqIndex).input('status', next)
    .query('UPDATE dbo.DccDocumentThread SET Status = @status WHERE DocumentId = @doc AND SeqIndex = @seq');
  return next;
}

module.exports = { getForDocuments, getNextSeqIndex, insert, toggleStatus, mapRow };
