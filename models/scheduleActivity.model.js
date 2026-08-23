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

async function getAll(pool) {
  const { recordset } = await pool.request().query(`SELECT ${COLUMNS} FROM dbo.DccScheduleActivities ORDER BY ProjectId, StartDate`);
  return recordset.map(mapRow);
}

async function insert(pool, a) {
  await pool.request()
    .input('id', a.id).input('project', a.project).input('wbs', a.wbs).input('name', a.name).input('disc', a.disc)
    .input('start', a.start).input('finish', a.finish).input('critical', !!a.critical).input('float', a.float)
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccScheduleActivities WHERE Id = @id)
            INSERT INTO dbo.DccScheduleActivities (Id, ProjectId, Wbs, Name, Disc, StartDate, FinishDate, Critical, FloatDays)
            VALUES (@id, @project, @wbs, @name, @disc, @start, @finish, @critical, @float)`);
}

module.exports = { getAll, insert };
