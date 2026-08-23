function mapRow(r) {
  return {
    id: r.Id,
    doc: r.DocumentId,
    project: r.ProjectId,
    at: r.At.toISOString(),
    action: r.Action,
    actor: r.Actor,
    role: r.Role,
    round: r.Round,
    comment: r.Comment || '',
  };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, DocumentId, ProjectId, At, Action, Actor, Role, Round, Comment FROM dbo.DccDocumentHistory');
  return recordset.map(mapRow);
}

async function insert(pool, entry) {
  await pool.request()
    .input('id', entry.id).input('doc', entry.doc).input('project', entry.project).input('at', entry.at)
    .input('action', entry.action).input('actor', entry.actor).input('role', entry.role)
    .input('round', entry.round).input('comment', entry.comment || null)
    .query(`INSERT INTO dbo.DccDocumentHistory (Id, DocumentId, ProjectId, At, Action, Actor, Role, Round, Comment)
            VALUES (@id, @doc, @project, @at, @action, @actor, @role, @round, @comment)`);
  return entry;
}

module.exports = { getAll, insert, mapRow };
