function mapRow(r) {
  return {
    id: r.Id,
    ref: r.Ref,
    project: r.ProjectId,
    discipline: r.Discipline,
    location: r.Location,
    desc: r.Descr,
    raisedBy: r.RaisedBy,
    assignedTo: r.AssignedTo,
    priority: r.Priority,
    status: r.Status,
    created: r.Created.toISOString(),
    closed: r.Closed ? r.Closed.toISOString() : null,
    photo: r.Photo,
  };
}

const COLUMNS = 'Id, Ref, ProjectId, Discipline, Location, Descr, RaisedBy, AssignedTo, Priority, Status, Created, Closed, Photo';

async function getAll(pool) {
  const { recordset } = await pool.request().query(`SELECT ${COLUMNS} FROM dbo.DccSnags ORDER BY Created DESC`);
  return recordset.map(mapRow);
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id).query(`SELECT ${COLUMNS} FROM dbo.DccSnags WHERE Id = @id`);
  return recordset.length ? mapRow(recordset[0]) : null;
}

async function countForProject(pool, projectId) {
  const { recordset } = await pool.request().input('project', projectId)
    .query('SELECT COUNT(*) AS n FROM dbo.DccSnags WHERE ProjectId = @project');
  return recordset[0].n;
}

async function insert(pool, s) {
  await pool.request()
    .input('id', s.id).input('ref', s.ref).input('project', s.project).input('discipline', s.discipline)
    .input('location', s.location).input('desc', s.desc).input('raisedBy', s.raisedBy).input('assignedTo', s.assignedTo)
    .input('priority', s.priority).input('status', s.status).input('created', s.created).input('closed', s.closed || null)
    .input('photo', !!s.photo)
    .query(`INSERT INTO dbo.DccSnags (Id, Ref, ProjectId, Discipline, Location, Descr, RaisedBy, AssignedTo, Priority, Status, Created, Closed, Photo)
            VALUES (@id, @ref, @project, @discipline, @location, @desc, @raisedBy, @assignedTo, @priority, @status, @created, @closed, @photo)`);
  return getById(pool, s.id);
}

async function updateStatus(pool, id, status, closed) {
  await pool.request().input('id', id).input('status', status).input('closed', closed || null)
    .query('UPDATE dbo.DccSnags SET Status = @status, Closed = @closed WHERE Id = @id');
  return getById(pool, id);
}

module.exports = { getAll, getById, countForProject, insert, updateStatus };
