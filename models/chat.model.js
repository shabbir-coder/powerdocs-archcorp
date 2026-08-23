function mapRow(r) {
  return { id: r.Id, project: r.ProjectId, by: r.ByPerson, at: r.CreatedAt.toISOString(), text: r.Txt, kind: r.Kind };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, ProjectId, ByPerson, Txt, Kind, CreatedAt FROM dbo.DccChatMessages ORDER BY CreatedAt');
  return recordset.map(mapRow);
}

async function insert(pool, m) {
  await pool.request()
    .input('id', m.id).input('project', m.project).input('by', m.by).input('text', m.text)
    .input('kind', m.kind).input('at', m.at)
    .query(`INSERT INTO dbo.DccChatMessages (Id, ProjectId, ByPerson, Txt, Kind, CreatedAt)
            VALUES (@id, @project, @by, @text, @kind, @at)`);
  return { id: m.id, project: m.project, by: m.by, at: m.at, text: m.text, kind: m.kind };
}

module.exports = { getAll, insert };
