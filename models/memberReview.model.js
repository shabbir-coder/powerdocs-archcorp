const { bindInClause } = require('../utils/sql');

function mapRow(r) {
  return { by: r.PersonId, at: r.At.toISOString(), verdict: r.Verdict, comment: r.Comment || '' };
}

async function getForDocuments(pool, docIds) {
  if (!docIds.length) return {};
  const request = pool.request();
  const inClause = bindInClause(request, 'doc', docIds);
  const { recordset } = await request.query(
    `SELECT DocumentId, PersonId, Verdict, Comment, At FROM dbo.DccMemberReviews WHERE DocumentId IN (${inClause})`
  );
  const byDoc = {};
  for (const r of recordset) {
    (byDoc[r.DocumentId] = byDoc[r.DocumentId] || []).push(mapRow(r));
  }
  return byDoc;
}

// One live verdict per person per document — resubmitting replaces their prior one.
async function upsert(pool, documentId, personId, verdict, comment) {
  const at = new Date().toISOString();
  await pool.request().input('doc', documentId).input('person', personId).input('verdict', verdict).input('comment', comment || null).input('at', at)
    .query(`MERGE dbo.DccMemberReviews AS target
            USING (SELECT @doc AS DocumentId, @person AS PersonId) AS src
            ON target.DocumentId = src.DocumentId AND target.PersonId = src.PersonId
            WHEN MATCHED THEN UPDATE SET Verdict = @verdict, Comment = @comment, At = @at
            WHEN NOT MATCHED THEN INSERT (DocumentId, PersonId, Verdict, Comment, At) VALUES (@doc, @person, @verdict, @comment, @at);`);
  return { by: personId, at, verdict, comment: comment || '' };
}

module.exports = { getForDocuments, upsert };
