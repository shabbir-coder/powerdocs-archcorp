function mapRow(r) {
  return {
    id: r.Id,
    to: r.ToPersons.split(',').filter(Boolean),
    from: r.FromPerson,
    docId: r.DocumentId || undefined,
    project: r.ProjectId,
    text: r.Txt,
    at: r.CreatedAt.toISOString(),
    read: !!r.IsRead || !!r.ReadByMe,
    kind: r.Kind,
  };
}

// `read` is relative to the requesting person: the legacy shared IsRead flag,
// or a receipt of their own in DccNotificationReads.
const SELECT_FOR_PERSON = `
  SELECT n.Id, n.ToPersons, n.FromPerson, n.DocumentId, n.ProjectId, n.Txt, n.Kind, n.IsRead, n.CreatedAt,
         CASE WHEN r.PersonId IS NULL THEN 0 ELSE 1 END AS ReadByMe
  FROM dbo.DccNotifications n
  LEFT JOIN dbo.DccNotificationReads r ON r.NotificationId = n.Id AND r.PersonId = @person`;

// Admins see every notification regardless of recipient, matching the
// client-side unreadNotifications() behaviour.
const VISIBLE_TO_PERSON = `(@isAdmin = 1 OR (',' + n.ToPersons + ',') LIKE '%,' + @person + ',%')`;

async function getForPerson(pool, personId, isAdmin) {
  const { recordset } = await pool.request().input('person', personId).input('isAdmin', isAdmin ? 1 : 0)
    .query(`${SELECT_FOR_PERSON} WHERE ${VISIBLE_TO_PERSON} ORDER BY n.CreatedAt DESC`);
  return recordset.map(mapRow);
}

async function getByIdForPerson(pool, id, personId, isAdmin) {
  const { recordset } = await pool.request().input('id', id).input('person', personId).input('isAdmin', isAdmin ? 1 : 0)
    .query(`${SELECT_FOR_PERSON} WHERE n.Id = @id AND ${VISIBLE_TO_PERSON}`);
  return recordset[0] ? mapRow(recordset[0]) : null;
}

async function insert(pool, n) {
  await pool.request()
    .input('id', n.id).input('to', n.to.join(',')).input('from', n.from).input('doc', n.docId || null)
    .input('project', n.project).input('text', n.text).input('kind', n.kind).input('at', n.at)
    .query(`INSERT INTO dbo.DccNotifications (Id, ToPersons, FromPerson, DocumentId, ProjectId, Txt, Kind, IsRead, CreatedAt)
            VALUES (@id, @to, @from, @doc, @project, @text, @kind, 0, @at)`);
  return { id: n.id, to: n.to, from: n.from, docId: n.docId, project: n.project, text: n.text, at: n.at, read: false, kind: n.kind };
}

// Idempotent: a second call for the same person is a no-op.
async function markReadFor(pool, id, personId) {
  await pool.request().input('id', id).input('person', personId).input('at', new Date())
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccNotificationReads WHERE NotificationId = @id AND PersonId = @person)
              INSERT INTO dbo.DccNotificationReads (NotificationId, PersonId, ReadAt) VALUES (@id, @person, @at)`);
}

// Marks only the caller's view as read - an Admin clearing their bell no
// longer clears it for every recipient.
async function markAllReadFor(pool, personId, isAdmin) {
  await pool.request().input('person', personId).input('isAdmin', isAdmin ? 1 : 0).input('at', new Date())
    .query(`INSERT INTO dbo.DccNotificationReads (NotificationId, PersonId, ReadAt)
            SELECT n.Id, @person, @at FROM dbo.DccNotifications n
            WHERE n.IsRead = 0 AND ${VISIBLE_TO_PERSON}
              AND NOT EXISTS (SELECT 1 FROM dbo.DccNotificationReads r WHERE r.NotificationId = n.Id AND r.PersonId = @person)`);
}

module.exports = { getForPerson, getByIdForPerson, insert, markReadFor, markAllReadFor };
