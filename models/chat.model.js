const { sql } = require('../config/db');
const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

function mapRow(r) {
  return { id: r.Id, project: r.ProjectId, by: r.ByPerson, at: r.CreatedAt.toISOString(), text: r.Txt, kind: r.Kind };
}

// Same access rule as assignment.getAccessibleProjectIds, kept in SQL so the
// project filter just narrows it (a project you can't see stays invisible).
async function listAccessible(pool, personId, role, query) {
  const request = pool.request().input('person', personId).input('isAdmin', role === 'Admin' ? 1 : 0);
  const filters = new Filters(request, query)
    .raw(`EXISTS (SELECT 1 FROM dbo.DccProjects p WHERE p.Id = c.ProjectId AND p.IsActive = 1
            AND (@isAdmin = 1 OR EXISTS (SELECT 1 FROM dbo.DccProjectAssignments a WHERE a.ProjectId = p.Id AND a.PersonId = @person)))`)
    .search(['c.Txt'])
    .in('project', 'c.ProjectId').in('kind', 'c.Kind').in('by', 'c.ByPerson')
    .dateRange('dateFrom', 'dateTo', 'c.CreatedAt');
  const { rows, pagination } = await runList(request, {
    select: 'c.Id, c.ProjectId, c.ByPerson, c.Txt, c.Kind, c.CreatedAt', from: 'dbo.DccChatMessages c', filters,
    orderBy: parseSort(query, { at: 'c.CreatedAt' }, { key: 'at', order: 'asc' }, 'c.Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

// `since` reads forward from a timestamp (reconnect catch-up); otherwise the
// latest `limit` messages, optionally older than `before` (scroll-back paging).
async function getForProjectSince(pool, projectId, since, { before = null, limit = 500 } = {}) {
  const request = pool.request().input('project', projectId).input('limit', limit);
  const sinceClause = since ? 'AND CreatedAt >= @since' : '';
  const beforeClause = before ? 'AND CreatedAt < @before' : '';
  if (since) request.input('since', sql.DateTime2, new Date(since));
  if (before) request.input('before', sql.DateTime2, new Date(before));
  const order = since ? 'ASC' : 'DESC';
  const { recordset } = await request.query(`SELECT TOP (@limit) Id, ProjectId, ByPerson, Txt, Kind, CreatedAt
    FROM dbo.DccChatMessages
    WHERE ProjectId = @project ${sinceClause} ${beforeClause}
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

module.exports = { listAccessible, getForProjectSince, insert };
