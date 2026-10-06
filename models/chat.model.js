function mapRow(r) {
  return { id: r.Id, project: r.ProjectId, by: r.ByPerson, at: r.CreatedAt.toISOString(), text: r.Txt, kind: r.Kind };
}

async function getForProjects(pool, projectIds) {
  if (!projectIds.length) return [];
  const request = pool.request();
  const params = projectIds.map((id, index) => {
    request.input(`project${index}`, id);
    return `@project${index}`;
  });
  const { recordset } = await request.query(`SELECT Id, ProjectId, ByPerson, Txt, Kind, CreatedAt
    FROM dbo.DccChatMessages
    WHERE ProjectId IN (${params.join(', ')})
    ORDER BY CreatedAt, Id`);
  return recordset.map(mapRow);
}

async function getForProjectSince(pool, projectId, since) {
  const request = pool.request().input('project', projectId);
  const sinceClause = since ? 'AND CreatedAt >= @since' : '';
  if (since) request.input('since', new Date(since));
  const order = since ? 'ASC' : 'DESC';
  const { recordset } = await request.query(`SELECT TOP (500) Id, ProjectId, ByPerson, Txt, Kind, CreatedAt
    FROM dbo.DccChatMessages
    WHERE ProjectId = @project ${sinceClause}
    ORDER BY CreatedAt ${order}, Id ${order}`);
  const messages = recordset.map(mapRow);
  return since ? messages : messages.reverse();
}

async function insert(pool, m) {
  await pool.request()
    .input('id', m.id).input('project', m.project).input('by', m.by).input('text', m.text)
    .input('kind', m.kind).input('at', m.at)
    .query(`INSERT INTO dbo.DccChatMessages (Id, ProjectId, ByPerson, Txt, Kind, CreatedAt)
            VALUES (@id, @project, @by, @text, @kind, @at)`);
  return { id: m.id, project: m.project, by: m.by, at: m.at, text: m.text, kind: m.kind };
}

module.exports = { getForProjects, getForProjectSince, insert };
