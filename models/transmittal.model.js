function mapRow(r) {
  return {
    id: r.Id,
    number: r.Number,
    project: r.ProjectId,
    mailType: r.MailType,
    purpose: r.Purpose,
    from: r.FromPerson,
    to: r.ToPersons.split(',').filter(Boolean),
    docs: r.DocumentIds.split(',').filter(Boolean),
    date: r.CreatedAt.toISOString(),
    status: r.Status,
    remarks: r.Remarks || '',
  };
}

const COLUMNS = 'Id, Number, ProjectId, MailType, Purpose, FromPerson, ToPersons, DocumentIds, CreatedAt, Status, Remarks';

async function getAll(pool) {
  const { recordset } = await pool.request().query(`SELECT ${COLUMNS} FROM dbo.DccTransmittals ORDER BY CreatedAt DESC`);
  return recordset.map(mapRow);
}

async function countForProject(pool, projectId) {
  const { recordset } = await pool.request().input('project', projectId)
    .query('SELECT COUNT(*) AS n FROM dbo.DccTransmittals WHERE ProjectId = @project');
  return recordset[0].n;
}

async function insert(pool, t) {
  await pool.request()
    .input('id', t.id).input('number', t.number).input('project', t.project).input('mailType', t.mailType)
    .input('purpose', t.purpose).input('from', t.from).input('to', t.to.join(',')).input('docs', t.docs.join(','))
    .input('createdAt', t.createdAt).input('status', t.status).input('remarks', t.remarks || null)
    .query(`INSERT INTO dbo.DccTransmittals (Id, Number, ProjectId, MailType, Purpose, FromPerson, ToPersons, DocumentIds, CreatedAt, Status, Remarks)
            VALUES (@id, @number, @project, @mailType, @purpose, @from, @to, @docs, @createdAt, @status, @remarks)`);
  const { recordset } = await pool.request().input('id', t.id).query(`SELECT ${COLUMNS} FROM dbo.DccTransmittals WHERE Id = @id`);
  return mapRow(recordset[0]);
}

module.exports = { getAll, countForProject, insert };
