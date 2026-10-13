const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

// Returns the flat rows; the assignment controller's list() groups them by
// ProjectId to match the frontend's `Record<string, Assignment[]>` shape.
// Paging counts assignment rows, not projects — a project's team can span two pages.
async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .in('project', 'ProjectId').in('person', 'PersonId').in('type', 'PersonType');
  const { rows, pagination } = await runList(request, {
    select: 'ProjectId, PersonId, PersonType', from: 'dbo.DccProjectAssignments', filters,
    orderBy: parseSort(query, { project: 'ProjectId', person: 'PersonId' }, { key: 'project', order: 'asc' }, 'Id'),
    paging: parsePaging(query),
  });
  return { items: rows.map((r) => ({ project: r.ProjectId, a: r.PersonId, t: r.PersonType })), pagination };
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

module.exports = { list, getForProject, insertMany, canAccessProject, getAccessibleProjectIds, add, remove };
