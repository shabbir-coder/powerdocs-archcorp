const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

function mapRow(r) {
  return {
    id: r.Id,
    project: r.ProjectId,
    wbs: r.Wbs,
    name: r.Name,
    disc: r.Disc,
    start: r.StartDate.toISOString(),
    finish: r.FinishDate.toISOString(),
    critical: r.Critical,
    float: r.FloatDays,
  };
}

const COLUMNS = 'Id, ProjectId, Wbs, Name, Disc, StartDate, FinishDate, Critical, FloatDays';

const SORTS = {
  start: ['ProjectId', 'StartDate'], finish: 'FinishDate', name: 'Name', wbs: 'Wbs', float: 'FloatDays', project: 'ProjectId',
};

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .search(['Name', 'Wbs'])
    .in('project', 'ProjectId').in('disc', 'Disc').in('wbs', 'Wbs').bool('critical', 'Critical')
    .dateRange('startFrom', 'startTo', 'StartDate').dateRange('finishFrom', 'finishTo', 'FinishDate');
  const { rows, pagination } = await runList(request, {
    select: COLUMNS, from: 'dbo.DccScheduleActivities', filters,
    orderBy: parseSort(query, SORTS, { key: 'start', order: 'asc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

async function insert(pool, a) {
  await pool.request()
    .input('id', a.id).input('project', a.project).input('wbs', a.wbs).input('name', a.name).input('disc', a.disc)
    .input('start', a.start).input('finish', a.finish).input('critical', !!a.critical).input('float', a.float)
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccScheduleActivities WHERE Id = @id)
            INSERT INTO dbo.DccScheduleActivities (Id, ProjectId, Wbs, Name, Disc, StartDate, FinishDate, Critical, FloatDays)
            VALUES (@id, @project, @wbs, @name, @disc, @start, @finish, @critical, @float)`);
}

module.exports = { list, insert };
