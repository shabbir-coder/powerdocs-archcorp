const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

function mapRow(r) {
  return { project: r.ProjectId, disc: r.Disc, reviewer: r.ReviewerId, action: r.Action };
}

const SORTS = { project: 'ProjectId', disc: 'Disc', reviewer: 'ReviewerId', action: 'Action' };

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .in('project', 'ProjectId').in('disc', 'Disc').in('reviewer', 'ReviewerId').in('action', 'Action');
  const { rows, pagination } = await runList(request, {
    select: 'ProjectId, Disc, ReviewerId, Action', from: 'dbo.DccProjectDistribution', filters,
    orderBy: parseSort(query, SORTS, { key: 'project', order: 'asc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

async function insert(pool, row) {
  await pool.request()
    .input('project', row.project).input('disc', row.disc).input('reviewer', row.reviewer).input('action', row.action)
    .query(`INSERT INTO dbo.DccProjectDistribution (ProjectId, Disc, ReviewerId, Action)
            VALUES (@project, @disc, @reviewer, @action)`);
  return { disc: row.disc, reviewer: row.reviewer, action: row.action };
}

module.exports = { list, insert };
