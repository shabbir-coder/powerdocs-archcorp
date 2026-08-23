function mapRow(r) {
  return { project: r.ProjectId, disc: r.Disc, reviewer: r.ReviewerId, action: r.Action };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT ProjectId, Disc, ReviewerId, Action FROM dbo.DccProjectDistribution');
  return recordset.map(mapRow);
}

async function insert(pool, row) {
  await pool.request()
    .input('project', row.project).input('disc', row.disc).input('reviewer', row.reviewer).input('action', row.action)
    .query(`INSERT INTO dbo.DccProjectDistribution (ProjectId, Disc, ReviewerId, Action)
            VALUES (@project, @disc, @reviewer, @action)`);
  return { disc: row.disc, reviewer: row.reviewer, action: row.action };
}

module.exports = { getAll, insert };
