function mapRow(r) {
  return { documentId: r.DocumentId, marks: JSON.parse(r.MarksJson), updatedAt: r.UpdatedAt.toISOString() };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT DocumentId, MarksJson, UpdatedAt FROM dbo.DccDocumentMarkups');
  return recordset.map(mapRow);
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

module.exports = { getAll, save };
