function mapRow(r) {
  return {
    id: r.Id,
    pid: r.Pid,
    name: r.Name,
    client: r.ClientId,
    city: r.City,
    status: r.Status,
    start: r.StartDate.toISOString().slice(0, 10),
    workflow: r.Workflow || undefined,
    disciplines: r.Disciplines ? r.Disciplines.split(',').filter(Boolean) : undefined,
    categories: r.Categories ? r.Categories.split(',').filter(Boolean) : undefined,
    numbering: r.Numbering || undefined,
    numberingConfig: r.NumberingConfig ? JSON.parse(r.NumberingConfig) : undefined,
    accId: r.AccId || undefined,
  };
}

const COLUMNS = 'Id, Pid, Name, ClientId, City, Status, StartDate, Workflow, Disciplines, Categories, Numbering, NumberingConfig, AccId';

async function getAll(pool) {
  const { recordset } = await pool.request().query(`SELECT ${COLUMNS} FROM dbo.DccProjects WHERE IsActive = 1 ORDER BY Pid`);
  return recordset.map(mapRow);
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query(`SELECT ${COLUMNS} FROM dbo.DccProjects WHERE Id = @id`);
  return recordset.length ? mapRow(recordset[0]) : null;
}

async function insertMany(pool, projects) {
  for (const p of projects) {
    await pool.request()
      .input('id', p.id).input('pid', p.pid).input('name', p.name).input('client', p.client)
      .input('city', p.city).input('status', p.status).input('start', p.start)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccProjects WHERE Id = @id)
              INSERT INTO dbo.DccProjects (Id, Pid, Name, ClientId, City, Status, StartDate)
              VALUES (@id, @pid, @name, @client, @city, @status, @start)`);
  }
}

async function insert(pool, p) {
  await pool.request()
    .input('id', p.id).input('pid', p.pid).input('name', p.name).input('client', p.client)
    .input('city', p.city).input('status', p.status).input('start', p.start)
    .input('workflow', p.workflow || null)
    .input('disciplines', p.disciplines?.length ? p.disciplines.join(',') : null)
    .input('categories', p.categories?.length ? p.categories.join(',') : null)
    .input('numbering', p.numbering || null)
    .input('numberingConfig', p.numberingConfig ? JSON.stringify(p.numberingConfig) : null)
    .input('accId', p.accId || null)
    .query(`INSERT INTO dbo.DccProjects (Id, Pid, Name, ClientId, City, Status, StartDate, Workflow, Disciplines, Categories, Numbering, NumberingConfig, AccId)
            VALUES (@id, @pid, @name, @client, @city, @status, @start, @workflow, @disciplines, @categories, @numbering, @numberingConfig, @accId)`);
  return getById(pool, p.id);
}

async function update(pool, id, p) {
  await pool.request()
    .input('id', id).input('pid', p.pid).input('name', p.name).input('client', p.client)
    .input('city', p.city).input('status', p.status).input('start', p.start)
    .query(`UPDATE dbo.DccProjects SET Pid = @pid, Name = @name, ClientId = @client, City = @city,
            Status = @status, StartDate = @start WHERE Id = @id`);
  return getById(pool, id);
}

async function updateEnrichment(pool, id, p) {
  await pool.request()
    .input('id', id).input('workflow', p.workflow || null)
    .input('disciplines', p.disciplines?.length ? p.disciplines.join(',') : null)
    .input('categories', p.categories?.length ? p.categories.join(',') : null)
    .input('numbering', p.numbering || null)
    .input('numberingConfig', p.numberingConfig ? JSON.stringify(p.numberingConfig) : null)
    .query(`UPDATE dbo.DccProjects SET Workflow = @workflow, Disciplines = @disciplines, Categories = @categories,
            Numbering = @numbering, NumberingConfig = @numberingConfig WHERE Id = @id`);
  return getById(pool, id);
}

async function remove(pool, id) {
  await pool.request().input('id', id).query('UPDATE dbo.DccProjects SET IsActive = 0 WHERE Id = @id');
}

module.exports = { getAll, getById, insertMany, insert, update, updateEnrichment, remove };
