const { Filters, parsePaging, parseSort, runList, toList } = require('../utils/listQuery');

function mapRow(r) {
  return { documentId: r.DocumentId, marks: JSON.parse(r.MarksJson), updatedAt: r.UpdatedAt.toISOString() };
}

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .in('doc', 'm.DocumentId').dateRange('dateFrom', 'dateTo', 'm.UpdatedAt');
  const projects = toList(query.project);
  if (projects.length) {
    filters.raw(`EXISTS (SELECT 1 FROM dbo.DccDocuments d WHERE d.Id = m.DocumentId
      AND d.ProjectId IN (${projects.map((p) => filters.param(p)).join(', ')}))`);
  }
  const { rows, pagination } = await runList(request, {
    select: 'm.DocumentId, m.MarksJson, m.UpdatedAt', from: 'dbo.DccDocumentMarkups m', filters,
    orderBy: parseSort(query, { updated: 'm.UpdatedAt', doc: 'm.DocumentId' }, { key: 'updated', order: 'desc' }, 'm.DocumentId'),
    paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

// Whole-array replace, matching the client's saveMarkups(docId, marks) call shape.
async function save(pool, documentId, marks) {
  const json = JSON.stringify(marks);
  const now = new Date().toISOString();
  await pool.request().input('doc', documentId).input('json', json).input('at', now)
    .query(`MERGE dbo.DccDocumentMarkups AS target
            USING (SELECT @doc AS DocumentId) AS src ON target.DocumentId = src.DocumentId
            WHEN MATCHED THEN UPDATE SET MarksJson = @json, UpdatedAt = @at
            WHEN NOT MATCHED THEN INSERT (DocumentId, MarksJson, UpdatedAt) VALUES (@doc, @json, @at);`);
  return marks;
}

module.exports = { list, save };
