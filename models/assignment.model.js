// Returns the flat rows; the assignment controller's list() groups them by
// ProjectId to match the frontend's `Record<string, Assignment[]>` shape.
async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT ProjectId, PersonId, PersonType FROM dbo.DccProjectAssignments');
  return recordset.map((r) => ({ project: r.ProjectId, a: r.PersonId, t: r.PersonType }));
}

async function insertMany(pool, assignmentsByProject) {
  for (const [projectId, list] of Object.entries(assignmentsByProject)) {
    for (const a of list) {
      const exists = await pool.request()
        .input('project', projectId).input('person', a.a)
        .query('SELECT 1 FROM dbo.DccProjectAssignments WHERE ProjectId = @project AND PersonId = @person');
      if (exists.recordset.length) continue;
      await pool.request()
        .input('project', projectId).input('person', a.a).input('type', a.t)
        .query('INSERT INTO dbo.DccProjectAssignments (ProjectId, PersonId, PersonType) VALUES (@project, @person, @type)');
    }
  }
}

async function getForProject(pool, projectId) {
  const { recordset } = await pool.request().input('project', projectId)
    .query('SELECT PersonId, PersonType FROM dbo.DccProjectAssignments WHERE ProjectId = @project');
  return recordset.map((r) => ({ a: r.PersonId, t: r.PersonType }));
}

async function add(pool, projectId, personId, personType) {
  const exists = await pool.request()
    .input('project', projectId).input('person', personId)
    .query('SELECT 1 FROM dbo.DccProjectAssignments WHERE ProjectId = @project AND PersonId = @person');
  if (exists.recordset.length) return;
  await pool.request()
    .input('project', projectId).input('person', personId).input('type', personType)
    .query('INSERT INTO dbo.DccProjectAssignments (ProjectId, PersonId, PersonType) VALUES (@project, @person, @type)');
}

async function remove(pool, projectId, personId) {
  await pool.request().input('project', projectId).input('person', personId)
    .query('DELETE FROM dbo.DccProjectAssignments WHERE ProjectId = @project AND PersonId = @person');
}

module.exports = { getAll, getForProject, insertMany, add, remove };
