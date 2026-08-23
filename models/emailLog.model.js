function mapRow(r) {
  return { id: r.Id, to: r.ToEmail, firm: r.FirmName, subject: r.Subject, body: r.Body, doc: r.DocumentId, at: r.CreatedAt.toISOString(), type: r.Type };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, ToEmail, FirmName, Subject, Body, DocumentId, CreatedAt, Type FROM dbo.DccEmailLog ORDER BY CreatedAt DESC');
  return recordset.map(mapRow);
}

async function insert(pool, e) {
  await pool.request()
    .input('id', e.id).input('to', e.to).input('firm', e.firm).input('subject', e.subject).input('body', e.body)
    .input('doc', e.doc).input('at', e.at).input('type', e.type)
    .query(`INSERT INTO dbo.DccEmailLog (Id, ToEmail, FirmName, Subject, Body, DocumentId, CreatedAt, Type)
            VALUES (@id, @to, @firm, @subject, @body, @doc, @at, @type)`);
  return e;
}

module.exports = { getAll, insert };
