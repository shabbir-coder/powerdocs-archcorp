function mapRow(r) {
  return {
    id: r.Id,
    to: r.ToPersons.split(',').filter(Boolean),
    from: r.FromPerson,
    docId: r.DocumentId || undefined,
    project: r.ProjectId,
    text: r.Txt,
    at: r.CreatedAt.toISOString(),
    read: !!r.IsRead,
    kind: r.Kind,
  };
}

const COLUMNS = 'Id, ToPersons, FromPerson, DocumentId, ProjectId, Txt, Kind, IsRead, CreatedAt';

async function getAll(pool) {
  const { recordset } = await pool.request().query(`SELECT ${COLUMNS} FROM dbo.DccNotifications ORDER BY CreatedAt DESC`);
  return recordset.map(mapRow);
}

async function insert(pool, n) {
  await pool.request()
    .input('id', n.id).input('to', n.to.join(',')).input('from', n.from).input('doc', n.docId || null)
    .input('project', n.project).input('text', n.text).input('kind', n.kind).input('at', n.at)
    .query(`INSERT INTO dbo.DccNotifications (Id, ToPersons, FromPerson, DocumentId, ProjectId, Txt, Kind, IsRead, CreatedAt)
            VALUES (@id, @to, @from, @doc, @project, @text, @kind, 0, @at)`);
  return { id: n.id, to: n.to, from: n.from, docId: n.docId, project: n.project, text: n.text, at: n.at, read: false, kind: n.kind };
}

// Admins see (and can clear) every notification regardless of recipient, matching
// the existing client-side unreadNotifications() behaviour exactly.
async function markAllReadFor(pool, personId, isAdmin) {
  if (isAdmin) {
    await pool.request().query('UPDATE dbo.DccNotifications SET IsRead = 1 WHERE IsRead = 0');
    return;
  }
  await pool.request().input('person', personId)
    .query(`UPDATE dbo.DccNotifications SET IsRead = 1
            WHERE IsRead = 0 AND (',' + ToPersons + ',') LIKE '%,' + @person + ',%'`);
}

module.exports = { getAll, insert, markAllReadFor };
