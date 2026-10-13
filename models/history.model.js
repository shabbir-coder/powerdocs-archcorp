const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

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

const SORTS = { at: 'At', action: 'Action', actor: 'Actor', round: 'Round' };

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .search(['Comment', 'Action'])
    .in('doc', 'DocumentId').in('project', 'ProjectId').in('action', 'Action').in('actor', 'Actor')
    .in('role', 'Role').intIn('round', 'Round')
    .dateRange('dateFrom', 'dateTo', 'At');
  const { rows, pagination } = await runList(request, {
    select: 'Id, DocumentId, ProjectId, At, Action, Actor, Role, Round, Comment', from: 'dbo.DccDocumentHistory', filters,
    orderBy: parseSort(query, SORTS, { key: 'at', order: 'asc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
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

module.exports = { list, insert, mapRow };
