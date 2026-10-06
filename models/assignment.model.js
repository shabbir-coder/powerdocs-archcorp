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

async function canAccessProject(pool, projectId, personId, role) {
  console.log(`Checking access for person ${personId} on project ${projectId}`);
  const { recordset } = await pool.request()
    .input('project', projectId).input('person', personId).input('isAdmin', role === 'Admin' ? 1 : 0)
    .query(`SELECT TOP 1 1 AS Allowed
            FROM dbo.DccProjects p
            WHERE p.Id = @project AND p.IsActive = 1
              AND (@isAdmin = 1 OR EXISTS (
                SELECT 1 FROM dbo.DccProjectAssignments a
                WHERE a.ProjectId = p.Id AND a.PersonId = @person
              ))`);
  return recordset.length > 0;
}

async function getAccessibleProjectIds(pool, personId, role) {
  const request = pool.request().input('person', personId).input('isAdmin', role === 'Admin' ? 1 : 0);
  const { recordset } = await request.query(`SELECT p.Id
    FROM dbo.DccProjects p
    WHERE p.IsActive = 1
      AND (@isAdmin = 1 OR EXISTS (
        SELECT 1 FROM dbo.DccProjectAssignments a
        WHERE a.ProjectId = p.Id AND a.PersonId = @person
      ))`);
  return recordset.map((row) => row.Id);
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

module.exports = { getAll, getForProject, insertMany, canAccessProject, getAccessibleProjectIds, add, remove };
